// ============================================================
// Sub-Phase D: author per-role Excel templates by cloning the
// React workbook and overwriting competency labels per schema.
//
// For each new role:
//   1. Open data/templates/react.xlsx (the base workbook)
//   2. Identify the source sheet to clone:
//      - frontend-generic → "1 - HTML, CSS & NFRs"
//      - all others       → "2 - FW React"
//   3. Remove non-essential sheets (we keep the source sheet + Data)
//   4. Rename the source sheet to the schema's sheetName
//   5. Overwrite competency labels: clear rows 14-43 columns B-E,
//      then write the schema's category name into column B of the
//      first row of each category, and the competencyName into
//      column D for every row.
//   6. Leave columns F (proficiency) and G (feedback) blank — the
//      runtime filler writes those.
//   7. Save to data/templates/<roleId>.xlsx
//
// Run once. Output committed.
// ============================================================
import path from "node:path";
import ExcelJS from "exceljs";

import { javaBackendSchema } from "../src/lib/probeform/roles/java-backend";
import { pythonBackendSchema } from "../src/lib/probeform/roles/python-backend";
import { nodeBackendSchema } from "../src/lib/probeform/roles/node-backend";
import { frontendGenericSchema } from "../src/lib/probeform/roles/frontend-generic";
import type { RoleSchema } from "../src/lib/probeform/types";

const SOURCE_TEMPLATE = "data/templates/react.xlsx";

const TARGETS: Array<{ schema: RoleSchema; sourceSheet: string }> = [
  { schema: javaBackendSchema,     sourceSheet: "2 - FW React" },
  { schema: pythonBackendSchema,   sourceSheet: "2 - FW React" },
  { schema: nodeBackendSchema,     sourceSheet: "2 - FW React" },
  { schema: frontendGenericSchema, sourceSheet: "1 - HTML, CSS & NFRs" },
];

// Sheets we keep in the output workbook. Everything else is dropped.
const SHEETS_TO_KEEP = new Set(["Data"]);

async function buildTemplate(target: { schema: RoleSchema; sourceSheet: string }) {
  const { schema, sourceSheet } = target;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(process.cwd(), SOURCE_TEMPLATE));

  // 1. Find the source sheet, abort if missing.
  const source = wb.getWorksheet(sourceSheet);
  if (!source) throw new Error(`Source sheet "${sourceSheet}" not found in ${SOURCE_TEMPLATE}`);

  // 2. Drop every sheet that's neither the source sheet nor in SHEETS_TO_KEEP.
  const dropIds: number[] = [];
  for (const ws of wb.worksheets) {
    if (ws.name === sourceSheet) continue;
    if (SHEETS_TO_KEEP.has(ws.name)) continue;
    dropIds.push(ws.id);
  }
  for (const id of dropIds) wb.removeWorksheet(id);

  // 3. Rename the source sheet.
  source.name = schema.sheetName;

  // 4. For non-frontend-generic roles, rewrite rows 14-43 to carry
  //    the new role's competency labels. For frontend-generic the
  //    sheet content already matches the role (HTML/CSS/JS) so leave it.
  if (schema.roleId !== "frontend-generic") {
    // Clear rows 14-43 columns B-E (preserve F/G data-validation +
    // formatting; the filler writes those at runtime).
    for (let r = 14; r <= 43; r++) {
      for (const col of ["B", "C", "D", "E"]) {
        const cell = source.getCell(`${col}${r}`);
        // Only clear the value, preserve style/format.
        cell.value = null;
      }
    }

    // Write categories + competency names.
    for (const cat of schema.categories) {
      let first = true;
      for (const row of cat.rows) {
        if (first) {
          // Category name in column B of the first row of the category.
          source.getCell(`B${row.rowIndex}`).value = cat.name;
          first = false;
        }
        // Competency name in column D (the wide display column per the
        // verified template layout — D-E are merged for readability in
        // the source, but writing to D suffices for visual display).
        source.getCell(`D${row.rowIndex}`).value = row.competencyName;
      }
    }
  }

  const outPath = path.resolve(process.cwd(), `data/templates/${schema.roleId}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  console.log(`  ✓ ${schema.roleId} → ${outPath}`);
}

async function main() {
  console.log(`Building 4 role templates from ${SOURCE_TEMPLATE}…\n`);
  for (const target of TARGETS) {
    console.log(`[${target.schema.roleId}] cloning "${target.sourceSheet}" → "${target.schema.sheetName}"`);
    await buildTemplate(target);
  }
  console.log("\n✅ All 4 role templates built.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
