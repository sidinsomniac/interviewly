import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { store } from "@/lib/store";
import { PERSIST_PATH } from "@/lib/persist";
import { log } from "@/lib/logger";
import type { InterviewMetadata } from "@/types/index";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const inMemory = store.get(id);
  if (!inMemory) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  // Phase J fix — band-aid against multi-process persist races: when the
  // in-memory copy looks stuck ("ended" but no probe-form file yet), check
  // the on-disk snapshot directly. Another worker may have written
  // completion since this process loaded its store. After adopting disk's
  // version, back-write it via store.set so subsequent polls on this
  // worker stop re-reading disk. store.set bypasses persistInterviews —
  // no write cycle.
  //
  // Single-process production: the race never happens; disk === in-memory
  // and this branch returns nothing newer.
  if (inMemory.status === "ended" && !inMemory.probeFormFilePath) {
    try {
      const onDisk = JSON.parse(fs.readFileSync(PERSIST_PATH, "utf-8")) as InterviewMetadata[];
      const fresh = onDisk.find((iv) => iv.id === id);
      if (
        fresh &&
        (fresh.status === "completed" ||
          !!fresh.probeFormFilePath ||
          !!fresh.filledForm?.header?.candidateName)
      ) {
        log.info(
          { interviewId: id, inMemStatus: inMemory.status, diskStatus: fresh.status },
          "GET /interviews/[id]: in-memory stale — adopting disk snapshot"
        );
        store.set(id, fresh);
        return NextResponse.json({ ok: true, interview: fresh });
      }
    } catch (err) {
      log.warn(
        { interviewId: id, err: err instanceof Error ? err.message : String(err) },
        "GET /interviews/[id]: disk re-read failed (returning in-memory)"
      );
    }
  }

  return NextResponse.json({ ok: true, interview: inMemory });
}
