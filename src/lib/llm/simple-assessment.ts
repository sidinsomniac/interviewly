// ============================================================
// Phase-P3 (2026-06-01) — simple-assessment mapper for non-technical
// roles (customer-service). Produces a charitable, fixed-vocabulary
// rating per competency from the interview transcript, plus a
// recommendation. Verdict + confidence are computed in CODE from the
// rating mix (not by the LLM) so the thresholds are deterministic.
//
// Mirrors transcript-mapping.ts plumbing (getChatModel, structured
// output with JSON-mode fallback) but returns a SimpleAssessment, not
// a FilledProbeForm — the CS rating vocab ("Exceeds/Meets/Below/Not
// assessed") doesn't fit the typed CompetencyEvaluation proficiency
// enum, and the simple probe form is built from scratch (no template).
// ============================================================
import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { format } from "date-fns";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import type {
  TranscriptSegment,
  SimpleAssessment,
  SimpleAssessmentRow,
  FilledProbeForm,
  InterviewMetadata,
} from "@/types/index";
import type { RoleSchema } from "@/lib/probeform/types";
import { log } from "@/lib/logger";

const RATINGS = [
  "Exceeds expectations",
  "Meets expectations",
  "Below expectations",
  "Not assessed",
] as const;

const SimpleRowSchema = z.object({
  category: z.string(),
  competency: z.string(),
  rating: z.enum(RATINGS),
  evidence: z.string(),
  notes: z.string(),
});
const SimpleLlmSchema = z.object({
  rows: z.array(SimpleRowSchema),
  recommendation: z.string(),
});

const SIMPLE_SHAPE = `{
  "rows": [
    {
      "category": "<the category string given below, verbatim>",
      "competency": "<the competency string given below, verbatim>",
      "rating": "Exceeds expectations" | "Meets expectations" | "Below expectations" | "Not assessed",
      "evidence": "<1-line quote/paraphrase from the transcript, or 'Inferred from overall communication style.'>",
      "notes": "<short optional note, may be empty string>"
    }
  ],
  "recommendation": "<2-3 sentence hiring recommendation>"
}`;

function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const time = s.startTime.length > 8 ? s.startTime.slice(11, 19) : s.startTime;
      return `${s.speaker} (${time}): ${s.text}`;
    })
    .join("\n");
}

/** Phase-P3 — derive verdict + confidence from the rating mix (G5). */
function computeVerdict(rows: SimpleAssessmentRow[]): { verdict: SimpleAssessment["verdict"]; confidence: number } {
  const passing = rows.filter(
    (r) => r.rating === "Meets expectations" || r.rating === "Exceeds expectations"
  ).length;
  const ratio = rows.length ? passing / rows.length : 0;
  if (ratio >= 0.6) {
    return { verdict: "Selected", confidence: 0.75 + 0.1 * Math.min(1, (ratio - 0.6) / 0.4) };
  }
  if (ratio >= 0.4) {
    return { verdict: "Borderline", confidence: 0.55 + 0.15 * ((ratio - 0.4) / 0.2) };
  }
  return { verdict: "Needs Another Round", confidence: 0.6 + 0.15 * (1 - ratio / 0.4) };
}

export async function mapTranscriptToSimpleAssessment(input: {
  schema: RoleSchema;
  candidateName: string;
  roleAppliedFor: string;
  transcript: TranscriptSegment[];
  /** Budget-tracker: associates this call with an interview in /api/usage. */
  interviewId?: string;
}): Promise<SimpleAssessment> {
  const { schema, candidateName, roleAppliedFor, transcript, interviewId } = input;

  // Authoritative (category, competency) list — the LLM rates these in order.
  const competencyList = schema.categories.flatMap((cat) =>
    cat.rows.map((r) => ({ category: cat.name, competency: r.competencyName }))
  );
  const competencyJson = JSON.stringify(competencyList, null, 2);
  const transcriptText = transcriptToText(transcript);

  const systemPrompt = `You are scoring a candidate for an entry-level customer service role at Publicis Sapient. For each competency row, choose a Rating from:
- "Exceeds expectations" — clear evidence the candidate demonstrated this competency well during the interview
- "Meets expectations" — basic evidence or reasonable inference from the candidate's overall demeanor
- "Below expectations" — direct evidence the candidate struggled here
- "Not assessed" — no relevant signal in the transcript

Be charitable. This is an entry-level role; bar is intent + basic communication, not depth. If the candidate engaged warmly and answered the questions reasonably, default to "Meets expectations" for soft-skill rows even without direct evidence. Reserve "Below expectations" for clear, direct red flags (refused to engage, dishonest, hostile).

Evidence should be a 1-line quote or paraphrase from the transcript when available. Otherwise: "Inferred from overall communication style."

Rate EXACTLY these competencies, in this order, copying the category + competency strings verbatim:
${competencyJson}

Also write a 2-3 sentence overall hiring recommendation.

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${SIMPLE_SHAPE}`;

  const humanPrompt = `Candidate: ${candidateName}
Role applied for: ${roleAppliedFor}

Transcript (audio + chat, interleaved chronologically):
---
${transcriptText}
---

Now rate every competency and write the recommendation.`;

  const model = getChatModel(0.3, { interviewId, purpose: "simple-assessment" });
  const method = structuredOutputMethod();

  let llm: z.infer<typeof SimpleLlmSchema> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      try {
        const structured = method
          ? model.withStructuredOutput(SimpleLlmSchema, { method })
          : model.withStructuredOutput(SimpleLlmSchema);
        llm = SimpleLlmSchema.parse(
          await structured.invoke([new SystemMessage(systemPrompt), new HumanMessage(humanPrompt)])
        );
      } catch {
        const raw = await model.invoke([
          new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above. No prose, no markdown fences."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("simple-assessment: no parseable JSON");
        llm = SimpleLlmSchema.parse(JSON.parse(jsonMatch[0]));
      }
      break;
    } catch (err) {
      log.warn({ attempt: attempt + 1, err: String(err) }, "simple-assessment attempt failed");
      if (attempt === 1) {
        // Booth-safe fallback — never throw out of finalize. All "Not
        // assessed" → Needs Another Round, generic recommendation.
        llm = null;
      }
    }
  }

  // Align the LLM rows to the authoritative competency list by index;
  // overwrite category/competency from our list (the LLM occasionally
  // paraphrases them). Missing/extra rows are padded/truncated to the
  // 16 competencies. On total failure → all "Not assessed".
  const rows: SimpleAssessmentRow[] = competencyList.map((c, i) => {
    const r = llm?.rows[i];
    return {
      category: c.category,
      competency: c.competency,
      rating: r?.rating ?? "Not assessed",
      evidence: r?.evidence ?? "Inferred from overall communication style.",
      notes: r?.notes ?? "",
    };
  });

  const { verdict, confidence } = computeVerdict(rows);
  const recommendation =
    llm?.recommendation?.trim() ||
    `${candidateName} was assessed across ${rows.length} customer-service competencies. Overall verdict: ${verdict}.`;

  return { rows, verdict, confidence, recommendation };
}

/**
 * Phase-P3 — synthesize a minimal valid FilledProbeForm from a
 * SimpleAssessment so the result page's summary card keeps working for
 * customer-service (it reads `filledForm.header.domainFeedbackSummary`).
 * The xlsx itself is built separately by generateSimpleProbeForm from the
 * assessment rows — this is purely for the on-screen summary. competencies
 * is empty (the result page doesn't render competency rows).
 */
export function synthesizeFilledForm(
  interview: InterviewMetadata,
  assessment: SimpleAssessment
): FilledProbeForm {
  // InterviewOutcome has no "Borderline" — map it to the closest typed value.
  const outcome =
    assessment.verdict === "Selected" ? "Selected" : "Needs Another Round";
  return {
    roleId: interview.roleId,
    header: {
      candidateName: interview.candidateName,
      totalYears: interview.candidateTotalYears,
      relevantYears: interview.candidateRelevantYears,
      interviewedFor: interview.roleAppliedFor,
      evaluationDate: format(new Date(), "MM/dd/yyyy"),
      interviewerName: "Medha",
      interviewerOid: "AI-001",
      interviewOutcome: outcome,
      domainFeedbackSummary: assessment.recommendation,
    },
    competencies: [],
  };
}
