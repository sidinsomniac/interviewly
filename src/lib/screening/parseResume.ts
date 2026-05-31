// ============================================================
// Phase J — resume text extraction.
//
// Dispatches by filename extension to pdf-parse (PDFs) or mammoth (DOCX).
// Returns plain text, trimmed.
//
// IMPORTANT: pdf-parse's top-level `import pdfParse from "pdf-parse"` runs
// a vestigial test-fixture probe at module-load time and crashes if the
// test PDF isn't present (common in Next.js bundled environments). Use
// the inner module path `pdf-parse/lib/pdf-parse.js` instead.
// ============================================================
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

export async function parseResume(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  throw new Error(`Unsupported resume format: .${ext}. Accept .pdf or .docx.`);
}
