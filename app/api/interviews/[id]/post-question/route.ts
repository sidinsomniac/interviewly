import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { sendChatMessage, formatQuestionMessage } from "@/lib/graph/chat";
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

    const questions = interview.questionPlan?.questions ?? [];
    const total = questions.length;

    // rowIndex 0 = consent message (special case)
    let questionToPost = null;
    let displayIndex = 0;
    if (rowIndex === 0) {
      displayIndex = 0;
    } else {
      const q = questions.find((q) => q.rowIndex === rowIndex);
      if (!q) {
        return NextResponse.json({ ok: false, error: `No question with rowIndex ${rowIndex}` }, { status: 400 });
      }
      questionToPost = q;
      displayIndex = questions.indexOf(q) + 1;
    }

    const html = formatQuestionMessage(questionToPost, displayIndex, total);

    // In TEST_MODE the interview's chatId is a stub like `test-mode-chat-...`
    // (see /api/interviews POST). Hitting Graph with it returns 404. Stub
    // the post so the demo flow stays clickable; the local postedQuestionIndices
    // state still updates so the dashboard reflects the action.
    let messageId: string;
    if (config.app.testMode) {
      messageId = `test-mode-msg-${Date.now()}-${rowIndex}`;
      log.warn(
        { interviewId: id, rowIndex, chatId: interview.chatId },
        "TEST_MODE: skipping Graph chat post; stamping local state only"
      );
    } else {
      messageId = await sendChatMessage(interview.chatId, html);
    }

    store.update(id, {
      postedQuestionIndices: [...interview.postedQuestionIndices, rowIndex],
      status: "in_progress",
    });

    return NextResponse.json({
      ok: true,
      messageId,
      postedAt: new Date().toISOString(),
      testMode: config.app.testMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
