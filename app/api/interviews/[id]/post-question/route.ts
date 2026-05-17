import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { sendChatMessage, formatQuestionMessage } from "@/lib/graph/chat";
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
    const messageId = await sendChatMessage(interview.chatId, html);

    store.update(id, {
      postedQuestionIndices: [...interview.postedQuestionIndices, rowIndex],
      status: "in_progress",
    });

    return NextResponse.json({ ok: true, messageId, postedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
