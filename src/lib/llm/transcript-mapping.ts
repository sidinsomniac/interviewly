import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { format } from "date-fns";
import { getChatModel } from "@/lib/llm";
import { ROWS_BY_ROUND } from "@/lib/probeform/rows";
import { FilledProbeFormSchema } from "@/types/index";
import type { InterviewRound, TranscriptSegment, QuestionPlan, FilledProbeForm } from "@/types/index";
import { log } from "@/lib/logger";

function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const time = s.startTime.length > 8 ? s.startTime.slice(11, 19) : s.startTime;
      return `${s.speaker} (${time}): ${s.text}`;
    })
    .join("\n");
}

export async function mapTranscriptToProbeForm(input: {
  round: InterviewRound;
  candidateName: string;
  roleAppliedFor: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  transcript: TranscriptSegment[];
  questionPlan: QuestionPlan;
}): Promise<FilledProbeForm> {
  const { round, candidateName, roleAppliedFor, candidateTotalYears, candidateRelevantYears, transcript, questionPlan } = input;
  const rows = ROWS_BY_ROUND[round];
  const rowsJson = JSON.stringify(rows, null, 2);
  const questionsJson = JSON.stringify(questionPlan.questions, null, 2);
  const transcriptText = transcriptToText(transcript);

  const systemPrompt = `You are a senior hiring panel member at Publicis Sapient reviewing a candidate interview transcript. Your task is to fill out the PS Experience Engineering Hiring Probe Form based on the conversation that took place.

For each competency row in the ${round} round, you will:

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

The competency rows for this round are:
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

Output ONLY a structured JSON conforming to the FilledProbeFormSchema.`;

  const humanPrompt = `Candidate: ${candidateName}
Role applied for: ${roleAppliedFor}
Total years experience: ${candidateTotalYears}
Relevant years experience: ${candidateRelevantYears}
Round: ${round}

Transcript (audio + chat, interleaved chronologically):
---
${transcriptText}
---

Now fill out the probe form.`;

  const model = getChatModel(0.2);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let result: unknown;
      try {
        const structured = model.withStructuredOutput(FilledProbeFormSchema);
        result = await structured.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(humanPrompt),
        ]);
      } catch {
        const raw = await model.invoke([
          new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the FilledProbeFormSchema."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("LLM returned no JSON for probe form");
        result = FilledProbeFormSchema.parse(JSON.parse(jsonMatch[0]));
      }

      // Inject fields not set by LLM
      const parsed = result as FilledProbeForm;
      parsed.round = round;
      parsed.header.candidateName   = candidateName;
      parsed.header.interviewedFor  = roleAppliedFor;
      parsed.header.totalYears      = candidateTotalYears;
      parsed.header.relevantYears   = candidateRelevantYears;
      parsed.header.evaluationDate  = format(new Date(), "MM/dd/yyyy");
      parsed.header.interviewerName = "Interviewly Bot";
      parsed.header.interviewerOid  = "AI-001";

      return FilledProbeFormSchema.parse(parsed) as FilledProbeForm;
    } catch (err) {
      log.warn({ attempt: attempt + 1, err: String(err) }, "Transcript mapping attempt failed");
      if (attempt === 2) throw err;
    }
  }

  throw new Error("mapTranscriptToProbeForm failed after 3 attempts");
}
