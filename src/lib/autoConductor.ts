// ============================================================
// Scope X — Chat-keyword Auto-Conductor
//
// One long-lived server timer per active interview. Every 5s the
// timer wakes up and either:
//   (a) advances if the per-question deadline has passed, or
//   (b) scans new chat messages from the candidate for a trigger
//       keyword ("done" / "next" / "ready") and advances on match.
//
// Manages state via:
//   - `interview.autoConduct` in the store (the index, deadline,
//     lastSeenChatMessageId — durable across tick calls)
//   - a globalThis-singleton map of NodeJS.Timeout handles (ephemeral
//     in-memory state; doesn't survive Next.js hot reload)
//
// If `pnpm dev` restarts mid-interview, the store still says
// `autoConduct.active=true` but the timer is gone. The recruiter
// clicks Start again to revive (the /start route resets state).
// ============================================================
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { resolveOrganizerGuid } from "@/lib/graph/transcript";
import {
  fetchChatMessagesSince,
  stripHtml,
  type ChatMessage,
} from "@/lib/graph/chatHistory";
import { sendChatMessage } from "@/lib/graph/chat";
import { postQuestionByIndex } from "@/lib/postQuestion";
import { shouldBranch } from "@/lib/llm/branching";
import type { BranchingDecision, LiveTranscriptChunk } from "@/types/index";

interface ConductorContext {
  opts: Required<AutoConductOpts>;
  botUserGuid: string;
  organizerGuid: string;
}

export interface AutoConductOpts {
  perQuestionTimeoutMs?: number;
  triggerKeywords?: string[];
  pollIntervalMs?: number;
}

const DEFAULTS: Required<AutoConductOpts> = {
  perQuestionTimeoutMs: 8 * 60_000,
  triggerKeywords: ["done", "next", "ready"],
  pollIntervalMs: 5_000,
};

// Phase N (2026-05-31) — auto-leave watchdog thresholds. Pre-consent
// window is more lenient because a slow-joining candidate may still be
// reading the consent banner; post-consent is tight because a 60s
// silence mid-interview means the recruiter/candidate left and the bot
// is now alone in the meeting eating Speech minutes. Both env-tunable
// via .env.local — see .env.local.example for documentation.
const HUMAN_IDLE_POST_CONSENT_MS = Number(
  process.env.MEDHA_HUMAN_IDLE_TIMEOUT_MS ?? 60_000
);
const HUMAN_IDLE_PRE_CONSENT_MS = Number(
  process.env.MEDHA_PRE_CONSENT_IDLE_TIMEOUT_MS ?? 180_000
);

const globalForAutoConductor = globalThis as unknown as {
  __medhaAutoConductorTimers?: Map<string, NodeJS.Timeout>;
  __medhaAutoConductorContexts?: Map<string, ConductorContext>;
};

const timers: Map<string, NodeJS.Timeout> =
  globalForAutoConductor.__medhaAutoConductorTimers ?? new Map();
const contexts: Map<string, ConductorContext> =
  globalForAutoConductor.__medhaAutoConductorContexts ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForAutoConductor.__medhaAutoConductorTimers = timers;
  globalForAutoConductor.__medhaAutoConductorContexts = contexts;
}

export function isAutoConductRunning(interviewId: string): boolean {
  return timers.has(interviewId);
}

/**
 * Resolve and cache the bot + organizer AAD GUIDs once per session.
 * Used by tick() to filter out chat messages from non-candidates.
 * In TEST_MODE the chat poll is skipped entirely so resolution failure
 * is non-fatal (we log and return empty GUIDs).
 */
async function buildContext(opts: Required<AutoConductOpts>): Promise<ConductorContext> {
  if (config.app.testMode) {
    log.info("autoConductor: TEST_MODE — skipping bot/organizer GUID resolution");
    return { opts, botUserGuid: "TEST_MODE", organizerGuid: "TEST_MODE" };
  }
  // Sanity check: the env vars MUST point at different identities. The
  // bot-self filter and organizer filter both depend on these being distinct
  // GUIDs. If they're the same email, the GUIDs would collide and the
  // sender filter would silently let through messages it should block.
  if (config.ms.botUserEmail.toLowerCase() === config.ms.organizerEmail.toLowerCase()) {
    throw new Error(
      "MS_BOT_USER_EMAIL and MS_ORGANIZER_EMAIL must be different — " +
      "the bot user and the recruiter cannot share an identity"
    );
  }
  const [botUserGuid, organizerGuid] = await Promise.all([
    resolveOrganizerGuid(config.ms.botUserEmail),
    resolveOrganizerGuid(config.ms.organizerEmail),
  ]);
  return { opts, botUserGuid, organizerGuid };
}

/**
 * Start the conductor for an interview. No-ops if already running.
 * Caller (typically the /auto-conduct/start route) is responsible for
 * setting interview.autoConduct.active=true + initial state in the store
 * BEFORE calling this.
 */
export async function startAutoConduct(
  interviewId: string,
  rawOpts: AutoConductOpts = {}
): Promise<void> {
  if (timers.has(interviewId)) {
    log.warn({ interviewId }, "autoConductor: start no-op — already running");
    return;
  }
  const opts: Required<AutoConductOpts> = {
    perQuestionTimeoutMs: rawOpts.perQuestionTimeoutMs ?? DEFAULTS.perQuestionTimeoutMs,
    triggerKeywords: rawOpts.triggerKeywords ?? DEFAULTS.triggerKeywords,
    pollIntervalMs: rawOpts.pollIntervalMs ?? DEFAULTS.pollIntervalMs,
  };
  const ctx = await buildContext(opts);
  contexts.set(interviewId, ctx);
  // Permanent diagnostic — empty / mismatched GUIDs here are the most
  // common cause of "the bot-filter let a message through" surprises.
  // Visible at startup means we can rule it in/out in one glance.
  log.info(
    { interviewId, botUserGuid: ctx.botUserGuid, organizerGuid: ctx.organizerGuid, opts },
    "autoConductor: started"
  );

  // Recursive setTimeout — avoids overlapping ticks if a Graph call is
  // slow. Each tick schedules the next at the end of its work.
  const scheduleNext = () => {
    if (!timers.has(interviewId)) return; // stop requested
    const handle = setTimeout(async () => {
      await tick(interviewId);
      scheduleNext();
    }, opts.pollIntervalMs);
    timers.set(interviewId, handle);
  };

  // Insert a sentinel so isAutoConductRunning returns true between
  // schedule cycles.
  timers.set(interviewId, setTimeout(() => {}, 0));
  scheduleNext();
}

export function stopAutoConduct(interviewId: string): void {
  const handle = timers.get(interviewId);
  if (handle) clearTimeout(handle);
  timers.delete(interviewId);
  contexts.delete(interviewId);
  log.info({ interviewId }, "autoConductor: stopped");
}

/** External (Skip-button-driven) advance — re-uses the same path as a tick advance. */
export async function forceAdvance(interviewId: string): Promise<void> {
  await advance(interviewId, "skip");
}

// ── Scope Y: handleBranching ────────────────────────────────────
//
// Called from /api/interviews/[id]/live-transcript when a non-bot,
// non-organizer final chunk arrives. Decides via DeepSeek whether to
// post a branching follow-up question (without advancing the index)
// or just record a "we considered, said no" entry. The
// branchingInFlight Set debounces concurrent invocations per interview.
//
// Caps:
//   - 3 branches per planned question (enforced here AND in the LLM prompt)
//   - 30 char minimum on the candidate's chunk (filters "yes" / "I agree")
//   - +90s deadline extension per branch (gives candidate time to answer the follow-up)
const branchingInFlight: Set<string> = new Set();
const BRANCHING_CAP_PER_QUESTION = 3;
const BRANCHING_MIN_CHARS = 30;
const BRANCHING_DEADLINE_EXTEND_MS = 90_000;

export async function handleBranching(
  interviewId: string,
  chunk: LiveTranscriptChunk
): Promise<void> {
  if (branchingInFlight.has(interviewId)) {
    log.debug({ interviewId }, "handleBranching: skipped (already in flight)");
    return;
  }

  const interview = store.get(interviewId);
  if (!interview) return;
  if (!interview.autoConduct?.active) return;

  const currentIndex = interview.autoConduct.currentQuestionIndex;
  if (currentIndex < 0) return; // no question posted yet
  const questions = interview.questionPlan?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return;
  const plannedNext = questions[currentIndex + 1] ?? null;

  if (chunk.text.trim().length < BRANCHING_MIN_CHARS) {
    log.debug({ interviewId, len: chunk.text.length }, "handleBranching: skipped (chunk too short)");
    return;
  }

  // Cap check: count prior branches on THIS question
  const priorBranches = (interview.branchingHistory ?? []).filter(
    (d) => d.basedOnQuestionIndex === currentIndex && d.action === "branch"
  ).length;
  if (priorBranches >= BRANCHING_CAP_PER_QUESTION) {
    log.info({ interviewId, currentIndex, priorBranches }, "handleBranching: skipped (cap reached)");
    return;
  }

  branchingInFlight.add(interviewId);
  store.update(interviewId, { branchingInFlight: true });

  try {
    const decision = await shouldBranch({
      candidateAnswer: chunk.text,
      currentQuestion,
      plannedNext,
      candidateName: interview.candidateName,
      priorBranches,
      interviewId,
    });
    decision.basedOnQuestionIndex = currentIndex;

    if (decision.action === "branch" && decision.branchQuestionText) {
      const html =
        `<p><strong>↳ Follow-up</strong></p>` +
        `<p>${decision.branchQuestionText}</p>`;
      let messageId: string;
      if (config.app.testMode || !interview.chatId) {
        messageId = `test-mode-branch-${Date.now()}`;
        log.warn(
          { interviewId, chatId: interview.chatId },
          "handleBranching: TEST_MODE — skipping Graph chat post; stamping decision only"
        );
        decision.testMode = true;
      } else {
        messageId = await sendChatMessage(interview.chatId, html);
      }
      log.info(
        { interviewId, currentIndex, messageId, branchQuestionText: decision.branchQuestionText },
        "handleBranching: posted branching follow-up"
      );

      // Phase J — extend the per-question deadline so the candidate isn't
      // cut off by the original advance() timer. Re-reads store to avoid
      // stomping any state another path may have set in between. Floors at
      // "now" so an already-expired deadline gets bumped forward from now
      // rather than from the past.
      const freshForExtend = store.get(interviewId);
      if (freshForExtend?.autoConduct) {
        const currentMs = Math.max(
          Date.now(),
          Date.parse(freshForExtend.autoConduct.nextQuestionDeadline) || Date.now()
        );
        const extendedDeadline = new Date(currentMs + BRANCHING_DEADLINE_EXTEND_MS).toISOString();
        store.update(interviewId, {
          autoConduct: { ...freshForExtend.autoConduct, nextQuestionDeadline: extendedDeadline },
        });
        log.info(
          {
            interviewId,
            basedOnQuestionIndex: currentIndex,
            newDeadline: extendedDeadline,
            extendMs: BRANCHING_DEADLINE_EXTEND_MS,
          },
          "autoConductor: extended deadline for branch"
        );
      }
    } else {
      log.info(
        { interviewId, currentIndex, reasoning: decision.reasoning.slice(0, 100) },
        "handleBranching: continued (no branch)"
      );
    }

    const fresh = store.get(interviewId);
    const newHistory: BranchingDecision[] = [...(fresh?.branchingHistory ?? []), decision];
    store.update(interviewId, { branchingHistory: newHistory });
  } catch (err) {
    log.error(
      { interviewId, err: err instanceof Error ? err.message : String(err) },
      "handleBranching failed (non-fatal)"
    );
  } finally {
    branchingInFlight.delete(interviewId);
    store.update(interviewId, { branchingInFlight: false });
  }
}

// ── Internal: tick + advance ───────────────────────────────────

async function tick(interviewId: string): Promise<void> {
  try {
    const interview = store.get(interviewId);
    if (!interview) {
      log.warn({ interviewId }, "autoConductor: tick — interview gone, stopping");
      stopAutoConduct(interviewId);
      return;
    }
    if (
      interview.status === "completed" ||
      interview.status === "failed" ||
      !interview.autoConduct?.active
    ) {
      log.info(
        { interviewId, status: interview.status, active: interview.autoConduct?.active },
        "autoConductor: tick — stop condition met"
      );
      stopAutoConduct(interviewId);
      return;
    }

    const ac = interview.autoConduct;
    const ctx = contexts.get(interviewId);
    if (!ctx) {
      log.warn({ interviewId }, "autoConductor: tick — missing context (server restarted?), stopping");
      stopAutoConduct(interviewId);
      return;
    }

    // Permanent diagnostic — prints the per-tick state so we can read off
    // the terminal exactly what the conductor sees. Indispensable for
    // diagnosing future "why did it advance?" mysteries.
    log.info(
      {
        interviewId,
        awaitingConsent: ac.awaitingConsent ?? false,
        currentQuestionIndex: ac.currentQuestionIndex,
        lastSeenChatMessageId: ac.lastSeenChatMessageId ?? null,
        lastHumanActivityAt: ac.lastHumanActivityAt ?? null,
      },
      "autoConductor: tick"
    );

    // Phase N (2026-05-31) — auto-leave watchdog. Fires BEFORE the consent
    // gate so it kicks in for both pre-consent (slow/no-show candidate)
    // and post-consent (recruiter walked away mid-interview) states.
    // endInterview() internally calls /api/bot/leave via finalize(), so
    // the bot exits cleanly. Fire-and-forget so the tick returns; the
    // next tick will see status:"completed" and stopAutoConduct from
    // the existing stop-condition block above. Falls back to startedAt
    // if lastHumanActivityAt isn't set yet (legacy records or first tick
    // before any update has fired).
    const idleMs = Date.now() - Date.parse(ac.lastHumanActivityAt ?? ac.startedAt);
    const idleLimit = ac.awaitingConsent
      ? HUMAN_IDLE_PRE_CONSENT_MS
      : HUMAN_IDLE_POST_CONSENT_MS;
    if (idleMs > idleLimit) {
      log.warn(
        {
          interviewId,
          idleMs,
          idleLimit,
          awaitingConsent: ac.awaitingConsent ?? false,
        },
        "autoConductor: no human activity — ending interview"
      );
      // Dynamic import to dodge the circular reference (endInterview.ts
      // → /api/bot/leave fetch is fine, but endInterview imports nothing
      // from this module today; using dynamic import here keeps the bot
      // call path lazy and ensures this file stays cheap to import).
      const { endInterview } = await import("@/lib/endInterview");
      void endInterview(interviewId).catch((err) =>
        log.error(
          { interviewId, err: err instanceof Error ? err.message : String(err) },
          "autoConductor: watchdog endInterview threw"
        )
      );
      stopAutoConduct(interviewId);
      return;
    }

    // Phase H — Mode B consent gate. Short-circuits BOTH the timeout path
    // and the keyword path until the candidate types /\bi\s+agree\b/i in
    // chat. Scanning logic mirrors the keyword loop below (same chat fetch,
    // same bot/organizer filter, same lastSeenChatMessageId persistence).
    if (ac.awaitingConsent) {
      // In TEST_MODE the chat poll is stubbed — skip the scan but still
      // short-circuit so the timeout path doesn't fire and accidentally
      // advance past consent. Tests don't currently exercise this path.
      if (config.app.testMode) {
        log.debug({ interviewId }, "autoConductor: tick — awaitingConsent + TEST_MODE, holding");
        return;
      }
      const sinceIso = ac.lastSeenChatMessageId
        ? await seedSinceDateTime(interview.chatId!, ac.lastSeenChatMessageId)
        : undefined;
      const messages = await fetchChatMessagesSince(interview.chatId!, sinceIso);
      let lastSeenId = ac.lastSeenChatMessageId;
      let consented = false;
      // Phase N — track whether any non-bot, non-empty, non-consent-template
      // text was observed this tick. Bundles into the single store.update
      // below so we don't fan out per-message writes.
      let sawHumanText = false;
      for (const msg of messages) {
        lastSeenId = msg.id;
        const fromId = msg.from?.user?.id;
        // Bot's OWN consent post must never trigger detection. Note we do NOT
        // filter the organizer here (unlike the keyword loop below) — Mode A's
        // keyword loop excludes the recruiter because they have the Skip button
        // in the dashboard, but Mode B's consent gate must let through candidates
        // who happen to share an organizer-flavoured identity. False positives
        // are near-zero (recruiters wouldn't type "I agree" in production).
        if (fromId === ctx.botUserGuid) continue;
        const text = msg.body?.contentType === "html"
          ? stripHtml(msg.body.content ?? "")
          : (msg.body?.content ?? "").trim();
        if (!text) continue;
        // Belt-and-braces: skip the consent message by content prefix even
        // if the sender filter ever misses it. The consent template's
        // stripped text starts with "Hi! I'm Medha" (see MEDHA_CONSENT_CHAT_HTML);
        // no real candidate utterance starts with that phrase. Cheap O(prefix).
        if (text.startsWith("Hi! I'm Medha")) continue;
        // This message is a substantive non-bot utterance — count it as
        // human activity even if it doesn't match the consent regex.
        sawHumanText = true;
        // Word-boundary "I agree" — case-insensitive, tolerant of trailing
        // punctuation ("I agree.") and surrounding text ("yes I agree to
        // proceed"). Excludes "disagree" and "i'm agreeable".
        if (/\bi\s+agree\b/i.test(text)) {
          consented = true;
          break;
        }
      }
      // Persist lastSeenId (and consent flip if matched) in a single update.
      // Phase N — also persist lastHumanActivityAt if we saw substantive
      // non-bot text this tick.
      const newActivityStamp = sawHumanText
        ? new Date().toISOString()
        : ac.lastHumanActivityAt;
      const patch = consented
        ? {
            ...ac,
            lastSeenChatMessageId: lastSeenId,
            lastHumanActivityAt: newActivityStamp,
            awaitingConsent: false,
            consentReceivedAt: new Date().toISOString(),
          }
        : {
            ...ac,
            lastSeenChatMessageId: lastSeenId,
            lastHumanActivityAt: newActivityStamp,
          };
      if (
        lastSeenId !== ac.lastSeenChatMessageId ||
        consented ||
        newActivityStamp !== ac.lastHumanActivityAt
      ) {
        store.update(interviewId, { autoConduct: patch });
      }
      if (consented) {
        log.info({ interviewId }, "autoConductor: consent received, advancing to Q1");
        await advance(interviewId, "keyword");
      }
      return; // hold — do NOT fall through to timeout/keyword paths
    }

    // Timeout path
    if (Date.now() > Date.parse(ac.nextQuestionDeadline)) {
      await advance(interviewId, "timeout");
      return;
    }

    // Chat-keyword path (skipped in TEST_MODE — stub chatId would 404)
    if (config.app.testMode) return;

    const newMessages = await fetchChatMessagesSince(
      interview.chatId!,
      ac.lastSeenChatMessageId
        ? // we stored only the id; convert by looking it up against the seed time.
          // Simpler: we track createdDateTime alongside id below by stamping ac.lastSeenChatMessageId
          // with the id of the most recent message, and rely on fetchChatMessagesSince's
          // createdDateTime comparison. To keep the API clean we pass undefined here
          // when we have no message id seed — the start route seeds the id from the
          // latest message at start time so subsequent calls do filter correctly.
          // (Behaviour: we re-fetch the last 20 and compare against the timestamp of
          // the message whose id matches the seed; if not found we fall back to all 20.)
          await seedSinceDateTime(interview.chatId!, ac.lastSeenChatMessageId)
        : undefined
    );

    let triggered: ChatMessage | null = null;
    let lastSeenId = ac.lastSeenChatMessageId;
    // Phase N — bundle lastHumanActivityAt updates into the same single
    // store.update at the end of the loop. sawHumanText is true if any
    // non-bot, non-empty message was observed.
    let sawHumanText = false;
    for (const msg of newMessages) {
      lastSeenId = msg.id;
      const fromId = msg.from?.user?.id;
      const text = msg.body?.contentType === "html"
        ? stripHtml(msg.body.content ?? "")
        : (msg.body?.content ?? "").trim();

      // Phase J diagnostic — fires once per scanned message. Lets us see
      // whether the bot/organizer filter, the text shape, or the regex is
      // the gate that dropped a candidate's "Done". Keep permanent — the
      // volume is bounded by ac.lastSeenChatMessageId persistence (we only
      // scan NEW messages per 5s tick).
      log.info(
        {
          interviewId,
          msgId: msg.id,
          fromId: fromId ?? "(no user id — guest?)",
          fromDisplayName: msg.from?.user?.displayName ?? null,
          fromAdditionalKeys: msg.from?.user
            ? Object.keys((msg.from.user as unknown as Record<string, unknown>) ?? {})
            : null,
          textSample: text.slice(0, 80),
          isBotFilter: fromId === ctx.botUserGuid,
          isOrgFilter: fromId === ctx.organizerGuid,
        },
        "autoConductor: scanning chat message"
      );

      // Phase J reversal — drop the organizer half of the filter (was:
      // `|| fromId === ctx.organizerGuid`). Same reasoning as the consent
      // path: candidates joining as the organizer identity (or sharing it
      // via AAD collision) must be able to advance with "Done". The earlier
      // worry about recruiters accidentally typing "done" is mitigated by
      // the Skip + Stop buttons in the dashboard.
      if (fromId === ctx.botUserGuid) continue;
      if (!text) continue;
      // Substantive non-bot message — stamps the watchdog clock.
      sawHumanText = true;
      const lower = text.toLowerCase();
      const matched = ctx.opts.triggerKeywords.some((kw) =>
        new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(lower)
      );
      if (matched) {
        triggered = msg;
        break;
      }
    }

    // Persist lastSeen + lastHumanActivityAt even if we didn't trigger —
    // avoids re-scanning old msgs AND keeps the watchdog fresh.
    const newActivityStamp = sawHumanText
      ? new Date().toISOString()
      : ac.lastHumanActivityAt;
    const lastSeenChanged = !!lastSeenId && lastSeenId !== ac.lastSeenChatMessageId;
    const activityChanged = newActivityStamp !== ac.lastHumanActivityAt;
    if (lastSeenChanged || activityChanged) {
      store.update(interviewId, {
        autoConduct: {
          ...ac,
          lastSeenChatMessageId: lastSeenId,
          lastHumanActivityAt: newActivityStamp,
        },
      });
    }

    if (triggered) {
      log.info(
        { interviewId, triggerMessageId: triggered.id, fromId: triggered.from?.user?.id },
        "autoConductor: keyword trigger detected"
      );
      await advance(interviewId, "keyword");
    }
  } catch (err) {
    // Spec: never let the interval crash. Log and keep ticking.
    log.error(
      { interviewId, err: err instanceof Error ? err.message : String(err) },
      "autoConductor: tick failed (continuing)"
    );
  }
}

async function advance(
  interviewId: string,
  trigger: "timeout" | "keyword" | "skip"
): Promise<void> {
  const interview = store.get(interviewId);
  if (!interview || !interview.autoConduct?.active) return;

  const ctx = contexts.get(interviewId);
  const timeoutMs = ctx?.opts.perQuestionTimeoutMs ?? interview.autoConduct.perQuestionTimeoutMs;

  const nextIndex = interview.autoConduct.currentQuestionIndex + 1;
  const totalQuestions = interview.questionPlan?.questions.length ?? 0;

  if (nextIndex >= totalQuestions) {
    log.info({ interviewId, trigger, totalQuestions }, "autoConductor: all questions posted");
    store.update(interviewId, {
      autoConduct: { ...interview.autoConduct, active: false },
    });
    stopAutoConduct(interviewId);
    return;
  }

  await postQuestionByIndex(interviewId, nextIndex);

  // Phase K — derive the per-question deadline from the next question's
  // own expectedDurationSec when available, falling back to the flat
  // timeoutMs for legacy plans (pre-Phase-K).
  const nextQuestion = interview.questionPlan?.questions[nextIndex];
  const perQuestionMs =
    nextQuestion?.expectedDurationSec != null
      ? nextQuestion.expectedDurationSec * 1000
      : timeoutMs;

  store.update(interviewId, {
    autoConduct: {
      ...interview.autoConduct,
      currentQuestionIndex: nextIndex,
      nextQuestionDeadline: new Date(Date.now() + perQuestionMs).toISOString(),
    },
  });

  log.info(
    {
      interviewId,
      action: "advance",
      index: nextIndex,
      trigger,
      expectedDurationSec: nextQuestion?.expectedDurationSec ?? null,
    },
    "autoConductor: advanced"
  );
}

// ── Helpers ────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Given a chatId + an id-only seed, fetch the latest 20 messages and
 * return the createdDateTime of the seed message so we can do
 * timestamp-based filtering. If the seed is gone (e.g., it's older
 * than the top-20 window), returns undefined → caller treats as
 * "no seed yet" and accepts all 20.
 */
async function seedSinceDateTime(
  chatId: string,
  seedId: string
): Promise<string | undefined> {
  const recent = await fetchChatMessagesSince(chatId);
  const seed = recent.find((m) => m.id === seedId);
  return seed?.createdDateTime;
}
