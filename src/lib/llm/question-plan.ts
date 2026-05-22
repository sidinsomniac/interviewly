import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "@/lib/llm";
import { ROWS_BY_ROUND } from "@/lib/probeform/rows";
import { QuestionPlanSchema } from "@/types/index";
import type { InterviewRound, QuestionPlan } from "@/types/index";
import { config } from "@/lib/config";

export async function generateQuestionPlan(input: {
  round: InterviewRound;
  roleAppliedFor: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  jdText?: string;
}): Promise<QuestionPlan> {
  const { round, roleAppliedFor, candidateTotalYears, candidateRelevantYears, jdText } = input;
  const rows = ROWS_BY_ROUND[round];
  const rowsJson = JSON.stringify(rows, null, 2);

  const systemPrompt = `You are a senior technical interviewer at Publicis Sapient designing a structured interview for the ${roleAppliedFor} role.

Your job is to generate a complete question plan for the ${round} round of the PS Experience Engineering hiring probe. The plan has one or more questions per competency row of the probe form. For each question:

- Tie it to a specific row (rowIndex) of the probe form's competency list.
- Match difficulty to the candidate's experience: ${candidateTotalYears} total years, ${candidateRelevantYears} relevant years. A 5-year senior candidate should get harder questions than a 1-year candidate, but neither should get "trick" questions.
- Make questions OPEN-ENDED — never yes/no. Aim for questions that invite the candidate to explain trade-offs, reasoning, or experience.
- Avoid leading questions. Don't bake the right answer into the prompt.
- For the hands-on exercise row, set isHandsOnExercise: true and include a CodeSandbox or StackBlitz URL in exerciseUrl.

The probe form's competency rows for this round are:
${rowsJson}

Match each row's rubricType (architecture or development) when generating questions — architecture-rubric rows should probe for reasoning and PoV; development-rubric rows should probe for hands-on coding ability or specific implementation knowledge.

Generate 1–3 questions per competency row. The total question count should be in the range 12–20 to keep interviews under 75 minutes.

Output ONLY a structured JSON conforming to the QuestionPlanSchema.`;

  const humanPrompt = `Job description (may be empty):
${jdText ?? "(no JD provided — use generic competency definitions)"}

Generate the question plan now.`;

  const model = getChatModel(0.5);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;

  try {
    const structured = model.withStructuredOutput(QuestionPlanSchema);
    raw = await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);
  } catch {
    // Fallback: invoke without structured output and parse JSON manually
    const response = await model.invoke([
      new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the QuestionPlanSchema."),
      new HumanMessage(humanPrompt),
    ]);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model returned no parseable JSON for question plan");
    raw = QuestionPlanSchema.parse(JSON.parse(jsonMatch[0]));
  }

  return {
    round,
    generatedAt: new Date().toISOString(),
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    questions: (Array.isArray(raw?.questions) ? raw.questions : []) as QuestionPlan["questions"],
  };
}
