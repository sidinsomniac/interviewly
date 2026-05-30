// ============================================================
// Scope X: Skip-button endpoint. Forces the next advance() synchronously
// so the recruiter doesn't have to wait for the tick interval or for
// the candidate to type a keyword.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { forceAdvance } from "@/lib/autoConductor";
import { log } from "@/lib/logger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }
  if (!interview.autoConduct?.active) {
    return NextResponse.json(
      { ok: false, error: "Auto-conduct is not active for this interview." },
      { status: 409 }
    );
  }

  try {
    await forceAdvance(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ interviewId: id, err: message }, "auto-conduct/skip failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const after = store.get(id);
  return NextResponse.json({
    ok: true,
    currentQuestionIndex: after?.autoConduct?.currentQuestionIndex ?? -1,
    active: after?.autoConduct?.active ?? false,
  });
}
