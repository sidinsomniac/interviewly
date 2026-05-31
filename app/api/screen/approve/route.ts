// ============================================================
// Phase J — POST /api/screen/approve: persist a screened candidate.
//
// Body: { profile, score, roleId, scheduledFor?, conductMode?, jdText? }
//
// Steps:
//   1. Validate body via Zod (profile + score schemas).
//   2. Default scheduledFor to now + 1 min, conductMode to "auto", duration 45 min.
//   3. Build attendees array, skipping candidate if email is "".
//   4. createTeamsMeeting via the existing Graph calendar helper.
//   5. Synthesize a JD blob from profile + jdText so the question planner
//      anchors to this candidate's actual skills and projects.
//   6. generateQuestionPlan with the synthesized JD.
//   7. store.create with source: "screening".
//   8. If conductMode === "auto", scheduleAutoStart at scheduledFor.
//   9. Return { interview, dashboardUrl }.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CandidateProfileSchema, ScreeningScoreSchema } from "@/types/index";
import { getRoleSchema } from "@/lib/probeform/registry";
import { createTeamsMeeting } from "@/lib/graph/calendar";
import { generateQuestionPlan } from "@/lib/llm/question-plan";
import { scheduleAutoStart } from "@/lib/interviewScheduler";
import { sendMail } from "@/lib/graph/mail";
import { selectionEmail, recruiterScheduledEmail } from "@/lib/mail/templates";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

const ApproveBodySchema = z.object({
  profile: CandidateProfileSchema,
  score: ScreeningScoreSchema,
  roleId: z.string().min(1),
  // Phase K — required for the lifecycle email plumbing. Validated as
  // email-shaped; the screening UI also pre-validates client-side.
  recruiterEmail: z.string().email(),
  scheduledFor: z.string().optional(),
  conductMode: z.enum(["manual", "auto"]).optional(),
  jdText: z.string().optional(),
});

const DEFAULT_DURATION_MINUTES = 45;
const DEFAULT_LEAD_TIME_MS = 5 * 60_000;

export async function POST(req: NextRequest) {
  let body: z.infer<typeof ApproveBodySchema>;
  try {
    const raw = await req.json();
    const parsed = ApproveBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.message },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { profile, score, roleId, jdText, recruiterEmail } = body;

  const schema = getRoleSchema(roleId);
  if (!schema) {
    return NextResponse.json(
      { ok: false, error: `Unknown roleId: "${roleId}"` },
      { status: 400 }
    );
  }

  const scheduledFor =
    body.scheduledFor ?? new Date(Date.now() + DEFAULT_LEAD_TIME_MS).toISOString();
  const conductMode = body.conductMode ?? "auto";
  const endIso = new Date(
    new Date(scheduledFor).getTime() + DEFAULT_DURATION_MINUTES * 60_000
  ).toISOString();

  try {
    // Build attendees — skip candidate if email is empty (recruiter can invite manually later).
    const attendees: Array<{ email: string; name?: string }> = [
      { email: config.ms.botUserEmail, name: "Medha" },
    ];
    if (profile.candidateEmail && profile.candidateEmail.includes("@")) {
      attendees.unshift({ email: profile.candidateEmail, name: profile.candidateName });
    }

    const subject = `Interview: ${profile.candidateName} — ${profile.roleAppliedFor}`;
    const bodyContent =
      `<p>Scheduled via Medha screening (verdict: ${score.verdict}, ` +
      `confidence ${(score.confidence * 100).toFixed(0)}%).</p>` +
      `<p>${score.summary}</p>`;

    log.info(
      {
        roleId,
        candidateName: profile.candidateName,
        scheduledFor,
        conductMode,
        verdict: score.verdict,
      },
      "/api/screen/approve: creating Teams meeting"
    );

    const meeting = await createTeamsMeeting({
      organizerEmail: config.ms.organizerEmail,
      subject,
      startIso: scheduledFor,
      endIso,
      attendees,
      bodyContent,
    });

    // Synthesize a JD blob that anchors the question planner to this
    // candidate's actual skills + projects + the screening verdict's
    // recommended difficulty bias. The planner's existing prompt is
    // already told to weave JD terms into question phrasing, so the
    // candidate's stack will surface in the generated questions.
    const synthJd = [
      jdText ?? "",
      `Candidate background: ${profile.keySkills.join(", ")}.`,
      `Notable projects: ${profile.notableProjects.join(" / ")}.`,
      `Screening verdict: ${score.verdict} (recommended difficulty bias: ${score.recommendedDifficultyBias}).`,
      `Strengths to validate: ${score.strengths.join("; ")}.`,
      `Gaps to probe: ${score.gaps.join("; ")}.`,
    ]
      .filter((s) => s.trim().length > 0)
      .join("\n\n");

    log.info({ roleId, synthJdLen: synthJd.length }, "/api/screen/approve: generating question plan");

    const questionPlan = await generateQuestionPlan({
      schema,
      roleAppliedFor: profile.roleAppliedFor,
      candidateTotalYears: profile.candidateTotalYears,
      candidateRelevantYears: profile.candidateRelevantYears,
      jdText: synthJd,
    });

    const interview = store.create({
      status: "scheduled",
      candidateName: profile.candidateName,
      candidateTotalYears: profile.candidateTotalYears,
      candidateRelevantYears: profile.candidateRelevantYears,
      roleAppliedFor: profile.roleAppliedFor,
      roleId,
      jdText: synthJd,
      meetingTopic: subject,
      meetingId: meeting.onlineMeetingId,
      meetingUrl: meeting.joinUrl,
      chatId: meeting.chatId,
      organizerGuid: meeting.organizerGuid,
      questionPlan,
      postedQuestionIndices: [],
      source: "screening",
      conductMode,
      scheduledFor,
      // Phase K — drives the lifecycle emails. Recruiter receives the
      // scheduled-confirmation email below + the probe-form-ready email
      // from finalize() when the interview completes.
      recruiterEmail,
    });

    log.info(
      { interviewId: interview.id, meetingId: meeting.onlineMeetingId, conductMode },
      "/api/screen/approve: interview created"
    );

    if (conductMode === "auto") {
      scheduleAutoStart(interview.id, scheduledFor);
    }

    const base = config.app.baseUrl.replace(/\/$/, "");
    const dashboardUrl = `${base}/interviews/${interview.id}/live`;

    // Phase K — fire-and-forget two emails after the interview record is
    // persisted: the candidate's "you're in + join here" email, and the
    // recruiter's "interview scheduled" confirmation. Skips the candidate
    // email cleanly when profile.candidateEmail is empty (resume parser
    // couldn't find one). Both are non-awaited so the API returns fast.
    if (profile.candidateEmail && profile.candidateEmail.includes("@")) {
      const tpl = selectionEmail({
        candidateName: profile.candidateName,
        roleAppliedFor: profile.roleAppliedFor,
        scheduledFor,
        meetingUrl: meeting.joinUrl,
        brief: score.summary,
      });
      void sendMail({
        to: profile.candidateEmail,
        subject: tpl.subject,
        html: tpl.html,
      });
    } else {
      log.warn(
        { interviewId: interview.id, candidateName: profile.candidateName },
        "/api/screen/approve: candidate email empty — skipping selection email"
      );
    }

    const recruiterTpl = recruiterScheduledEmail({
      candidateName: profile.candidateName,
      roleAppliedFor: profile.roleAppliedFor,
      scheduledFor,
      dashboardUrl,
      scoreSummary: score.summary,
      verdict: score.verdict,
    });
    void sendMail({
      to: recruiterEmail,
      subject: recruiterTpl.subject,
      html: recruiterTpl.html,
    });

    return NextResponse.json({
      ok: true,
      interview,
      dashboardUrl,
      // Path-only fallback for client-side router.push (no host needed).
      dashboardPath: `/interviews/${interview.id}/live`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ roleId, err: msg }, "/api/screen/approve failed");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
