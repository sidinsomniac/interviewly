// ============================================================
// Sub-Phase E4: post the Medha welcome + consent message into the
// Teams chat for a given interview. Idempotent via welcomePostedAt.
//
// Called from the live dashboard's "Post Welcome + Consent" button.
// The recruiter clicks once at the start of the interview; subsequent
// clicks return 409 so we don't spam the chat.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { sendChatMessage } from "@/lib/graph/chat";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

const WELCOME_MESSAGE =
  "<p>👋 Hello and welcome! I'm <strong>Medha</strong>, your AI interviewer. " +
  "This interview will be analyzed by an AI assistant and a structured probe form " +
  "will be generated for the hiring panel. The conversation is being recorded and " +
  "transcribed for that purpose. By continuing, you consent to this process. " +
  "Data retention: 30 days. Ready to begin? I'll post the first question in a moment.</p>";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  if (interview.welcomePostedAt) {
    return NextResponse.json(
      {
        ok: false,
        error: `Welcome already posted at ${interview.welcomePostedAt}`,
        welcomePostedAt: interview.welcomePostedAt,
      },
      { status: 409 }
    );
  }

  if (!interview.chatId) {
    return NextResponse.json(
      { ok: false, error: "Interview has no chatId — meeting may not be fully resolved yet" },
      { status: 400 }
    );
  }

  try {
    // In TEST_MODE the chatId is a `test-mode-chat-...` stub from the
    // create-interview route. Skip the Graph call to avoid a 404; still
    // stamp welcomePostedAt so the button flips to "Welcome sent ✓".
    let messageId: string;
    if (config.app.testMode) {
      messageId = `test-mode-welcome-${Date.now()}`;
      log.warn(
        { interviewId: id, chatId: interview.chatId },
        "TEST_MODE: skipping Graph welcome post; stamping welcomePostedAt only"
      );
    } else {
      messageId = await sendChatMessage(interview.chatId, WELCOME_MESSAGE);
    }
    const postedAt = new Date().toISOString();
    store.update(id, { welcomePostedAt: postedAt });
    log.info({ interviewId: id, messageId, postedAt, testMode: config.app.testMode }, "Welcome message posted");
    return NextResponse.json({ ok: true, postedAt, messageId, testMode: config.app.testMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ interviewId: id, err: message }, "post-welcome failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
