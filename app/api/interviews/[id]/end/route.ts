// ============================================================
// Recruiter-driven end-of-interview. Calls the shared endInterview()
// helper (src/lib/endInterview.ts), which is idempotent — a second
// click returns { ok: true, alreadyEnded: true } instead of regenerating
// the probe form.
//
// The finalize body lives in src/lib/endInterview.ts now so the
// bot-event route can call the same idempotent entry point without
// duplicating logic. Phase I extraction.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { endInterview } from "@/lib/endInterview";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await endInterview(id);
  if (!result.found) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    alreadyEnded: result.alreadyEnded,
    downloadUrl: `/api/interviews/${id}/probe-form`,
  });
}
