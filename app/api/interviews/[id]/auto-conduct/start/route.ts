// ============================================================
// Scope X: kick off the Auto-Conductor for an interview.
//
// Preconditions:
//   - interview exists
//   - welcomePostedAt is set (recruiter posted the Medha intro first)
//   - status is not completed/failed
//
// Seeds the autoConduct state on the store and calls
// startAutoConduct(id) which sets up the 5s timer.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { startAutoConduct, isAutoConductRunning } from "@/lib/autoConductor";
import { fetchChatMessagesSince } from "@/lib/graph/chatHistory";
import { sendChatMessage } from "@/lib/graph/chat";
import { MEDHA_INTRO_SPEECH, MEDHA_CONSENT_CHAT_HTML } from "@/lib/medhaScripts";

const StartBodySchema = z.object({
  perQuestionTimeoutMs: z.number().int().positive().optional(),
  triggerKeywords: z.array(z.string().min(1)).optional(),
  pollIntervalMs: z.number().int().positive().optional(),
});

// Phase K — legacy fallback only. New plans drive per-question pacing via
// PlannedQuestion.expectedDurationSec (see autoConductor.advance). This
// flat 8-min default only matters for plans generated before Phase K that
// lack the per-question field.
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_KEYWORDS = ["done", "next", "ready"];
const DEFAULT_POLL_MS = 5_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }
  // Phase L post-mortem (2026-05-31) — idempotency guard against the
  // duplicate-bot scenario: stalled UI → double-click Start → N bot/join's,
  // N welcome speeches, N consent posts firing in parallel. Server-side
  // 409 catches the race; client-side disable in QuestionList.tsx catches
  // the click itself. Both ship together.
  if (interview.autoConduct?.active === true) {
    log.info(
      {
        interviewId: id,
        currentQuestionIndex: interview.autoConduct.currentQuestionIndex,
      },
      "auto-conduct/start: idempotency guard — already active, returning 409"
    );
    return NextResponse.json(
      {
        ok: false,
        error: "auto-conduct already active for this interview",
        autoConduct: interview.autoConduct,
      },
      { status: 409 }
    );
  }
  // Phase G: log conductMode but don't branch — Phase H wires Mode B's voice
  // path. Both modes share the transcript-keyword loop today.
  log.info({ interviewId: id, conductMode: interview.conductMode }, "auto-conduct/start: mode");
  // Phase G follow-up: Mode A requires the recruiter to have posted welcome
  // first; Mode B will have Medha speak + post welcome herself from this very
  // route, so the gate must not fire for auto interviews.
  if (interview.conductMode === "manual" && !interview.welcomePostedAt) {
    return NextResponse.json(
      { ok: false, error: "Post the welcome + consent message before starting auto-conduct." },
      { status: 409 }
    );
  }
  if (interview.status === "completed" || interview.status === "failed") {
    return NextResponse.json(
      { ok: false, error: `Cannot start auto-conduct on a ${interview.status} interview.` },
      { status: 409 }
    );
  }

  let body: z.infer<typeof StartBodySchema> = {};
  try {
    const raw = await req.json();
    const parsed = StartBodySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // empty body is fine — use defaults
  }

  const timeoutMs = body.perQuestionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const keywords = body.triggerKeywords ?? DEFAULT_KEYWORDS;
  const pollMs = body.pollIntervalMs ?? DEFAULT_POLL_MS;

  // Seed lastSeenChatMessageId with the most recent message id at start
  // time — so the conductor doesn't immediately trigger on the candidate's
  // earlier "I agree" response to the consent message. In TEST_MODE the
  // chat is a stub so we skip this Graph call.
  let lastSeenChatMessageId: string | undefined;
  if (!config.app.testMode && interview.chatId) {
    try {
      const recent = await fetchChatMessagesSince(interview.chatId);
      lastSeenChatMessageId = recent.length > 0 ? recent[recent.length - 1].id : undefined;
    } catch (err) {
      log.warn(
        { interviewId: id, err: err instanceof Error ? err.message : String(err) },
        "auto-conduct/start: seed fetch failed (continuing without seed)"
      );
    }
  }

  const now = new Date();
  const isAutoMode = interview.conductMode === "auto";
  // Critical: Mode B seeds awaitingConsent: true HERE, before startAutoConduct
  // arms the 5s timer. Otherwise the conductor's first tick can fire while
  // bot/join + 8s wait + /speak + consent post are still in flight (10–25s
  // total), taking the keyword path and potentially matching "Done"/"next"
  // inside the bot's own about-to-be-posted consent message. With the gate
  // set on tick #1, the conductor short-circuits the keyword path until
  // the candidate actually says "I agree". Mode A omits the field — falsy —
  // so its keyword loop runs untouched.
  const updated = store.update(id, {
    autoConduct: {
      active: true,
      startedAt: now.toISOString(),
      currentQuestionIndex: -1, // first advance bumps to 0 and posts Q1
      nextQuestionDeadline: new Date(now.getTime() + timeoutMs).toISOString(),
      lastSeenChatMessageId,
      perQuestionTimeoutMs: timeoutMs,
      triggerKeywords: keywords,
      ...(isAutoMode ? { awaitingConsent: true } : {}),
    },
  });
  if (isAutoMode) {
    log.info(
      { interviewId: id },
      "auto-conduct/start: Mode B — awaitingConsent gate set BEFORE timer arms"
    );
  }

  if (isAutoConductRunning(id)) {
    log.warn({ interviewId: id }, "auto-conduct/start: timer already running — reusing");
  } else {
    await startAutoConduct(id, {
      perQuestionTimeoutMs: timeoutMs,
      triggerKeywords: keywords,
      pollIntervalMs: pollMs,
    });
  }

  // Scope Y: ask the sidecar bot to join the meeting too. Non-fatal —
  // if the bot is unreachable the conductor's keyword/timer paths still
  // drive the interview forward (the dashboard's TranscriptPanel just
  // stays empty). 6-second timeout via AbortController so a hung bot
  // doesn't make Start Auto-Conduct feel laggy.
  //
  // Body shape per the bot's BotController.JoinAsync: organizerOid +
  // threadId are the only IDs the bot actually consumes (it constructs
  // OrganizerMeetingInfo directly, no joinUrl parse). meetingUrl was
  // in the original guard but is unused by the bot — dropped 2026-05-29
  // because schedule-interview doesn't always populate it but the bot
  // can still join successfully without it. meetingId is also unused
  // by the bot today but kept in the guard because Medha's other paths
  // need it.
  const haveBotIds =
    !!interview.organizerGuid &&
    !!interview.chatId;
  let botJoinSucceeded = false;
  if (config.bot.baseUrl && haveBotIds) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${config.bot.baseUrl.replace(/\/$/, "")}/api/bot/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Medha-Secret": config.bot.sharedSecret ?? "",
        },
        body: JSON.stringify({
          interviewId: id,
          joinUrl: interview.meetingUrl,
          meetingId: interview.meetingId,
          organizerOid: interview.organizerGuid,
          threadId: interview.chatId,
          messageId: "0",
          medhaBaseUrl: config.app.baseUrl,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        log.warn(
          { interviewId: id, status: res.status, body: body.slice(0, 300) },
          "auto-conduct/start: bot /api/bot/join returned non-2xx (continuing without bot)"
        );
      } else {
        botJoinSucceeded = true;
        log.info({ interviewId: id }, "auto-conduct/start: bot /api/bot/join succeeded");
      }
    } catch (err) {
      log.warn(
        { interviewId: id, err: err instanceof Error ? err.message : String(err) },
        "auto-conduct/start: bot /api/bot/join failed (continuing — fallback to keyword/timer)"
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  } else {
    log.info(
      {
        interviewId: id,
        hasBaseUrl: !!config.bot.baseUrl,
        haveBotIds,
        organizerGuid: !!interview.organizerGuid,
        chatId: !!interview.chatId,
      },
      "auto-conduct/start: bot /api/bot/join skipped (env or required ids missing)"
    );
  }

  // Phase H — Mode B intro + consent. Only runs for auto interviews
  // when the bot is actually in the call (botJoinSucceeded). The
  // awaitingConsent gate is already set above (BEFORE the conductor's
  // timer was armed), so the conductor is safely holding while this
  // block runs leisurely. Both /speak and sendChatMessage are best-effort.
  if (interview.conductMode === "auto" && botJoinSucceeded) {
    // Give the bot's call enough time to transition Establishing → Established
    // before /speak. The bot's SpeakAsync 404s with "no active call" if invoked
    // mid-handshake. Bumped 5s → 8s (2026-05-30) after Sid saw the first-attempt
    // silent issue from Phase H verification — call object was still Establishing
    // at the 5s mark. Widen further if `bot/speak: no active call` warnings reappear.
    await new Promise((r) => setTimeout(r, 8000));

    // 1) Speak the intro through the bot. Longer timeout than join (TTS
    // synthesis + 20 ms PCM chunk pacing eats a few seconds).
    const speakController = new AbortController();
    const speakTimeout = setTimeout(() => speakController.abort(), 10_000);
    try {
      const res = await fetch(`${config.bot.baseUrl!.replace(/\/$/, "")}/api/bot/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Medha-Secret": config.bot.sharedSecret ?? "",
        },
        body: JSON.stringify({ interviewId: id, text: MEDHA_INTRO_SPEECH }),
        signal: speakController.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        log.warn(
          { interviewId: id, status: res.status, body: body.slice(0, 300) },
          "auto-conduct/start: Mode B /api/bot/speak non-2xx (continuing — chat consent still posts)"
        );
      } else {
        log.info({ interviewId: id }, "auto-conduct/start: Mode B intro speak enqueued");
      }
    } catch (err) {
      log.warn(
        { interviewId: id, err: err instanceof Error ? err.message : String(err) },
        "auto-conduct/start: Mode B /api/bot/speak failed (continuing — chat consent still posts)"
      );
    } finally {
      clearTimeout(speakTimeout);
    }

    // 2) Post the consent message to the meeting chat. Same helper that
    // /post-welcome uses — handles the Graph delegated client + HTML body.
    if (interview.chatId) {
      try {
        await sendChatMessage(interview.chatId, MEDHA_CONSENT_CHAT_HTML);
        log.info({ interviewId: id }, "auto-conduct/start: Mode B consent message posted");

        // Belt-and-braces: re-seed lastSeenChatMessageId to the newest
        // message (which is now the consent post itself). The conductor's
        // bot-sender filter SHOULD already exclude it; this is a second
        // line of defense in case GUID resolution is wonky. Same helper
        // the start-seed used.
        try {
          const recent = await fetchChatMessagesSince(interview.chatId);
          const newSeen = recent.length > 0 ? recent[recent.length - 1].id : undefined;
          if (newSeen) {
            const fresh = store.get(id);
            if (fresh?.autoConduct) {
              store.update(id, {
                autoConduct: { ...fresh.autoConduct, lastSeenChatMessageId: newSeen },
              });
              log.info(
                { interviewId: id, lastSeenChatMessageId: newSeen },
                "auto-conduct/start: Mode B re-seeded lastSeenChatMessageId after consent post"
              );
            }
          }
        } catch (err) {
          log.warn(
            { interviewId: id, err: err instanceof Error ? err.message : String(err) },
            "auto-conduct/start: Mode B re-seed fetch failed (non-fatal — gate still set)"
          );
        }
      } catch (err) {
        log.warn(
          { interviewId: id, err: err instanceof Error ? err.message : String(err) },
          "auto-conduct/start: Mode B sendChatMessage failed (gate still set — Sid can post manually)"
        );
      }
    }

    log.info(
      { interviewId: id },
      "auto-conduct/start: Mode B intro spoken + consent posted, awaiting 'I agree'"
    );
  }

  return NextResponse.json({ ok: true, autoConduct: store.get(id)?.autoConduct });
}
