import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "../src/lib/probeform/filler";
import { getRoleSchema } from "../src/lib/probeform/registry";
import { flattenRows } from "../src/lib/probeform/types";
import { config } from "../src/lib/config";
import type { FilledProbeForm, CompetencyEvaluation } from "../src/types/index";

async function main() {
  const schema = getRoleSchema("react");
  if (!schema) throw new Error("react role not registered");

  const competencies: CompetencyEvaluation[] = flattenRows(schema).map((row) => ({
    rowIndex: row.rowIndex,
    rubricType: row.rubricType,
    proficiency: row.rubricType === "architecture"
      ? "Able to explain concepts in depth "
      : "Confident hands on developer",
    feedbackDetails: `Smoke test feedback for row ${row.rowIndex} — ${row.competencyName}.`,
  }));

  const FIXTURE: FilledProbeForm = {
    roleId: schema.roleId,
    header: {
      candidateName: "Smoke Test Candidate",
      totalYears: 5,
      relevantYears: 3,
      interviewedFor: "Senior Experience Engineer",
      evaluationDate: "05/27/2026",
      interviewerName: "Medha",
      interviewerOid: "AI-001",
      interviewOutcome: "Selected",
      selectedForLevel: "Senior Experience Engineer",
      rejectionReason: "",
      sectionsToBeTrainedOn: "",
      domainFeedbackSummary: "Candidate demonstrated strong React fundamentals and component design skills.",
      teachableSkillGapDetails: "",
      handsOnExerciseId: "",
    },
    competencies,
  };

  console.log(`Loading template ${schema.excelTemplate}…`);
  const wb = await loadTemplate(schema.excelTemplate);

  console.log(`Filling ${schema.displayName} sheet "${schema.sheetName}"…`);
  fillProbeForm(wb, schema, FIXTURE);

  console.log("Adding _meta sheet…");
  addMetaSheet(wb, {
    app: "interviewly",
    version: "0.1.0",
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    generatedAt: new Date().toISOString(),
    meetingId: "smoke-test",
    transcriptSha256: "0".repeat(64),
    recruiterEmail: "smoke@example.com",
    botUserEmail: "bot@example.com",
  });

  const buffer = await toBuffer(wb);
  const outputDir = path.resolve(process.cwd(), "data/output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, "smoke-test.xlsx");
  fs.writeFileSync(outPath, buffer);

  console.log(`\n✅ Wrote ${outPath}`);
  console.log("Open in Excel to verify: formulas resolve, _meta sheet hidden, React competencies filled.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
