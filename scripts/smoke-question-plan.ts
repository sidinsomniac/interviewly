import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { generateQuestionPlan } from "../src/lib/llm/question-plan";
import { getRoleSchema } from "../src/lib/probeform/registry";
import { flattenRows } from "../src/lib/probeform/types";

const FAKE_JD = `
We are looking for a Senior Experience Engineer with strong React expertise.
You will build complex UI components, design system tooling, and mentor junior engineers.
Key skills: React, TypeScript, CSS-in-JS, accessibility (WCAG 2.1), web performance, micro-frontends.
`;

async function main() {
  const schema = getRoleSchema("react");
  if (!schema) throw new Error("react role not registered — see src/lib/probeform/registry.ts");

  console.log(`Generating question plan for ${schema.displayName} (${schema.roleId})…\n`);

  const plan = await generateQuestionPlan({
    schema,
    roleAppliedFor: "Senior Experience Engineer",
    candidateTotalYears: 7,
    candidateRelevantYears: 5,
    jdText: FAKE_JD,
  });

  console.log(`Model: ${plan.modelProvider} / ${plan.modelId}`);
  console.log(`Generated at: ${plan.generatedAt}`);
  console.log(`Questions: ${plan.questions.length}\n`);

  const validRowIndices = new Set(flattenRows(schema).map((r) => r.rowIndex));
  let valid = true;

  plan.questions.forEach((q, i) => {
    const inRange = validRowIndices.has(q.rowIndex);
    if (!inRange) valid = false;
    console.log(
      `${i + 1}. [row ${q.rowIndex}${inRange ? "" : " ⚠ INVALID ROW"}] ${q.competencyName} (${q.rubricType})`
    );
    console.log(`   ${q.questionText}\n`);
  });

  if (plan.questions.length < 12) {
    console.error(`⚠ Only ${plan.questions.length} questions — expected at least 12`);
    valid = false;
  }

  console.log(valid ? "✅ Smoke test passed" : "❌ Smoke test failed — see warnings above");
  process.exit(valid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
