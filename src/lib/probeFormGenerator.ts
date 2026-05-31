// ============================================================
// Phase M (2026-05-31) — workbook-build helper.
//
// Lifts the .xlsx assembly out of endInterview.finalize() into a
// returnable helper. No disk writes — buffer flows out to the caller
// and from there straight into the Graph sendMail attachment.
//
// `mapTranscriptToProbeForm` (the LLM call) intentionally stays in
// finalize() because its output (`filledForm`) is independently useful
// for the result-page summary regardless of whether the .xlsx is built.
// This helper consumes the already-mapped `filledForm`.
// ============================================================
import ExcelJS from "exceljs";
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "@/lib/probeform/filler";
import { getRoleSchema, ROLE_REGISTRY } from "@/lib/probeform/registry";
import { config } from "@/lib/config";
import type {
  InterviewMetadata,
  FilledProbeForm,
  TranscriptSegment,
  SimpleAssessment,
} from "@/types/index";

/** Shared filename convention across both generators. */
function probeFormFilename(interview: InterviewMetadata): string {
  const safeName = (interview.candidateName || "candidate")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  return `probe-form-${interview.id.slice(0, 8)}-${safeName}.xlsx`;
}

export interface GenerateProbeFormOptions {
  /** SHA-256 of the source transcript (vttRaw or fallback) — stamped on the _meta sheet. */
  transcriptSha256: string;
  testMode?: boolean;
  /** When testMode is true, "role/outcome" identifier of the fixture bundle used. */
  fixtureId?: string;
}

export interface GenerateProbeFormResult {
  buffer: Buffer;
  filename: string;
}

export async function generateProbeForm(
  interview: InterviewMetadata,
  _transcript: TranscriptSegment[],
  filledForm: FilledProbeForm,
  options: GenerateProbeFormOptions
): Promise<GenerateProbeFormResult> {
  const schema = getRoleSchema(interview.roleId);
  if (!schema) {
    throw new Error(
      `generateProbeForm: unknown roleId "${interview.roleId}" — registry has: ` +
      Object.keys(ROLE_REGISTRY).join(", ")
    );
  }

  const wb = await loadTemplate(schema.excelTemplate);
  fillProbeForm(wb, schema, filledForm);

  addMetaSheet(wb, {
    app: "interviewly",
    version: "0.1.0",
    modelProvider: config.llm.provider,
    modelId: config.llm.modelId,
    generatedAt: new Date().toISOString(),
    meetingId: options.testMode
      ? `TEST_MODE:${options.fixtureId ?? "unknown"}`
      : (interview.meetingId ?? "unknown"),
    transcriptSha256: options.transcriptSha256,
    recruiterEmail: config.ms.organizerEmail,
    botUserEmail: config.ms.botUserEmail,
    testMode: !!options.testMode,
    fixtureId: options.fixtureId,
  });

  const buffer = await toBuffer(wb);
  return { buffer, filename: probeFormFilename(interview) };
}

// ============================================================
// Phase-P3 (2026-06-01) — simple single-sheet probe form for
// non-technical roles (customer-service). Built from scratch with
// ExcelJS — NO template, NO React/Career-Stage columns. Five columns:
// Category | Competency | Rating | Evidence | Notes. Driven by a
// SimpleAssessment (from mapTranscriptToSimpleAssessment).
// ============================================================

const HEADER_FILL = "FFE5E5F1"; // light teams-purple (ARGB)

export async function generateSimpleProbeForm(
  interview: InterviewMetadata,
  assessment: SimpleAssessment
): Promise<GenerateProbeFormResult> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Assessment");

  ws.columns = [
    { width: 22 }, { width: 42 }, { width: 22 }, { width: 50 }, { width: 30 },
  ];

  // Title (row 1, merged A1:E1)
  ws.mergeCells("A1:E1");
  const title = ws.getCell("A1");
  title.value = "Customer Service Associate — Candidate Assessment";
  title.font = { bold: true, size: 14 };

  // Header rows 2-5
  const evalDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rowKV = (rowNum: number, label: string, value: string) => {
    ws.getCell(`A${rowNum}`).value = label;
    ws.getCell(`A${rowNum}`).font = { bold: true };
    ws.getCell(`B${rowNum}`).value = value;
  };
  rowKV(2, "Candidate:", interview.candidateName);
  rowKV(3, "Interview date:", evalDate);
  rowKV(4, "Overall verdict:", assessment.verdict);
  rowKV(5, "Confidence:", assessment.confidence.toFixed(2));
  // Row 6 blank

  // Column headers (row 7, bold, purple fill)
  const headerLabels = ["Category", "Competency", "Rating", "Evidence from interview", "Notes"];
  headerLabels.forEach((label, i) => {
    const cell = ws.getRow(7).getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  // Data rows (8+) — one per competency
  let r = 8;
  for (const row of assessment.rows) {
    ws.getCell(`A${r}`).value = row.category;
    ws.getCell(`B${r}`).value = row.competency;
    ws.getCell(`C${r}`).value = row.rating;
    ws.getCell(`D${r}`).value = row.evidence;
    ws.getCell(`E${r}`).value = row.notes;
    // wrap text on B/D/E
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`E${r}`).alignment = { wrapText: true, vertical: "top" };
    r++;
  }

  // Recommendation + sign-off (blank row between)
  r += 1;
  ws.getCell(`A${r}`).value = "Recommendation:";
  ws.getCell(`A${r}`).font = { bold: true };
  ws.getCell(`B${r}`).value = assessment.recommendation;
  ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
  r += 2;
  ws.getCell(`A${r}`).value = "Recruiter sign-off:";
  ws.getCell(`A${r}`).font = { bold: true };

  const buffer = await toBuffer(wb);
  return { buffer, filename: probeFormFilename(interview) };
}
