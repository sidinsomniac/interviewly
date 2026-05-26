import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { findMeetingChatByTopic, resolveOnlineMeetingId } from "@/lib/graph/meeting";
import { generateQuestionPlan } from "@/lib/llm/question-plan";
import { CreateInterviewRequestSchema } from "@/types/index";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateInterviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }

    const {
      candidateName, candidateTotalYears, candidateRelevantYears,
      roleAppliedFor, round, jdText, chosenExerciseId, meetingTopic,
    } = parsed.data;

    // In TEST_MODE we skip the Graph meeting lookup entirely so the user
    // can exercise the end-to-end pipeline without first scheduling a
    // real Teams meeting. Fake-but-stable ids let the rest of the
    // pipeline (store, dashboards) function normally.
    let chatId: string | undefined;
    let organizerGuid: string | undefined;
    let meetingId: string | undefined;

    if (config.app.testMode) {
      chatId = `test-mode-chat-${Date.now()}`;
      organizerGuid = "test-mode-organizer";
      meetingId = `test-mode-meeting-${Date.now()}`;
      log.warn({ meetingTopic }, "TEST_MODE: skipping Graph meeting lookup; using stub ids");
    } else {
      const lookup = await findMeetingChatByTopic(meetingTopic);
      chatId = lookup.chatId;
      organizerGuid = lookup.organizerGuid;
      meetingId = (organizerGuid && lookup.joinWebUrl)
        ? await resolveOnlineMeetingId(organizerGuid, lookup.joinWebUrl)
        : undefined;
    }

    const questionPlan = await generateQuestionPlan({
      round, roleAppliedFor, candidateTotalYears, candidateRelevantYears, jdText,
    });

    const interview = store.create({
      candidateName, candidateTotalYears, candidateRelevantYears,
      roleAppliedFor, round, jdText, chosenExerciseId,
      meetingTopic, meetingId, chatId, organizerGuid,
      questionPlan,
      status: "draft",
      postedQuestionIndices: [],
    });

    return NextResponse.json({ ok: true, interview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const interviews = store.list();
  return NextResponse.json({ ok: true, interviews });
}
