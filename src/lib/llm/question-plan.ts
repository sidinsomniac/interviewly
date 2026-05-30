import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModel, structuredOutputMethod } from "@/lib/llm";
import { QuestionPlanSchema } from "@/types/index";
import type { QuestionPlan } from "@/types/index";
import type { RoleSchema } from "@/lib/probeform/types";
import { flattenRows } from "@/lib/probeform/types";
import { config } from "@/lib/config";

// JSON shape skeleton injected into the prompt for jsonMode providers
// (DeepSeek). When the API can't enforce a Zod-derived JSON schema
// strictly, the prompt has to carry the shape itself.
const QUESTION_PLAN_SHAPE = `{
  "roleId": "<the roleId string passed below>",
  "questions": [
    {
      "rowIndex": <integer matching one of the rowIndex values listed above>,
      "competencyName": "<exact competencyName string from the rows list>",
      "rubricType": "architecture" | "development",
      "questionText": "<the question, >=10 chars, open-ended>",
      "followUpHints": ["<optional follow-up>", "..."],
      "isHandsOnExercise": true | false,
      "exerciseUrl": "<https url, only when isHandsOnExercise=true>"
    }
  ]
}`;

export async function generateQuestionPlan(input: {
  schema: RoleSchema;
  roleAppliedFor: string;
  candidateTotalYears: number;
  candidateRelevantYears: number;
  jdText?: string;
  /** Budget-tracker: associates this call with an interview in /api/usage. */
  interviewId?: string;
}): Promise<QuestionPlan> {
  const { schema, roleAppliedFor, candidateTotalYears, candidateRelevantYears, jdText, interviewId } = input;
  const rows = flattenRows(schema);
  const rowsJson = JSON.stringify(rows, null, 2);

  // Render categories as section headers — better grouping signal than
  // the flat row list the previous version sent.
  const categoryOutline = schema.categories
    .map((c) => `- ${c.name}: rows ${c.rows.map((r) => r.rowIndex).join(", ")}`)
    .join("\n");

  const systemPrompt = `You are a senior technical interviewer at Publicis Sapient designing a structured interview for the ${roleAppliedFor} role.

Your job is to generate a complete question plan for the ${schema.displayName} probe form. The plan has one or more questions per competency row of the probe form. For each question:

- Tie it to a specific row (rowIndex) of the probe form's competency list.
- Match difficulty to the candidate's experience: ${candidateTotalYears} total years, ${candidateRelevantYears} relevant years. A 5-year senior candidate should get harder questions than a 1-year candidate, but neither should get "trick" questions.
- Make questions OPEN-ENDED — never yes/no. Aim for questions that invite the candidate to explain trade-offs, reasoning, or experience.
- Avoid leading questions. Don't bake the right answer into the prompt.
- For the hands-on exercise row, set isHandsOnExercise: true and include a CodeSandbox or StackBlitz URL in exerciseUrl.

The probe form is organized into these categories:
${categoryOutline}

Full competency rows for this role:
${rowsJson}

Match each row's rubricType (architecture or development) when generating questions — architecture-rubric rows should probe for reasoning and PoV; development-rubric rows should probe for hands-on coding ability or specific implementation knowledge.

Generate 1–3 questions per competency row. The total question count should be in the range 12–20 to keep interviews under 75 minutes.

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:

${QUESTION_PLAN_SHAPE}

The "roleId" field at the top level MUST be exactly the string "${schema.roleId}". Every "rowIndex" MUST match one of the rowIndex values from the rows list above. Every "rubricType" MUST be the literal string "architecture" or "development".`;

  const humanPrompt = `Job description (may be empty):
${jdText ?? "(no JD provided — use generic competency definitions)"}

Generate the question plan now.`;

  const model = getChatModel(0.5, { interviewId, purpose: "question-plan" });
  const method = structuredOutputMethod();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;

  try {
    const structured = method
      ? model.withStructuredOutput(QuestionPlanSchema, { method })
      : model.withStructuredOutput(QuestionPlanSchema);
    raw = await structured.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);
    raw = QuestionPlanSchema.parse(raw);
  } catch {
    const response = await model.invoke([
      new SystemMessage(systemPrompt + "\n\nReturn only valid JSON matching the shape above."),
      new HumanMessage(humanPrompt),
    ]);
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model returned no parseable JSON for question plan");
    raw = QuestionPlanSchema.parse(JSON.parse(jsonMatch[0]));
  }

  return {
    roleId: schema.roleId,
    generatedAt: new Date().toISOString(),
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    questions: (Array.isArray(raw?.questions) ? raw.questions : []) as QuestionPlan["questions"],
  };
}
