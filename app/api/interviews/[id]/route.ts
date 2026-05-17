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
  return NextResponse.json({ ok: true, interview });
}
