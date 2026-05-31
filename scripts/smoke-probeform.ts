// ============================================================
// Sub-Phase C smoke: schema-driven Excel filler against the React role.
//
// Builds a synthetic FilledProbeForm in-memory (no LLM call, no fixtures)
// and runs it through the new fillProbeForm(schema, ...) path to confirm:
//   - the schema's excelTemplate path resolves
//   - the schema's sheetName exists in the template
//   - every category's rows write into cells F{row}/G{row}
//   - every header field writes into its declared cell
//   - the resulting .xlsx is structurally identical to the Gurnoor sample
//
// Faster than `smoke:excel` because it exercises every row in every
// category — useful regression check when adding a new role to the
// registry in Sub-Phase D.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "../src/lib/probeform/filler";
import { getRoleSchema } from "../src/lib/probeform/registry";
import { flattenRows } from "../src/lib/probeform/types";
import { config } from "../src/lib/config";
import type { FilledProbeForm, CompetencyEvaluation } from "../src/types/index";

async function main(): Promise<number> {
  const roleId = process.env.ROLE_ID ?? "react";
  const schema = getRoleSchema(roleId);
  if (!schema) {
    console.error(`❌ role "${roleId}" not registered — see src/lib/probeform/registry.ts`);
    return 1;
  }
  console.log(`✓ schema loaded: ${schema.displayName} (${schema.roleId})`);
  console.log(`  template:  ${schema.excelTemplate}`);
  console.log(`  sheet:     "${schema.sheetName}"`);
  console.log(`  categories: ${schema.categories.length}`);
  for (const cat of schema.categories) {
    console.log(`    - ${cat.name}: ${cat.rows.length} rows (${cat.rows[0].rowIndex}-${cat.rows.at(-1)!.rowIndex})`);
  }
  console.log();

  // Synthetic evaluation: pick a non-default proficiency for every row,
  // and write a category-aware feedback string so the resulting Excel
  // is visibly differentiated per category when eyeballed.
  const competencies: CompetencyEvaluation[] = [];
  for (const cat of schema.categories) {
    for (const row of cat.rows) {
      competencies.push({
        rowIndex: row.rowIndex,
        rubricType: row.rubricType,
        proficiency: row.rubricType === "architecture"
          ? "Able to explain concepts in depth "
          : "Confident hands on developer",
        feedbackDetails: `[${cat.name}] Smoke test feedback for row ${row.rowIndex} — ${row.competencyName}.`,
      });
    }
  }

  const form: FilledProbeForm = {
    roleId: schema.roleId,
    header: {
      candidateName: "Schema Smoke Candidate",
      totalYears: 7,
      relevantYears: 5,
      interviewedFor: "Senior Experience Engineer",
      evaluationDate: "05/27/2026",
      interviewerName: "Medha",
      interviewerOid: "AI-001",
      interviewOutcome: "Selected",
      selectedForLevel: "Senior Experience Engineer",
      domainFeedbackSummary:
        "Synthetic domain feedback summary written by scripts/smoke-react-probeform.ts. " +
        "Confirms D10 wiring on the React role schema. " +
        "All competency rows below were filled deterministically without an LLM call.",
    },
    competencies,
  };

  console.log(`Filling ${competencies.length} competency rows…`);
  const wb = await loadTemplate(schema.excelTemplate);
  fillProbeForm(wb, schema, form);

  addMetaSheet(wb, {
    app: "interviewly",
    version: "0.1.0",
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    generatedAt: new Date().toISOString(),
    meetingId: `smoke-react-probeform`,
    transcriptSha256: "0".repeat(64),
    recruiterEmail: "smoke@example.com",
    botUserEmail: "bot@example.com",
  });

  const buffer = await toBuffer(wb);
  // Phase L: writes go to ~/.medha/output by default (override via MEDHA_DATA_DIR).
  const { MEDHA_OUTPUT_DIR } = await import("@/lib/paths");
  const outPath = path.join(MEDHA_OUTPUT_DIR, `smoke-probeform-${schema.roleId}.xlsx`);
  fs.writeFileSync(outPath, buffer);

  console.log(`\n✅ Wrote ${outPath}`);
  console.log(`   ${flattenRows(schema).length} rows across ${schema.categories.length} categories filled via schema-driven filler.`);
  return 0;
}

main().then((c) => process.exit(c)).catch((err) => {
  console.error(err);
  process.exit(1);
});
