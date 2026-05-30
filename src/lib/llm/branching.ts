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
  interviewId?: string;
}): Promise<BranchingDecision> {
  const { candidateAnswer, currentQuestion, plannedNext, candidateName, priorBranches, interviewId } = opts;

  const systemPrompt = `You are deciding whether to ask a branching follow-up question to ${candidateName}'s last answer, or to continue to the next planned question. You are part of an automated interview pipeline at Publicis Sapient.

Lean toward branching when the answer leaves obvious depth on the table — a senior interviewer would probe one more layer. Don't branch reflexively, but also don't accept a merely-correct answer that skips trade-offs, edge cases, or specific implementation detail. When in doubt between "continue" and "branch", and the candidate hasn't named at least one trade-off or specific detail, prefer "branch".

Decision rules:
1. Branch when the answer contains a specific, probeable claim worth going deeper on. Good triggers:
   - Concrete technologies named with a non-trivial choice: "we used Redis for caching" → probe cache-invalidation strategy
   - Past project descriptions with technical details: "I built X with Y" → probe how Y handles edge case Z
   - Architectural decisions stated without justification: "we went with microservices" → probe what alternative they considered
2. Do NOT branch on:
   - Brief confirmations ("yes", "sure", "I agree")
   - Generic statements ("I have a lot of experience with React")
   - Answers that already fully cover the competency we're probing (trade-offs + edge cases + specific implementation)
3. Hard cap: priorBranches is ${priorBranches}. If this number is >= 3, return action: continue regardless of how interesting the answer is — we must not over-branch within one planned question.
4. Lean toward branching but stay disciplined: the trigger taxonomy in rule 1 must apply. Don't branch on confirmations, generic statements, or answers that already cover the trade-offs + edge cases + specific detail comprehensively. When the answer is technically correct but shallow, prefer branching — most candidates leave depth on the table.

When branching, branchQuestionText must be:
- ONE open-ended question (not yes/no)
- Specific to a claim in the candidate's actual answer
- Not leading (don't bake the right answer into the question)

The current planned question (which the candidate just answered) was about: "${currentQuestion.competencyName}" (${currentQuestion.rubricType} rubric). The question text was: "${currentQuestion.questionText}"

The next planned question would be about: ${plannedNext ? `"${plannedNext.competencyName}" — "${plannedNext.questionText}"` : "(no more planned questions — end of interview)"}

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${DECISION_SHAPE}

When action is "continue", set branchQuestionText to null.`;

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
