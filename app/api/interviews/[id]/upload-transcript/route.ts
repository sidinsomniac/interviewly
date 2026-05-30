import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { parseVtt } from "@/lib/graph/transcript";
import { finalize } from "@/lib/endInterview";
import type { TranscriptSegment } from "@/types/index";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interview = store.get(id);
    if (!interview) {
      return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file uploaded — use field name 'file'" }, { status: 400 });
    }

    const text = await file.text();
    let segments: TranscriptSegment[];

    if (file.name.endsWith(".vtt") || text.startsWith("WEBVTT")) {
      segments = parseVtt(text);
    } else {
      // Plain text — treat each non-empty line as a segment with no speaker
      segments = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({
          speaker: "Unknown",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          text: line,
        }));
    }

    store.update(id, { status: "ended" });
    void finalize(id, segments);

    return NextResponse.json({ ok: true, segmentsLoaded: segments.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
