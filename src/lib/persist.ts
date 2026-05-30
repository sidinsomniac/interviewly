import fs from "fs";
import path from "path";
import type { InterviewMetadata } from "@/types/index";

/**
 * Persist path — exported so the GET-/-interview route can read it
 * directly for its disk-fresh band-aid (Phase J fix). Single source of
 * truth for the on-disk JSON location.
 */
export const PERSIST_PATH = path.resolve(process.cwd(), "data/output/interviews.json");

/**
 * Race-safe persist write.
 *
 * Pre-fix: `fs.writeFileSync(PERSIST_PATH, stringify(map))` would blow away
 * any entries the disk had that this process's in-memory map didn't carry —
 * exactly the symptom observed under Turbopack's per-request workers, where
 * worker A's snapshot would overwrite worker B's just-completed interview.
 *
 * Fix: read disk → merge (in-memory wins per id, disk-only entries preserved)
 * → write tmp → atomic rename. `fs.renameSync` is atomic on POSIX and on
 * Windows when same-volume (PERSIST_PATH + ".tmp" are sibling paths in the
 * same dir, so always same-volume). Two concurrent writers produce one
 * valid final state instead of a torn file.
 */
export function persistInterviews(map: Map<string, InterviewMetadata>): void {
  try {
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });

    let onDisk: InterviewMetadata[] = [];
    try {
      if (fs.existsSync(PERSIST_PATH)) {
        onDisk = JSON.parse(fs.readFileSync(PERSIST_PATH, "utf-8")) as InterviewMetadata[];
      }
    } catch {
      // Corrupt file — treat as empty rather than crash this write.
    }

    const merged = new Map<string, InterviewMetadata>();
    for (const iv of onDisk) merged.set(iv.id, iv);
    for (const [id, iv] of map.entries()) merged.set(id, iv);

    const tmp = PERSIST_PATH + ".tmp";
    fs.writeFileSync(
      tmp,
      JSON.stringify(Array.from(merged.values()), null, 2),
      "utf-8"
    );
    fs.renameSync(tmp, PERSIST_PATH);
  } catch {
    // Non-fatal — persist failure must not crash the request
  }
}

export function loadInterviews(): Map<string, InterviewMetadata> {
  const map = new Map<string, InterviewMetadata>();
  try {
    if (!fs.existsSync(PERSIST_PATH)) return map;
    const arr = JSON.parse(fs.readFileSync(PERSIST_PATH, "utf-8")) as InterviewMetadata[];
    for (const iv of arr) map.set(iv.id, iv);
  } catch {
    // Non-fatal — corrupt file returns empty map
  }
  return map;
}
