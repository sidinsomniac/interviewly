import type { InterviewMetadata } from "@/types/index";
import { persistInterviews, loadInterviews } from "@/lib/persist";

const globalForStore = globalThis as unknown as {
  __interviewlyInterviews?: Map<string, InterviewMetadata>;
};

const interviews: Map<string, InterviewMetadata> =
  globalForStore.__interviewlyInterviews ?? loadInterviews();

if (process.env.NODE_ENV !== "production") {
  globalForStore.__interviewlyInterviews = interviews;
}

// Phase J — re-arm scheduled auto-starts after load. Dynamic import breaks
// the store ↔ scheduler cycle (scheduler imports store.list()). Fires once
// per process start; idempotent on re-evaluation in dev because the
// scheduler's own timer map is globalThis-pinned.
const globalForStoreInit = globalThis as unknown as { __medhaSchedulerRestored?: boolean };
if (!globalForStoreInit.__medhaSchedulerRestored) {
  globalForStoreInit.__medhaSchedulerRestored = true;
  import("@/lib/interviewScheduler")
    .then((m) => m.restoreSchedules())
    .catch((err) => {
      console.warn("store: restoreSchedules failed", err);
    });
}

export const store = {
  create(data: Omit<InterviewMetadata, "id" | "createdAt" | "updatedAt">): InterviewMetadata {
    const now = new Date().toISOString();
    const interview: InterviewMetadata = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    interviews.set(interview.id, interview);
    persistInterviews(interviews);
    return interview;
  },

  get(id: string): InterviewMetadata | undefined {
    return interviews.get(id);
  },

  /**
   * Phase J fix — sync the in-memory map with a fresher copy that came
   * from disk (or any external source). DOES NOT call persistInterviews —
   * the caller already knows the disk copy is the source; round-tripping
   * would create a write cycle with the merge logic in persist.ts. Used
   * by GET /api/interviews/[id] when the in-memory copy looks stuck.
   */
  set(id: string, iv: InterviewMetadata): void {
    interviews.set(id, iv);
  },

  update(id: string, patch: Partial<InterviewMetadata>): InterviewMetadata | undefined {
    const existing = interviews.get(id);
    if (!existing) return undefined;
    const updated: InterviewMetadata = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
    interviews.set(id, updated);
    persistInterviews(interviews);
    return updated;
  },

  list(): InterviewMetadata[] {
    return Array.from(interviews.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  delete(id: string): boolean {
    const deleted = interviews.delete(id);
    if (deleted) persistInterviews(interviews);
    return deleted;
  },
};
