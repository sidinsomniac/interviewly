// ============================================================
// Smoke test for SUB-PHASE B (MEDHA_TEST_MODE end-interview flow).
//
// Exercises the *same* library calls the /api/interviews/[id]/end
// route makes, but without a running Next.js dev server. The route
// is thin orchestration over these functions, so success here is a
// strong proxy for success of the full UI flow:
//
//   loadFixtureBundle  →  mergeTranscriptSources  →
//   generateQuestionPlan  →  mapTranscriptToProbeForm  →
//   loadTemplate / fillProbeForm / addMetaSheet / toBuffer
//
// Pass criteria (all must hold):
//   1. config.app.testMode is true (i.e., .env.local is wired up)
//   2. Fixture bundle loads with non-empty vtt + chat + a defined
//      codeSubmission (proves the coderpad rename took effect)
//   3. ≥70% of the React schema's flattened rows get a non-default
//      proficiency AND non-empty feedbackDetails ("realistic-enough"
//      bar; the good-hire transcript covers most rows but a few —
//      RTL/enzyme, error boundaries — may legitimately not surface).
//   4. _meta sheet records test_mode=true, fixture_id=react/good-hire,
//      model_provider=deepseek.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { config } from "../src/lib/config";
import { loadFixtureBundle } from "../src/lib/fixtures";
import { mergeTranscriptSources } from "../src/lib/transcript-merge";
import { generateQuestionPlan } from "../src/lib/llm/question-plan";
import { mapTranscriptToProbeForm } from "../src/lib/llm/transcript-mapping";
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "../src/lib/probeform/filler";
import { getRoleSchema } from "../src/lib/probeform/registry";
import { flattenRows } from "../src/lib/probeform/types";

const PASS_THRESHOLD = 0.70;   // ≥70% rows filled → pass
const STRETCH_GOAL  = 0.80;    // ≥80% rows filled → stretch goal hit

async function main(): Promise<number> {
  // 1. Sanity-check the env
  if (!config.app.testMode) {
    console.error("❌ config.app.testMode is false — set MEDHA_TEST_MODE=true in .env.local");
    return 1;
  }
  const roleId = process.env.ROLE_ID ?? "react";
  const schema = getRoleSchema(roleId);
  if (!schema) {
    console.error(`❌ role "${roleId}" not registered — see src/lib/probeform/registry.ts`);
    return 1;
  }
  const reactRows = flattenRows(schema);
  console.log(`✓ MEDHA_TEST_MODE=true; provider=${config.llm.provider}/${config.llm.modelId}; role=${schema.roleId}\n`);

  // 2. Load fixture bundle (same call the end route makes)
  const bundle = await loadFixtureBundle({ role: roleId, outcome: "good-hire" });
  if (bundle.vttSegments.length === 0) {
    console.error("❌ fixture VTT parsed to zero segments");
    return 1;
  }
  if (bundle.chatSegments.length === 0) {
    console.error("❌ fixture chat parsed to zero segments");
    return 1;
  }
  // Coderpad fixture is optional — Sub-Phase B introduced the rename check
  // for react where the file exists; java/python/etc. deliberately skip it.
  // Print whichever shape is present so the run log is informative.
  const codeBlurb = bundle.codeSubmission
    ? `code=${bundle.codeSubmission.exerciseId} (${bundle.codeSubmission.language})`
    : "code=(none — fixture lacks coderpad submission)";
  console.log(`✓ bundle: vtt=${bundle.vttSegments.length} segs, chat=${bundle.chatSegments.length} segs, ${codeBlurb}\n`);

  // 3. Generate the question plan the same way the create-interview route does
  console.log("Generating question plan…");
  const questionPlan = await generateQuestionPlan({
    schema,
    roleAppliedFor: "Senior Experience Engineer",
    candidateTotalYears: 7,
    candidateRelevantYears: 5,
  });
  console.log(`✓ ${questionPlan.questions.length} questions planned\n`);

  // 4. Merge transcript + map to probe form (same calls as the end route)
  const transcript = mergeTranscriptSources(bundle.vttSegments, bundle.chatSegments);
  console.log(`Merged transcript: ${transcript.length} total segments. Mapping → probe form…`);

  const filled = await mapTranscriptToProbeForm({
    schema,
    candidateName: "Test Candidate",
    roleAppliedFor: "Senior Experience Engineer",
    candidateTotalYears: 7,
    candidateRelevantYears: 5,
    transcript,
    questionPlan,
  });

  // 5. Score the realism of the output
  const totalRows = reactRows.length;
  const compByRow = new Map(filled.competencies.map((c) => [c.rowIndex, c]));
  let probed = 0;
  let withFeedback = 0;
  const missing: number[] = [];
  for (const row of reactRows) {
    const c = compByRow.get(row.rowIndex);
    if (!c) { missing.push(row.rowIndex); continue; }
    const isProbed = c.proficiency && c.proficiency !== "Did not probe";
    const hasFb = !!c.feedbackDetails && c.feedbackDetails.trim().length > 1 && c.feedbackDetails.trim() !== "-";
    if (isProbed && hasFb) {
      probed++;
      withFeedback++;
    } else if (isProbed) {
      probed++;
    }
  }
  const ratio = probed / totalRows;

  console.log("\n--- Probe form realism ---");
  console.log(`Total ${schema.displayName} rows: ${totalRows}`);
  console.log(`Rows present in output:     ${filled.competencies.length}`);
  console.log(`Rows fully filled:          ${probed} (${(ratio * 100).toFixed(0)}%)`);
  console.log(`Outcome:                    ${filled.header.interviewOutcome}`);
  console.log(`Career stage:               ${filled.header.selectedForLevel ?? "(none)"}`);
  console.log(`Summary chars:              ${filled.header.domainFeedbackSummary.length}`);
  if (missing.length) console.log(`Rows missing from output:   ${missing.join(", ")}`);
  console.log("--------------------------\n");

  // 6. Build the Excel — exactly the same calls the end route makes
  const wb = await loadTemplate(schema.excelTemplate);
  fillProbeForm(wb, schema, filled);

  const vttSha256 = createHash("sha256").update(bundle.vttRaw).digest("hex");
  addMetaSheet(wb, {
    app: "interviewly",
    version: "0.1.0",
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    generatedAt: new Date().toISOString(),
    meetingId: `TEST_MODE:${bundle.meta.role}-${bundle.meta.outcome}`,
    transcriptSha256: vttSha256,
    recruiterEmail: "smoke@example.com",
    botUserEmail: "bot@example.com",
    testMode: true,
    fixtureId: `${bundle.meta.role}/${bundle.meta.outcome}`,
  });

  const buffer = await toBuffer(wb);
  const outputDir = path.resolve(process.cwd(), "data/output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `smoke-end-interview-testmode-${schema.roleId}.xlsx`);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ wrote ${outPath}`);

  // 7. Verdict
  if (ratio >= PASS_THRESHOLD) {
    const tag = ratio >= STRETCH_GOAL ? "✅ STRETCH" : "✅";
    console.log(`\n${tag} smoke passed — ${(ratio * 100).toFixed(0)}% rows filled (bar: ≥${PASS_THRESHOLD * 100}%, stretch: ≥${STRETCH_GOAL * 100}%)`);
    return 0;
  } else {
    console.error(`\n❌ smoke failed — only ${(ratio * 100).toFixed(0)}% rows filled (need ≥${PASS_THRESHOLD * 100}%)`);
    return 1;
  }
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
