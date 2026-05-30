// ============================================================
// Scope X: shared helper for posting a single planned question to
// the meeting chat. Used by both /api/interviews/[id]/post-question
// (manual click from the dashboard) and src/lib/autoConductor.ts
// (chat-keyword / timeout-driven advance).
//
// Co-locating the actual post + state stamping in one function
// keeps the route and the conductor in sync — both update the same
// postedQuestionIndices array and respect TEST_MODE the same way.
// ============================================================
import { store } from "@/lib/store";
import { sendChatMessage, formatQuestionMessage } from "@/lib/graph/chat";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

export interface PostQuestionResult {
  messageId: string;
  postedAt: string;
  testMode: boolean;
  /** The question's rowIndex (NOT the array index). Useful for the route response. */
  rowIndex: number;
}

/**
 * Post the question at the given array index into the interview's
 * questionPlan.questions to the meeting chat, then update the store
 * to record the post and bump status to "in_progress".
 *
 * Throws if the interview/index/chat is invalid (caller decides how
 * to translate to HTTP). In TEST_MODE the Graph call is skipped and
 * a synthetic messageId is returned — same convention as the welcome
 * + post-question routes' TEST_MODE branches.
 */
export async function postQuestionByIndex(
  interviewId: string,
  arrayIndex: number
): Promise<PostQuestionResult> {
  const interview = store.get(interviewId);
  if (!interview) throw new Error(`Interview ${interviewId} not found`);

  const questions = interview.questionPlan?.questions ?? [];
  if (arrayIndex < 0 || arrayIndex >= questions.length) {
    throw new Error(
      `arrayIndex ${arrayIndex} out of range (questionPlan has ${questions.length} questions)`
    );
  }
  if (!interview.chatId) {
    throw new Error(`Interview ${interviewId} has no chatId — meeting not resolved`);
  }

  const question = questions[arrayIndex];
  const displayIndex = arrayIndex + 1; // 1-based for the chat copy
  const html = formatQuestionMessage(question, displayIndex, questions.length);

  let messageId: string;
  if (config.app.testMode) {
    messageId = `test-mode-msg-${Date.now()}-${question.rowIndex}`;
    log.warn(
      { interviewId, arrayIndex, rowIndex: question.rowIndex, chatId: interview.chatId },
      "TEST_MODE: skipping Graph chat post (postQuestionByIndex); stamping local state only"
    );
  } else {
    messageId = await sendChatMessage(interview.chatId, html);
  }

  const postedAt = new Date().toISOString();
  store.update(interviewId, {
    postedQuestionIndices: [...interview.postedQuestionIndices, question.rowIndex],
    status: "in_progress",
  });

  // Phase I — Mode B: also speak the question through the bot. Fire-and-forget
  // with a 15s timeout (longer than the intro's 10s because question texts can
  // be 1–3 sentences). Failures are non-fatal — the chat post already succeeded,
  // the recruiter sees the question in the dashboard, and the conductor still
  // advances. Skipped cleanly in TEST_MODE (no bot configured), in Mode A, or
  // when the bot env vars are unset.
  if (
    !config.app.testMode &&
    interview.conductMode === "auto" &&
    config.bot.baseUrl &&
    config.bot.sharedSecret
  ) {
    const botBaseUrl = config.bot.baseUrl;
    const botSecret = config.bot.sharedSecret;
    void (async () => {
      const speakController = new AbortController();
      const speakTimeout = setTimeout(() => speakController.abort(), 15_000);
      try {
        const res = await fetch(`${botBaseUrl.replace(/\/$/, "")}/api/bot/speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Medha-Secret": botSecret,
          },
          body: JSON.stringify({ interviewId, text: question.questionText }),
          signal: speakController.signal,
        });
        if (!res.ok) {
          const body = await res.text();
          log.warn(
            { interviewId, arrayIndex, status: res.status, body: body.slice(0, 300) },
            "postQuestion: Mode B speak non-2xx (chat post succeeded, continuing)"
          );
        } else {
          log.info({ interviewId, arrayIndex }, "postQuestion: Mode B speak enqueued");
        }
      } catch (err) {
        log.warn(
          { interviewId, arrayIndex, err: err instanceof Error ? err.message : String(err) },
          "postQuestion: Mode B speak failed (chat post succeeded, continuing)"
        );
      } finally {
        clearTimeout(speakTimeout);
      }
    })();
  }

  return {
    messageId,
    postedAt,
    testMode: config.app.testMode,
    rowIndex: question.rowIndex,
  };
}
