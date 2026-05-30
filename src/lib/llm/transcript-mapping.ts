import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { format } from "date-fns";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import { FilledProbeFormSchema } from "@/types/index";
import type { TranscriptSegment, QuestionPlan, FilledProbeForm } from "@/types/index";
import type { RoleSchema } from "@/lib/probeform/types";
import { flattenRows } from "@/lib/probeform/types";
import { log } from "@/lib/logger";

// JSON shape skeleton for jsonMode providers (DeepSeek). When the API
// can't enforce a Zod-derived JSON schema strictly, the prompt has to
// carry the shape itself.
const FILLED_FORM_SHAPE = `{
  "roleId": "<the roleId string passed below>",
  "header": {
    "candidateName": "<string>",
    "totalYears": <number>,
    "relevantYears": <number>,
    "interviewedFor": "<string>",
    "evaluationDate": "<MM/DD/YYYY>",
    "interviewerName": "<string>",
    "interviewerOid": "<string>",
    "interviewOutcome": "Selected" | "Rejected" | "Needs Another Round",
    "selectedForLevel": "<one of Experience Engineer L1/L2/Senior Experience Engineer/Lead Experience Engineer/Manager Experience Engineering/REJECTED/Thinking>",
    "rejectionReason": "<string, optional>",
    "sectionsToBeTrainedOn": "<string, optional>",
    "domainFeedbackSummary": "<4-8 sentence narrative paragraph>",
    "teachableSkillGapDetails": "<string, optional>",
    "handsOnExerciseId": "<string, optional>"
  },
  "competencies": [
    {
      "rowIndex": <integer matching one of the rows above>,
      "rubricType": "architecture" | "development",
      "proficiency": "<EXACT string from the rubric vocab above — including trailing spaces and the typo 'theoritically'>",
      "feedbackDetails": "<1-3 sentence feedback, or '-' if 'Did not probe'>",
      "evidenceQuotes": ["<optional verbatim candidate quote>", "..."]
    }
  ]
}`;

function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const time = s.startTime.length > 8 ? s.startTime.slice(11, 19) : s.startTime;
      return `${s.speaker} (${time}): ${s.text}`;
    })
    .join("\n");
}

export async function mapTranscriptToProbeForm(input: {
  schema: RoleSchema;
  candidateName: string;
  roleAppliedFor: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  transcript: TranscriptSegment[];
  questionPlan: QuestionPlan;
  /** Budget-tracker: associates this call with an interview in /api/usage. */
  interviewId?: string;
}): Promise<FilledProbeForm> {
  const { schema, candidateName, roleAppliedFor, candidateTotalYears, candidateRelevantYears, transcript, questionPlan, interviewId } = input;
  const rows = flattenRows(schema);
  const rowsJson = JSON.stringify(rows, null, 2);
  const questionsJson = JSON.stringify(questionPlan.questions, null, 2);
  const transcriptText = transcriptToText(transcript);

  // Category outline mirrors what generateQuestionPlan emits — helps the
  // LLM keep its mental model organized when there are 27+ rows.
  const categoryOutline = schema.categories
    .map((c) => `- ${c.name}: rows ${c.rows.map((r) => r.rowIndex).join(", ")}`)
    .join("\n");

  const systemPrompt = `You are a senior hiring panel member at Publicis Sapient reviewing a candidate interview transcript. Your task is to fill out the PS Experience Engineering Hiring Probe Form based on the conversation that took place.

For each competency row of the ${schema.displayName} probe form, you will:

1. Choose a proficiency level from the EXACT vocabulary for that row's rubric type. The two rubrics use DIFFERENT exact strings — match them character-for-character including spaces and any typos.

Architecture rubric (used by some rows):
- "Did not probe"
- "No Experience"
- "Awareness of concepts " (trailing space)
- "Able to explain concepts in depth " (trailing space)
- "Confident with decision making & hands on " (trailing space)

Development rubric (used by other rows):
- "Did not probe"
- "No Experience"
- "Able to explain concepts theoritically" (note: typo "theoritically" is intentional, match exactly)
- "Able to code with guidance"
- "Confident hands on developer"

2. Write 1–3 sentences of feedback for the row in feedbackDetails. Reference specific things the candidate said. Be honest — don't pad a weak answer; don't downplay a strong one.

3. If the conversation didn't touch a row's topic at all, choose "Did not probe" and write feedbackDetails: "-".

The probe form is organized into these categories:
${categoryOutline}

Full competency rows for this role:
${rowsJson}

The interview's planned questions were:
${questionsJson}

After scoring all rows:

4. Write a domainFeedbackSummary — a 4–8 sentence narrative paragraph summarizing the interview. Mention 2–3 specific strengths and 2–3 specific weaknesses. This goes in cell D10 of the Excel.

5. Choose an interviewOutcome — one of "Selected", "Rejected", or "Needs Another Round" — based on the rubric outcomes.

6. Suggest a selectedForLevel (Career Stage). Allowed: "Experience Engineer L1", "Experience Engineer L2", "Senior Experience Engineer", "Lead Experience Engineer", or "REJECTED".

7. If outcome is "Rejected", provide a rejectionReason. Allowed: "Lacked Fundamentals", "No Hands on Experience", "Gaps in multiple categories".

8. Optionally fill sectionsToBeTrainedOn and teachableSkillGapDetails to indicate growth areas.

Be fair, evidence-anchored, and rigorous. Use the full range of the proficiency scale. Do NOT over-rate weak candidates to be nice.

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${FILLED_FORM_SHAPE}

The "roleId" field MUST be exactly the string "${schema.roleId}". Every "rowIndex" MUST match one of the rowIndex values from the rows list above. Every "proficiency" MUST be one of the EXACT strings from the architecture or development rubric vocab above (match character-for-character including trailing spaces and the 'theoritically' typo).`;

  const humanPrompt = `Candidate: ${candidateName}
Role applied for: ${roleAppliedFor}
Total years experience: ${candidateTotalYears}
Relevant years experience: ${candidateRelevantYears}
Role: ${schema.displayName} (${schema.roleId})

Transcript (audio + chat, interleaved chronologically):
---
${transcriptText}
---

Now fill out the probe form.`;

  const model = getChatModel(0.2, { interviewId, purpose: "transcript-mapping" });
  const method = structuredOutputMethod();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let result: unknown;
      try {
        const structured = method
          ? model.withStructuredOutput(FilledProbeFormSchema, { method })
          : model.withStructuredOutput(FilledProbeFormSchema);
        result = await structured.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(humanPrompt),
        ]);
        result = FilledProbeFormSchema.parse(result);
      } catch {
        const raw = await model.invoke([
          new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above. No prose, no markdown fences."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Model returned no parseable JSON for probe form");
        result = FilledProbeFormSchema.parse(JSON.parse(jsonMatch[0]));
      }

      // Override with authoritative metadata
      const parsed = result as FilledProbeForm;
      parsed.roleId = schema.roleId;
      parsed.header.candidateName   = candidateName;
      parsed.header.interviewedFor  = roleAppliedFor;
      parsed.header.totalYears      = candidateTotalYears;
      parsed.header.relevantYears   = candidateRelevantYears;
      parsed.header.evaluationDate  = format(new Date(), "MM/dd/yyyy");
      parsed.header.interviewerName = "Medha";
      parsed.header.interviewerOid  = "AI-001";

      return FilledProbeFormSchema.parse(parsed) as FilledProbeForm;
    } catch (err) {
      log.warn({ attempt: attempt + 1, err: String(err) }, "Transcript mapping attempt failed");
      if (attempt === 2) throw err;
    }
  }

  throw new Error("mapTranscriptToProbeForm failed after 3 attempts");
}
