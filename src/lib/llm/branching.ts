// ============================================================
// Scope Y — branching decision via DeepSeek.
//
// Called when a candidate's final transcript chunk arrives at
// /api/interviews/[id]/live-transcript. Decides whether to ask
// a branching follow-up question (probing depth on a specific
// claim) or continue to the next planned question.
//
// Hard cap: 2 branches per planned question, enforced both by the
// caller (autoConductor.handleBranching counts branchingHistory)
// and by the LLM prompt itself ("if priorBranches >= 2 return
// action: continue regardless").
//
// Pattern mirrors question-plan.ts: structured output via Zod with
// jsonMode for DeepSeek, plain-JSON fallback if the structured path
// fails. Null tolerated on branchQuestionText (DeepSeek's quirk —
// see Sub-Phase A exerciseUrl fix).
// ============================================================
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import type { BranchingDecision, PlannedQuestion } from "@/types/index";

const BranchingDecisionSchema = z.object({
  action: z.enum(["branch", "continue"]),
  branchQuestionText: z.union([z.string(), z.null()]).optional(),
  reasoning: z.string().min(10),
});

const DECISION_SHAPE = `{
  "action": "branch" | "continue",
  "branchQuestionText": "<one open-ended follow-up question, only when action=branch — otherwise null>",
  "reasoning": "<short plain-English explanation of why you chose this action, >=10 chars>"
}`;

export async function shouldBranch(opts: {
  candidateAnswer: string;
  currentQuestion: PlannedQuestion;
  plannedNext: PlannedQuestion | null;
  candidateName: string;
  priorBranches: number;
  /** Phase-P2 (2026-06-01) — role-driven per-question cap, passed from
   *  autoConductor.handleBranching (roleSchema.maxBranchesPerQuestion ?? 2). */
  maxBranches: number;
  /** Round-4 (2026-06-01) — role of the interview; drives the CS-specific
   *  lean-toward-branching note. */
  roleId: string;
  interviewId?: string;
}): Promise<BranchingDecision> {
  const { candidateAnswer, currentQuestion, plannedNext, candidateName, priorBranches, maxBranches, roleId, interviewId } = opts;

  let systemPrompt = `You are deciding whether to ask a branching follow-up question to ${candidateName}'s last answer, or to continue to the next planned question. You are part of an automated interview pipeline at Publicis Sapient.

Default to CONTINUE. Branch only when the candidate said something genuinely surprising, contradictory, or under-explored that a senior interviewer would feel compelled to probe. A merely-correct or technically-fine answer is NOT a reason to branch.

Decision rules:
1. Branch when the answer contains a specific, probeable claim genuinely worth one more layer. Good triggers:
   - Concrete technologies named with a non-trivial choice: "we used Redis for caching" → probe cache-invalidation strategy
   - Past project descriptions with surprising technical details: "I built X with Y" → probe how Y handles edge case Z
   - Architectural decisions stated without justification: "we went with microservices" → probe what alternative they considered
   - A contradiction or claim that doesn't add up
2. Skip branching on: generic answers, restatements, simple yes/no, answers shorter than 3 sentences, brief confirmations ("yes", "sure"), and answers that already cover trade-offs + edge cases + specific implementation.
3. Hard cap: at most ${maxBranches} follow-up(s) on this question. You have already posted ${priorBranches} on this question. If priorBranches >= ${maxBranches}, return action: continue regardless of how interesting the answer is.
4. If unsure whether to branch, lean continue. Over-probing makes the interview feel robotic — a real interviewer only occasionally digs deeper, they don't interrogate every answer.

When branching, branchQuestionText must be:
- ONE open-ended question (not yes/no)
- Specific to a claim in the candidate's actual answer
- Not leading (don't bake the right answer into the question)

The current planned question (which the candidate just answered) was about: "${currentQuestion.competencyName}" (${currentQuestion.rubricType} rubric). The question text was: "${currentQuestion.questionText}"

The next planned question would be about: ${plannedNext ? `"${plannedNext.competencyName}" — "${plannedNext.questionText}"` : "(no more planned questions — end of interview)"}

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${DECISION_SHAPE}

When action is "continue", set branchQuestionText to null.`;

  // Round-4 (2026-06-01) — customer-service is a booth demo; the audience
  // needs to SEE Medha probe. Override the disciplined default-CONTINUE
  // stance for this role only.
  if (roleId === "customer-service") {
    systemPrompt += `\n\nROLE NOTE: This is a customer-service booth demo. The audience needs to SEE Medha ask intelligent follow-ups. LEAN TOWARD BRANCHING when the candidate gives any concrete detail (an employer name, a story, a number, a hobby). Skip only on yes/no, single-word answers, or near-silence.`;
  }

  const humanPrompt = `Candidate's answer to the current planned question:
---
${candidateAnswer}
---

Make the decision now.`;

  const model = getChatModel(0.3, { interviewId, purpose: "branching" });
  const method = structuredOutputMethod();

  let raw: unknown;
  try {
    const structured = method
      ? model.withStructuredOutput(BranchingDecisionSchema, { method })
      : model.withStructuredOutput(BranchingDecisionSchema);
    raw = await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);
    raw = BranchingDecisionSchema.parse(raw);
  } catch {
    const response = await model.invoke([
      new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above. No prose, no markdown fences."),
      new HumanMessage(humanPrompt),
    ]);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Branching: model returned no parseable JSON");
    raw = BranchingDecisionSchema.parse(JSON.parse(jsonMatch[0]));
  }

  const parsed = raw as z.infer<typeof BranchingDecisionSchema>;

  return {
    action: parsed.action,
    branchQuestionText: parsed.branchQuestionText ?? undefined,
    reasoning: parsed.reasoning,
    decidedAt: new Date().toISOString(),
    basedOnQuestionIndex: -1, // caller fills this in based on autoConduct state
  };
}
