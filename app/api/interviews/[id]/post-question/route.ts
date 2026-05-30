import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { sendChatMessage, formatQuestionMessage } from "@/lib/graph/chat";
import { postQuestionByIndex } from "@/lib/postQuestion";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { z } from "zod";

const PostQuestionBodySchema = z.object({ rowIndex: z.number().int() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = PostQuestionBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "rowIndex (integer) is required" }, { status: 400 });
    }

    const { rowIndex } = parsed.data;
    const interview = store.get(id);
    if (!interview) {
      return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
    }
    if (!interview.chatId) {
      return NextResponse.json({ ok: false, error: "Interview has no chatId — meeting not resolved" }, { status: 400 });
    }

    // Scope X: manual posting collides with the auto-conductor's index
    // bookkeeping. The dashboard hides Post buttons during auto-conduct;
    // a direct API call should fail loudly with a clear message.
    if (interview.autoConduct?.active) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Auto-Conduct is active — manual question posting is disabled. " +
            "Use the Skip button to advance, or click Stop Auto-Conduct first.",
        },
        { status: 409 }
      );
    }

    const questions = interview.questionPlan?.questions ?? [];

    // rowIndex 0 = consent message (special case — predates the separate
    // /post-welcome route; kept for back-compat with the manual UI button
    // on the consent row).
    if (rowIndex === 0) {
      const html = formatQuestionMessage(null, 0, questions.length);
      let messageId: string;
      if (config.app.testMode) {
        messageId = `test-mode-msg-${Date.now()}-consent`;
        log.warn(
          { interviewId: id, rowIndex, chatId: interview.chatId },
          "TEST_MODE: skipping Graph chat post (consent); stamping local state only"
        );
      } else {
        messageId = await sendChatMessage(interview.chatId, html);
      }
      store.update(id, {
        postedQuestionIndices: [...interview.postedQuestionIndices, 0],
        status: "in_progress",
      });
      return NextResponse.json({
        ok: true,
        messageId,
        postedAt: new Date().toISOString(),
        testMode: config.app.testMode,
      });
    }

    // Non-consent: translate rowIndex → arrayIndex and delegate to the
    // shared helper (also used by autoConductor's advance()).
    const arrayIndex = questions.findIndex((q) => q.rowIndex === rowIndex);
    if (arrayIndex === -1) {
      return NextResponse.json(
        { ok: false, error: `No question with rowIndex ${rowIndex}` },
        { status: 400 }
      );
    }
    const result = await postQuestionByIndex(id, arrayIndex);
    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      postedAt: result.postedAt,
      testMode: result.testMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
