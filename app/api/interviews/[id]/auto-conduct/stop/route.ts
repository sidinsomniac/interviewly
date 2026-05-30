// ============================================================
// Scope X: stop the Auto-Conductor for an interview.
// Cancels the server timer and marks autoConduct.active=false on the
// store. Idempotent — calling stop when nothing is running is fine.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { stopAutoConduct } from "@/lib/autoConductor";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  stopAutoConduct(id);

  if (interview.autoConduct) {
    store.update(id, {
      autoConduct: { ...interview.autoConduct, active: false },
    });
  }

  return NextResponse.json({ ok: true });
}
