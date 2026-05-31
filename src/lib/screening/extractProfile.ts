// ============================================================
// Phase J — extract candidate profile from resume text via LLM.
//
// Mirrors the structured-output + plain-JSON fallback pattern from
// question-plan.ts and branching.ts. Temperature 0.1 because extraction
// should be deterministic — we're pulling facts from the text, not
// generating creative content.
// ============================================================
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import { CandidateProfileSchema } from "@/types/index";
import type { CandidateProfile } from "@/types/index";
import { getRoleSchema } from "@/lib/probeform/registry";
import { log } from "@/lib/logger";

const PROFILE_SHAPE = `{
  "candidateName": "<string from the resume — first + last name>",
  "candidateEmail": "<best-effort email from the resume, or empty string if not found>",
  "candidateTotalYears": <number, total years of professional experience>,
  "candidateRelevantYears": <number, years specifically relevant to roleAppliedFor — never greater than candidateTotalYears>,
  "roleAppliedFor": "<human-readable role title, e.g. 'Senior React Engineer' — derive from candidate's most recent role + the target role's display name>",
  "keySkills": ["<5-10 specific stack items — libraries, languages, services, frameworks. NOT generic skills like 'good communicator'>"],
  "notableProjects": ["<2-4 one-line summaries lifted verbatim from the resume — real work, not invented>"]
}`;

export async function extractCandidateProfile(
  resumeText: string,
  roleId: string,
  jdText?: string
): Promise<CandidateProfile> {
  const roleSchema = getRoleSchema(roleId);
  const roleDisplay = roleSchema?.displayName ?? roleId;

  const systemPrompt = `You are an expert technical recruiter extracting structured candidate profile data from a resume for the role of ${roleDisplay}.

Your job is to extract honestly. Do NOT invent fields. If a field can't be confidently extracted from the resume text:
- Use empty string "" for missing strings.
- Use 0 for missing numeric counts.
- Use empty array [] for missing lists.

Rules:
- candidateRelevantYears MUST be ≤ candidateTotalYears. If the candidate has 10 years total but only 3 in the target role's stack, return 10 and 3 respectively.
- keySkills must be SPECIFIC stack items (e.g. "React", "TypeScript", "Postgres", "AWS Lambda"). Not generic skills ("good communicator", "team player").
- notableProjects must be lifted from the resume — one line each. If the resume is sparse, fewer is better than inventing.
- roleAppliedFor is a human-readable seniority + stack composition. Look at the candidate's most recent title and the target role display name (${roleDisplay}) to derive a sensible match.

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${PROFILE_SHAPE}`;

  const humanPrompt = `Target role: ${roleDisplay} (roleId: ${roleId})
${jdText ? `\nJob description:\n${jdText}\n` : ""}
Resume text:
---
${resumeText}
---

Extract the profile now.`;

  const model = getChatModel(0.1, { purpose: "screening-extract" });
  const method = structuredOutputMethod();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let result: unknown;
      try {
        const structured = method
          ? model.withStructuredOutput(CandidateProfileSchema, { method })
          : model.withStructuredOutput(CandidateProfileSchema);
        result = await structured.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(humanPrompt),
        ]);
        result = CandidateProfileSchema.parse(result);
      } catch {
        const raw = await model.invoke([
          new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above. No prose, no markdown fences."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Model returned no parseable JSON for candidate profile");
        result = CandidateProfileSchema.parse(JSON.parse(jsonMatch[0]));
      }

      const parsed = result as CandidateProfile;
      // Defensive: ensure candidateRelevantYears never exceeds total.
      if (parsed.candidateRelevantYears > parsed.candidateTotalYears) {
        parsed.candidateRelevantYears = parsed.candidateTotalYears;
      }
      return parsed;
    } catch (err) {
      log.warn(
        { attempt: attempt + 1, err: err instanceof Error ? err.message : String(err) },
        "extractCandidateProfile attempt failed"
      );
      if (attempt === 1) throw err;
    }
  }

  throw new Error("extractCandidateProfile failed after 2 attempts");
}
