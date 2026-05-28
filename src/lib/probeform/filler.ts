import ExcelJS from "exceljs";
import path from "path";
import type { FilledProbeForm, ProbeFormMeta } from "@/types/index";
import type { RoleSchema } from "@/lib/probeform/types";

/**
 * Load an Excel template from a path relative to the project root.
 * In Sub-Phase C this path comes from `schema.excelTemplate` so each
 * role drops its own template under `data/templates/`.
 */
export async function loadTemplate(templatePath: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(process.cwd(), templatePath));
  return wb;
}

/**
 * Fill a probe-form workbook from a role schema. Replaces the previous
 * `fillRound(wb, round, form)` — instead of indexing into globals keyed
 * by round, the schema carries its own header cells and per-row cell
 * positions (column F for proficiency, column G for feedback).
 */
export function fillProbeForm(
  wb: ExcelJS.Workbook,
  schema: RoleSchema,
  form: FilledProbeForm
): void {
  const ws = wb.getWorksheet(schema.sheetName);
  if (!ws) {
    throw new Error(
      `Worksheet "${schema.sheetName}" not found in template ${schema.excelTemplate} ` +
        `(role: ${schema.roleId}). Did the template get renamed?`
    );
  }

  // Header: walk the schema's HeaderFieldDef list and pull values off
  // form.header by field name. Skip absent optional fields silently;
  // required fields are checked by the upstream Zod schema.
  const h = form.header as unknown as Record<string, string | number | undefined>;
  for (const hf of schema.header) {
    const value = h[hf.field];
    if (value === undefined || value === null || value === "") continue;
    ws.getCell(hf.cell).value = value;
  }

  // Competency rows: walk the schema's categories and write F{row}/G{row}.
  const evalByRow = new Map(form.competencies.map((c) => [c.rowIndex, c]));
  for (const cat of schema.categories) {
    for (const row of cat.rows) {
      const ev = evalByRow.get(row.rowIndex);
      if (!ev) continue; // Row not evaluated — leave the template's blank/default
      ws.getCell(`F${row.rowIndex}`).value = ev.proficiency;
      ws.getCell(`G${row.rowIndex}`).value = ev.feedbackDetails || "-";
    }
  }
}

export function addMetaSheet(wb: ExcelJS.Workbook, meta: ProbeFormMeta): void {
  // Remove existing _meta sheet if present (e.g., from template)
  const existing = wb.getWorksheet("_meta");
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet("_meta");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any).state = "hidden";

  const rows: [string, string][] = [
    ["app",              meta.app],
    ["version",          meta.version],
    ["model_provider",   meta.modelProvider],
    ["model_id",         meta.modelId],
    ["generated_at",     meta.generatedAt],
    ["meeting_id",       meta.meetingId],
    ["transcript_sha256",meta.transcriptSha256],
    ["recruiter_email",  meta.recruiterEmail],
    ["bot_user_email",   meta.botUserEmail],
    ["test_mode",        meta.testMode ? "true" : "false"],
    ["fixture_id",       meta.fixtureId ?? ""],
  ];

  for (const [key, value] of rows) {
    ws.addRow([key, value]);
  }
}

export async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
