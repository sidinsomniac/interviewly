// ============================================================
// Phase J — score the candidate against the role rubric via LLM.
//
// Temperature 0.3 (lean reasoning); 2 retries with Zod validation.
// Outputs a verdict + reasoning + recommendedDifficultyBias that
// flows into the question planner downstream.
// ============================================================
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import { ScreeningScoreSchema } from "@/types/index";
import type { CandidateProfile, ScreeningScore } from "@/types/index";
import { flattenRows } from "@/lib/probeform/types";
import type { RoleSchema } from "@/lib/probeform/types";
import { log } from "@/lib/logger";

const SCORE_SHAPE = `{
  "verdict": "selected" | "rejected" | "borderline",
  "confidence": <number 0-1, how certain you are about the verdict — NOT about the candidate's fitness>,
  "strengths": ["<2-4 bullets — each referencing a SPECIFIC competency from the rubric, not generic platitudes>"],
  "gaps": ["<2-4 bullets — each referencing a SPECIFIC competency the candidate is missing>"],
  "summary": "<2-3 sentences synthesizing the verdict, with evidence>",
  "recommendedDifficultyBias": "easy" | "medium" | "hard"
}`;

export async function scoreCandidate(
  profile: CandidateProfile,
  roleSchema: RoleSchema,
  jdText?: string
): Promise<ScreeningScore> {
  const rows = flattenRows(roleSchema);
  const rubricJson = JSON.stringify(
    rows.map((r) => ({
      rowIndex: r.rowIndex,
      competencyName: r.competencyName,
      rubricType: r.rubricType,
    })),
    null,
    2
  );

  const systemPrompt = `You are a senior hiring panel member at Publicis Sapient scoring a candidate for the ${roleSchema.displayName} role. Decide whether to advance them to an interview based on resume signal alone.

Be honest. Lean "borderline" when uncertain — that's the right call when the resume is thin or ambiguous. "selected" requires clear evidence the candidate covers most of the rubric's competencies. "rejected" requires clear evidence of major gaps.

Rules:
1. Strengths and gaps must reference SPECIFIC competency rows from the rubric below (by name). Avoid generic praise like "great communicator" or "good team player".
2. confidence is about YOUR certainty in the verdict, not the candidate's fitness. A clear "selected" or "rejected" verdict from a comprehensive resume → confidence near 1.0. A "borderline" call with sparse resume → confidence near 0.3-0.5.
3. recommendedDifficultyBias drives the interview's question difficulty:
   - "hard" if candidateRelevantYears >= 5 AND verdict is "selected"
   - "easy" if candidateRelevantYears < 2 OR verdict is "borderline"
   - "medium" otherwise
4. summary is 2-3 sentences synthesizing the verdict with evidence from the candidate's stated skills and projects.

Rubric (the competency rows this role probes):
${rubricJson}

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${SCORE_SHAPE}`;

  const humanPrompt = `Candidate profile:
${JSON.stringify(profile, null, 2)}
${jdText ? `\nJob description:\n${jdText}\n` : ""}
Score the candidate now.`;

  const model = getChatModel(0.3, { purpose: "screening-score" });
  const method = structuredOutputMethod();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let result: unknown;
      try {
        const structured = method
          ? model.withStructuredOutput(ScreeningScoreSchema, { method })
          : model.withStructuredOutput(ScreeningScoreSchema);
        result = await structured.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(humanPrompt),
        ]);
        result = ScreeningScoreSchema.parse(result);
      } catch {
        const raw = await model.invoke([
          new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above. No prose, no markdown fences."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Model returned no parseable JSON for screening score");
        result = ScreeningScoreSchema.parse(JSON.parse(jsonMatch[0]));
      }

      return result as ScreeningScore;
    } catch (err) {
      log.warn(
        { attempt: attempt + 1, err: err instanceof Error ? err.message : String(err) },
        "scoreCandidate attempt failed"
      );
      if (attempt === 1) throw err;
    }
  }

  throw new Error("scoreCandidate failed after 2 attempts");
}
