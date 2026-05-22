import { NextRequest, NextResponse } from "next/server";
import { ScheduleInterviewRequestSchema } from "@/types/index";
import type { InterviewRound } from "@/types/index";
import { generateQuestionPlan } from "@/lib/llm/question-plan";
import { createTeamsMeeting } from "@/lib/graph/calendar";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ScheduleInterviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    const data = parsed.data;

    // Default scheduling 5 min from now (for demo) if not provided.
    const scheduledFor = data.scheduledFor ?? new Date(Date.now() + 5 * 60_000).toISOString();
    const duration = data.durationMinutes ?? 45;
    const endIso = new Date(new Date(scheduledFor).getTime() + duration * 60_000).toISOString();

    // 1. Generate question plan from JD.
    const round: InterviewRound = data.jobTitle.toLowerCase().includes("react") ? "React" : "Core";
    const questionPlan = await generateQuestionPlan({
      round,
      roleAppliedFor: data.jobTitle,
      candidateTotalYears: data.yearsExperience,
      candidateRelevantYears: data.yearsExperience,
      jdText: data.jobDescription,
    });

    // 2. Create the Teams meeting via Graph (organizer = interviewer).
    const subject = `Interview: ${data.candidateName} — ${data.jobTitle}`;
    const meeting = await createTeamsMeeting({
      organizerEmail: data.interviewerEmail,
      subject,
      startIso: scheduledFor,
      endIso,
      attendees: [
        { email: data.candidateEmail, name: data.candidateName },
        { email: config.ms.botUserEmail, name: "Interviewly Bot" },
      ],
      bodyContent:
        `<p>Auto-scheduled by Medha.</p>` +
        `<p>Score: ${data.scoringDetails.overallScore}/100 — ${data.scoringDetails.recommendation}</p>`,
    });

    // 3. Create the interview record so the live/end pipeline can take over.
    const interview = store.create({
      status: "scheduled",
      candidateName: data.candidateName,
      candidateTotalYears: data.yearsExperience,
      candidateRelevantYears: data.yearsExperience,
      roleAppliedFor: data.jobTitle,
      round,
      jdText: data.jobDescription,
      meetingTopic: subject,
      meetingId: meeting.onlineMeetingId,
      meetingUrl: meeting.joinUrl,
      chatId: meeting.chatId,
      organizerGuid: meeting.organizerGuid,
      questionPlan,
      postedQuestionIndices: [],
    });

    log.info({ interviewId: interview.id, meetingId: meeting.onlineMeetingId }, "Interview scheduled");

    return NextResponse.json({
      ok: true,
      interviewId: interview.id,
      meetingId: meeting.onlineMeetingId,
      meetingUrl: meeting.joinUrl,
      meetingSubject: subject,
      chatId: meeting.chatId,
      scheduledFor,
      calendarEventId: meeting.eventId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "/api/schedule-interview failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
