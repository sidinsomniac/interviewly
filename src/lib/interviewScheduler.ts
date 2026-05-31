// ============================================================
// Phase J — server-side scheduler for Mode B interviews.
//
// Fires /api/interviews/{id}/auto-conduct/start automatically at
// `interview.scheduledFor` (set by /api/schedule-interview's n8n flow).
// No recruiter click required for n8n-scheduled Mode B interviews.
//
// Architecture mirrors src/lib/autoConductor.ts:
//   - globalThis-singleton timer Map survives dev hot reloads
//   - setTimeout handles, not absolute schedules, so cancellation is cheap
//   - restoreSchedules() runs once at server start (called from store.ts
//     after the JSON load) to re-arm timers across `pnpm dev` restarts.
//
// Manual /api/interviews creations are unaffected: they never have a
// scheduledFor field and the recruiter still drives Post Welcome →
// Start Auto-Conduct themselves.
// ============================================================
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { store } from "@/lib/store";

const globalForScheduler = globalThis as unknown as {
  __medhaInterviewScheduler?: Map<string, NodeJS.Timeout>;
};

const timers: Map<string, NodeJS.Timeout> =
  globalForScheduler.__medhaInterviewScheduler ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForScheduler.__medhaInterviewScheduler = timers;
}

// Phase N (2026-05-31) — cache the main-server check once at boot.
// Compile-worker processes spawned by Next 16's webpack/turbopack lack
// `start-server.js` in argv[1] — they have something like
// `.../next/dist/compiled/.../...` instead — so this heuristic cleanly
// separates main from worker. Cheap O(1) string suffix check; no IPC, no
// env-var coordination required. Used to gate restoreSchedules() so
// worker processes don't re-arm every persisted interview's timer (which,
// when scheduledFor is past, stampedes /auto-conduct/start with ~30
// duplicate POSTs per cold start). If Next renames the entry file in a
// future minor, the diagnostic log below will show `isMainServer:false`
// for every PID — that's the signal to revisit this heuristic.
const IS_MAIN_SERVER =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("start-server.js");

/**
 * Arm a one-shot timer that fires /auto-conduct/start at the given ISO time.
 * Idempotent — replaces any existing timer for this interviewId.
 * Past times fire immediately (covers restoreSchedules across a long
 * `pnpm dev` restart where scheduledFor already passed).
 */
export function scheduleAutoStart(interviewId: string, scheduledAtIso: string): void {
  cancelScheduledStart(interviewId); // idempotent replace
  const delayMs = Date.parse(scheduledAtIso) - Date.now();
  if (isNaN(delayMs)) {
    log.warn({ interviewId, scheduledAtIso }, "scheduleAutoStart: unparseable date");
    return;
  }
  if (delayMs <= 0) {
    log.info({ interviewId, delayMs }, "scheduleAutoStart: scheduledAt in the past — firing now");
    void triggerStart(interviewId);
    return;
  }
  const handle = setTimeout(() => {
    timers.delete(interviewId);
    void triggerStart(interviewId);
  }, delayMs);
  timers.set(interviewId, handle);
  log.info({ interviewId, scheduledAtIso, delayMs }, "scheduleAutoStart: armed");
}

/** Cancel any pending auto-start. Idempotent — no-op if nothing scheduled. */
export function cancelScheduledStart(interviewId: string): void {
  const handle = timers.get(interviewId);
  if (!handle) return;
  clearTimeout(handle);
  timers.delete(interviewId);
  log.info({ interviewId }, "scheduleAutoStart: cancelled");
}

/**
 * Fire the start route server-internally. Same code path the recruiter
 * button uses — POST to /api/interviews/{id}/auto-conduct/start. Uses
 * config.app.baseUrl which is set on the server. No X-Medha-Secret
 * required (that's only for bot→Medha endpoints).
 */
async function triggerStart(interviewId: string): Promise<void> {
  log.info({ interviewId }, "scheduledStart: firing for interview");
  try {
    const baseUrl = config.app.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/interviews/${interviewId}/auto-conduct/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.text();
      log.warn(
        { interviewId, status: res.status, body: body.slice(0, 300) },
        "scheduledStart: /auto-conduct/start non-2xx"
      );
    } else {
      log.info({ interviewId }, "scheduledStart: /auto-conduct/start succeeded");
    }
  } catch (err) {
    log.error(
      { interviewId, err: err instanceof Error ? err.message : String(err) },
      "scheduledStart: fetch threw (interview will not auto-start)"
    );
  }
}

// Phase J fix — belt-and-braces idempotency. Even with the globalThis
// guard in store.ts that wraps the dynamic import, direct callers (tests,
// scripts) or unusual re-import paths can race this function. Module-scope
// flag ensures the iteration runs at most once per process lifetime.
let _restored = false;

/**
 * Called once at server startup from src/lib/store.ts after the JSON
 * load. Re-arms timers for all "scheduled" Mode B interviews whose
 * scheduledFor is set. Critical for `pnpm dev` restarts — without this,
 * hot-reload kills the in-memory timers and scheduled interviews
 * silently never fire.
 *
 * Idempotent — second call within the same process is a no-op.
 */
export function restoreSchedules(): void {
  if (_restored) return;
  _restored = true;

  // Phase N (2026-05-31) — only the main server arms timers. Compile
  // workers IMPORT this module too (via store.ts's lazy import), but
  // they exit after serving their compile request — re-arming setTimeout
  // there is wasted work and, when scheduledFor is in the past,
  // stampedes /auto-conduct/start. We still emit the log line in workers
  // (with count:0, isMainServer:false) so the diagnostic proves the gate
  // is doing its job.
  if (IS_MAIN_SERVER) {
    for (const iv of store.list()) {
      if (
        iv.conductMode === "auto" &&
        iv.status === "scheduled" &&
        iv.scheduledFor
      ) {
        scheduleAutoStart(iv.id, iv.scheduledFor);
      }
    }
  }
  log.info(
    { count: timers.size, isMainServer: IS_MAIN_SERVER, pid: process.pid },
    "restoreSchedules: complete"
  );
}
