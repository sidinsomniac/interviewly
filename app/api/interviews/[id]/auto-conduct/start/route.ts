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

const StartBodySchema = z.object({
  perQuestionTimeoutMs: z.number().int().positive().optional(),
  triggerKeywords: z.array(z.string().min(1)).optional(),
  pollIntervalMs: z.number().int().positive().optional(),
});

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
  if (!interview.welcomePostedAt) {
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
  const updated = store.update(id, {
    autoConduct: {
      active: true,
      startedAt: now.toISOString(),
      currentQuestionIndex: -1, // first advance bumps to 0 and posts Q1
      nextQuestionDeadline: new Date(now.getTime() + timeoutMs).toISOString(),
      lastSeenChatMessageId,
      perQuestionTimeoutMs: timeoutMs,
      triggerKeywords: keywords,
    },
  });

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

  return NextResponse.json({ ok: true, autoConduct: updated?.autoConduct });
}
