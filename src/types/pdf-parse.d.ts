// Ambient declaration for the inner-path import of pdf-parse.
// We use `pdf-parse/lib/pdf-parse.js` (not the top-level package)
// to avoid pdf-parse's vestigial test-fixture probe at module load —
// see src/lib/screening/parseResume.ts.
//
// The top-level package ships @types via `@types/pdf-parse` (DefinitelyTyped),
// but the inner path isn't covered. This minimal declaration types it.

declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }
  function pdfParse(buffer: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
