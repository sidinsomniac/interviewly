// ============================================================
// POST /api/screen/reject — send a rejection email to a screened
// candidate without persisting an interview record.
//
// Added 2026-05-31 to wire up the previously-disabled Reject button
// in /recruiter/screen (placeholder since Phase K).
//
// Body shape mirrors /api/screen/approve (`profile`, not
// `candidateProfile`) so the client keeps a single field-naming
// convention across both flows.
//
// Unlike /approve, sendMail is AWAITED here — /reject is the only
// side-effect of the whole user action and the client needs a
// definitive ok/fail signal for the toast UX.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CandidateProfileSchema } from "@/types/index";
import { sendMail } from "@/lib/graph/mail";
import { rejectionEmail } from "@/lib/mail/templates";
import { getRoleSchema } from "@/lib/probeform/registry";
import { log } from "@/lib/logger";

const RejectBodySchema = z.object({
  profile: CandidateProfileSchema,
  roleId: z.string().min(1),
  /** Optional recruiter one-liner appended to the standard body. UI doesn't
   *  surface a field yet, but the API accepts it so direct callers (and
   *  future UI) can pass it through. Capped at 500 chars to keep the email
   *  body sane. */
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = RejectBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 }
    );
  }
  const { profile, roleId, reason } = parsed.data;

  // Server-side guard: refuse to send if no candidate email. The client
  // also disables the Reject button in this case, but a defensive check
  // here stops a direct API call (or a stale UI) from misbehaving.
  if (!profile.candidateEmail || !profile.candidateEmail.includes("@")) {
    log.warn(
      { candidateName: profile.candidateName },
      "screen/reject: no candidate email"
    );
    return NextResponse.json(
      { ok: false, error: "Candidate email missing" },
      { status: 400 }
    );
  }

  const role = getRoleSchema(roleId);
  const roleDisplay = role?.displayName ?? profile.roleAppliedFor ?? roleId;

  const tpl = rejectionEmail({
    candidateName: profile.candidateName,
    roleAppliedFor: roleDisplay,
    reason,
  });

  // Awaited: the client needs the boolean outcome for its toast UX.
  // sendMail returns Promise<boolean> after Phase M (2xx → true).
  const ok = await sendMail({
    to: profile.candidateEmail,
    subject: tpl.subject,
    html: tpl.html,
  });
  if (!ok) {
    log.warn(
      { candidateName: profile.candidateName },
      "screen/reject: sendMail failed"
    );
    return NextResponse.json(
      { ok: false, error: "Rejection email failed to send" },
      { status: 502 }
    );
  }

  const sentAt = new Date().toISOString();
  log.info(
    { candidateName: profile.candidateName, to: profile.candidateEmail, sentAt },
    "screen/reject: rejection email sent"
  );
  // No store.create — rejected candidates aren't persisted as interviews.
  return NextResponse.json({ ok: true, sentAt });
}
