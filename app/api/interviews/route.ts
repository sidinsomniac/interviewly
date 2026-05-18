import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
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

    const { chatId, organizerGuid, joinWebUrl } = await findMeetingChatByTopic(meetingTopic);

    const meetingId = (organizerGuid && joinWebUrl)
      ? await resolveOnlineMeetingId(organizerGuid, joinWebUrl)
      : undefined;

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
