import { NextRequest, NextResponse } from "next/server";
import { ScheduleInterviewRequestSchema } from "@/types/index";
import { generateQuestionPlan } from "@/lib/llm/question-plan";
import { detectRoleId, getRoleSchema } from "@/lib/probeform/registry";
import { createTeamsMeeting } from "@/lib/graph/calendar";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { scheduleAutoStart } from "@/lib/interviewScheduler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ScheduleInterviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    const data = parsed.data;

    // Diagnostic checkpoint #1: surface the identity fields exactly as
    // n8n sent them, so a missing/empty candidateEmail is immediately
    // visible in the dev log without us having to reach into Graph.
    log.info(
      {
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail,
        interviewerEmail: data.interviewerEmail,
        jobTitle: data.jobTitle,
      },
      "/api/schedule-interview — payload identity"
    );

    // Default scheduling 5 min from now (for demo) if not provided.
    const scheduledFor = data.scheduledFor ?? new Date(Date.now() + 1 * 60_000).toISOString();
    const duration = data.durationMinutes ?? 45;
    const endIso = new Date(new Date(scheduledFor).getTime() + duration * 60_000).toISOString();

    // 1. Generate question plan from JD.
    const roleId = detectRoleId(data.jobTitle);
    const schema = getRoleSchema(roleId);
    if (!schema) {
      return NextResponse.json(
        { ok: false, error: `detectRoleId returned unknown roleId "${roleId}". Registry empty?` },
        { status: 500 }
      );
    }
    const questionPlan = await generateQuestionPlan({
      schema,
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
        { email: config.ms.botUserEmail, name: "Medha" },
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
      roleId,
      jdText: data.jobDescription,
      meetingTopic: subject,
      meetingId: meeting.onlineMeetingId,
      meetingUrl: meeting.joinUrl,
      chatId: meeting.chatId,
      organizerGuid: meeting.organizerGuid,
      questionPlan,
      postedQuestionIndices: [],
      source: "n8n",
      interviewerEmail: data.interviewerEmail,
      conductMode: data.conductMode,
      // Phase J — persist scheduledFor so restoreSchedules can re-arm
      // across `pnpm dev` restarts.
      scheduledFor,
    });

    log.info({ interviewId: interview.id, meetingId: meeting.onlineMeetingId }, "Interview scheduled");

    // Phase J — arm the server-side auto-start for Mode B at scheduledFor.
    // Mode A skips this: recruiter still drives Post Welcome → Start Auto-Conduct.
    if (interview.conductMode === "auto" && interview.scheduledFor) {
      scheduleAutoStart(interview.id, interview.scheduledFor);
    }

    // Sub-Phase E: hand back dashboard/live/result URLs so the n8n
    // workflow's interviewer email can embed "Open in Medha" CTAs.
    const base = config.app.baseUrl.replace(/\/$/, "");
    const dashboardUrl = `${base}/interviews/${interview.id}/plan`;
    const liveUrl =      `${base}/interviews/${interview.id}/live`;
    const resultUrl =    `${base}/interviews/${interview.id}/result`;

    // Diagnostic checkpoint #3: log the exact URLs handed back to n8n
    // so we can correlate the response with whatever n8n's downstream
    // Gmail node renders.
    log.info(
      {
        interviewId: interview.id,
        meetingUrl: meeting.joinUrl,
        dashboardUrl,
      },
      "/api/schedule-interview — response sent"
    );

    return NextResponse.json({
      ok: true,
      interviewId: interview.id,
      meetingId: meeting.onlineMeetingId,
      meetingUrl: meeting.joinUrl,
      meetingSubject: subject,
      chatId: meeting.chatId,
      scheduledFor,
      calendarEventId: meeting.eventId,
      dashboardUrl,
      liveUrl,
      resultUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "/api/schedule-interview failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
