import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { loadTemplate, fillRound, addMetaSheet, toBuffer } from "../src/lib/probeform/filler";
import { REACT_ROWS } from "../src/lib/probeform/rows";
import type { FilledProbeForm, CompetencyEvaluation } from "../src/types/index";

const competencies: CompetencyEvaluation[] = REACT_ROWS.map((row) => ({
  rowIndex: row.rowIndex,
  rubricType: row.rubricType,
  proficiency: row.rubricType === "architecture"
    ? "Able to explain concepts in depth "
    : "Confident hands on developer",
  feedbackDetails: `Smoke test feedback for row ${row.rowIndex} — ${row.competencyName}.`,
}));

const FIXTURE: FilledProbeForm = {
  round: "React",
  header: {
    candidateName: "Smoke Test Candidate",
    totalYears: 5,
    relevantYears: 3,
    interviewedFor: "Senior Experience Engineer",
    evaluationDate: "05/17/2026",
    interviewerName: "Interviewly Bot",
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

async function main() {
  console.log("Loading template…");
  const wb = await loadTemplate();

  console.log("Filling React round…");
  fillRound(wb, "React", FIXTURE);

  console.log("Adding _meta sheet…");
  addMetaSheet(wb, {
    app: "interviewly",
    version: "0.1.0",
    modelProvider: "google",
    modelId: "gemini-1.5-pro",
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
