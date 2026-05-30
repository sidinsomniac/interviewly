// ============================================================
// Scope X: cheap GET used by the dashboard's 5s status poll to
// resync the countdown deadline + index. Lighter than refetching
// the whole interview record.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  const ac = interview.autoConduct;
  if (!ac) {
    return NextResponse.json({
      ok: true,
      active: false,
      currentQuestionIndex: -1,
      nextQuestionDeadline: null,
      remainingMs: 0,
    });
  }

  const remainingMs = Math.max(0, Date.parse(ac.nextQuestionDeadline) - Date.now());
  return NextResponse.json({
    ok: true,
    active: ac.active,
    currentQuestionIndex: ac.currentQuestionIndex,
    nextQuestionDeadline: ac.nextQuestionDeadline,
    remainingMs,
  });
}
