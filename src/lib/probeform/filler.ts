import ExcelJS from "exceljs";
import path from "path";
import type { InterviewRound, FilledProbeForm, ProbeFormMeta } from "@/types/index";
import { HEADER_CELLS, ROUND_SHEET_NAMES, CELL_MAP_BY_ROUND } from "@/lib/probeform/template";

export async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const templatePath = path.resolve(process.cwd(), "data/samples/Probe_Form_sample.xlsx");
  await wb.xlsx.readFile(templatePath);
  return wb;
}

export function fillRound(wb: ExcelJS.Workbook, round: InterviewRound, form: FilledProbeForm): void {
  const sheetName = ROUND_SHEET_NAMES[round];
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Worksheet "${sheetName}" not found in template`);

  const h = form.header;

  // Write header fields — only set value, never touch formulas
  ws.getCell(HEADER_CELLS.candidateName).value         = h.candidateName;
  ws.getCell(HEADER_CELLS.totalYears).value            = h.totalYears;
  ws.getCell(HEADER_CELLS.relevantYears).value         = h.relevantYears;
  ws.getCell(HEADER_CELLS.interviewedFor).value        = h.interviewedFor;
  ws.getCell(HEADER_CELLS.evaluationDate).value        = h.evaluationDate;
  ws.getCell(HEADER_CELLS.interviewerName).value       = h.interviewerName;
  ws.getCell(HEADER_CELLS.interviewerOid).value        = h.interviewerOid;
  ws.getCell(HEADER_CELLS.interviewOutcome).value      = h.interviewOutcome;
  ws.getCell(HEADER_CELLS.domainFeedbackSummary).value = h.domainFeedbackSummary;

  if (h.selectedForLevel)        ws.getCell(HEADER_CELLS.selectedForLevel).value        = h.selectedForLevel;
  if (h.rejectionReason)         ws.getCell(HEADER_CELLS.rejectionReason).value         = h.rejectionReason;
  if (h.sectionsToBeTrainedOn)   ws.getCell(HEADER_CELLS.sectionsToBeTrainedOn).value   = h.sectionsToBeTrainedOn;
  if (h.teachableSkillGapDetails)ws.getCell(HEADER_CELLS.teachableSkillGapDetails).value = h.teachableSkillGapDetails;
  if (h.handsOnExerciseId)       ws.getCell(HEADER_CELLS.handsOnExerciseId).value       = h.handsOnExerciseId;

  // Write competency rows
  const cellMap = CELL_MAP_BY_ROUND[round];
  for (const comp of form.competencies) {
    const cells = cellMap[comp.rowIndex];
    if (!cells) continue;
    ws.getCell(cells.proficiencyCell).value = comp.proficiency;
    ws.getCell(cells.feedbackCell).value    = comp.feedbackDetails || "-";
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
