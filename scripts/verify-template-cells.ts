// ============================================================
// Sub-Phase D: verify the cell mappings declared in react.ts
// against the actual content of data/templates/react.xlsx.
//
// The Sub-Phase A original template.ts had off-by-one row mappings
// (per the Sub-Phase D Explore-agent finding). This script proves
// or disproves that finding so we know whether to fix react.ts
// before authoring four new role schemas with the same mappings.
// ============================================================
import path from "node:path";
import ExcelJS from "exceljs";
import { reactSchema } from "../src/lib/probeform/roles/react";

function looksLikeLabel(v: unknown): boolean {
  if (typeof v !== "string") return false;
  // Typical label cells contain a colon: "Total years of exp.:", etc.
  return v.includes(":");
}

async function main() {
  const templatePath = path.resolve(process.cwd(), reactSchema.excelTemplate);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  console.log(`Workbook: ${templatePath}`);
  console.log(`Sheets:   ${wb.worksheets.map((s) => `"${s.name}"`).join(", ")}\n`);

  const ws = wb.getWorksheet(reactSchema.sheetName);
  if (!ws) {
    console.error(`❌ Sheet "${reactSchema.sheetName}" not found`);
    process.exit(1);
  }

  // Dump the header region (B..I, rows 4..12) so we can eyeball what's
  // a label and what's data.
  console.log(`--- Header region of "${ws.name}" (rows 4-12, cols B-I) ---`);
  for (let r = 4; r <= 12; r++) {
    const row: string[] = [];
    for (const col of ["B", "C", "D", "E", "F", "G", "H", "I"]) {
      const cell = ws.getCell(`${col}${r}`);
      const v = cell.value;
      const s = v === null || v === undefined || v === ""
        ? "·"
        : typeof v === "object" && v !== null && "formula" in (v as object)
          ? `=${(v as unknown as { formula?: string }).formula ?? "?"}`
          : String(v);
      row.push(`${col}${r}=${s.slice(0, 28).padEnd(28)}`);
    }
    console.log("  " + row.join(" "));
  }

  // Then check each mapping declared in react.ts.
  console.log(`\n--- react.ts header mappings vs template ---`);
  let mismatches = 0;
  for (const hf of reactSchema.header) {
    const cell = ws.getCell(hf.cell);
    const v = cell.value;
    const flag = looksLikeLabel(v) ? "⚠ LABEL" : v === null || v === undefined ? "(empty)" : "ok";
    if (looksLikeLabel(v)) mismatches++;
    const display = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 40);
    console.log(`  ${hf.field.padEnd(28)} @ ${hf.cell.padEnd(4)} → ${flag.padEnd(9)} "${display}"`);
  }

  console.log(`\n${mismatches === 0 ? "✅ All mappings point at non-label cells." : `❌ ${mismatches} mapping(s) point at LABEL cells — schema is buggy.`}`);
  process.exit(mismatches === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
