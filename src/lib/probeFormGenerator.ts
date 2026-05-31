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
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "@/lib/probeform/filler";
import { getRoleSchema, ROLE_REGISTRY } from "@/lib/probeform/registry";
import { config } from "@/lib/config";
import type { InterviewMetadata, FilledProbeForm, TranscriptSegment } from "@/types/index";

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

  const safeName = (interview.candidateName || "candidate")
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
  const filename = `probe-form-${interview.id.slice(0, 8)}-${safeName}.xlsx`;

  return { buffer, filename };
}
