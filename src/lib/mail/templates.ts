// ============================================================
// Phase K — transactional email templates.
//
// Three named template builders, each returns { subject, html }:
//   1. selectionEmail        — to candidate, on approval
//   2. recruiterScheduledEmail — to recruiter, on approval
//   3. probeFormReadyEmail   — to recruiter, on finalize success
//
// Shared `wrapHtml` shell gives consistent branding + dark-mode-friendly
// CSS via @media (prefers-color-scheme: dark). Gmail / Apple Mail /
// recent Outlook all support this. Older Outlook ignores the @media
// block and uses the light-mode inline styles, which look fine too.
//
// Times are formatted with Intl.DateTimeFormat using the Asia/Kolkata
// timezone so all recipients see a consistent IST display regardless
// of their local timezone.
// ============================================================

function formatIst(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso)) + " IST";
  } catch {
    return iso;
  }
}

/** Shared shell: wraps body content with brand header + dark-mode CSS. */
function wrapHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #f5f5f7; color: #1a1a1a; margin: 0; padding: 40px 20px; }
  .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  .brand { font-size: 12px; font-weight: 700; color: #4f46e5; letter-spacing: 1.5px; margin-bottom: 24px; text-transform: uppercase; }
  .button { display: inline-block; background: #4f46e5; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 8px 0; }
  h1 { font-size: 22px; margin: 0 0 16px; color: #1a1a1a; font-weight: 700; line-height: 1.3; }
  p { line-height: 1.6; margin: 0 0 16px; color: #4a5568; font-size: 14px; }
  .meta { background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; color: #4a5568; }
  .meta-row { margin: 4px 0; }
  .meta-label { color: #718096; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; text-align: center; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d0d10 !important; color: #e5e7eb !important; }
    .container { background: #1a1a1f !important; box-shadow: none !important; }
    h1 { color: #f3f4f6 !important; }
    p { color: #d1d5db !important; }
    .meta { background: #2a2a32 !important; color: #d1d5db !important; }
    .meta-label { color: #9ca3af !important; }
    .brand { color: #818cf8 !important; }
    .footer { color: #6b7280 !important; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="brand">Medha</div>
    ${bodyHtml}
    <div class="footer">Sent by Medha — AI-powered interviewing.</div>
  </div>
</body>
</html>`;
}

// ── 1. Selection email (to candidate) ──────────────────────────

export interface SelectionEmailOpts {
  candidateName: string;
  roleAppliedFor: string;
  scheduledFor: string; // ISO
  meetingUrl: string;
  brief: string; // 2-3 sentences from the screening score summary
}

export function selectionEmail(
  opts: SelectionEmailOpts
): { subject: string; html: string } {
  const subject = `You've been selected for an interview — ${opts.roleAppliedFor}`;
  const html = wrapHtml(`
    <h1>You're in, ${escapeHtml(opts.candidateName.split(" ")[0])}!</h1>
    <p>Congratulations — your resume looks great for the <strong>${escapeHtml(opts.roleAppliedFor)}</strong> role. We'd like to interview you.</p>
    <p>${escapeHtml(opts.brief)}</p>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">When</span><br>${escapeHtml(formatIst(opts.scheduledFor))}</div>
      <div class="meta-row" style="margin-top: 12px;"><span class="meta-label">Where</span><br>Microsoft Teams (link below)</div>
    </div>
    <p style="margin-top: 24px;">
      <a href="${escapeAttr(opts.meetingUrl)}" class="button">Join the interview</a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">A friendly note: your interviewer will be Medha, an AI senior engineer. Bring a coffee, expect real questions, and don't be afraid to think out loud.</p>
  `);
  return { subject, html };
}

// ── 2. Recruiter scheduled email (to recruiter) ────────────────

export interface RecruiterScheduledEmailOpts {
  recruiterName?: string;
  candidateName: string;
  roleAppliedFor: string;
  scheduledFor: string; // ISO
  dashboardUrl: string;
  scoreSummary: string;
  verdict: string;
}

export function recruiterScheduledEmail(
  opts: RecruiterScheduledEmailOpts
): { subject: string; html: string } {
  const subject = `Interview scheduled: ${opts.candidateName} for ${opts.roleAppliedFor}`;
  const verdictColor = opts.verdict === "selected" ? "#15803d" : opts.verdict === "rejected" ? "#b91c1c" : "#b45309";
  const greeting = opts.recruiterName ? `Hi ${escapeHtml(opts.recruiterName.split(" ")[0])},` : "Hi,";
  const html = wrapHtml(`
    <h1>Interview scheduled</h1>
    <p>${greeting}</p>
    <p>You've approved <strong>${escapeHtml(opts.candidateName)}</strong> for the <strong>${escapeHtml(opts.roleAppliedFor)}</strong> role. The Teams meeting is on the calendar.</p>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Candidate</span><br>${escapeHtml(opts.candidateName)}</div>
      <div class="meta-row" style="margin-top: 12px;"><span class="meta-label">Role</span><br>${escapeHtml(opts.roleAppliedFor)}</div>
      <div class="meta-row" style="margin-top: 12px;"><span class="meta-label">When</span><br>${escapeHtml(formatIst(opts.scheduledFor))}</div>
      <div class="meta-row" style="margin-top: 12px;"><span class="meta-label">Verdict</span><br><span style="color: ${verdictColor}; font-weight: 600;">${escapeHtml(opts.verdict.toUpperCase())}</span></div>
    </div>
    <p>${escapeHtml(opts.scoreSummary)}</p>
    <p style="margin-top: 24px;">
      <a href="${escapeAttr(opts.dashboardUrl)}" class="button">Open live dashboard</a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">Medha will auto-join, run the interview, and email you the probe form when it's done. You can monitor live from the dashboard or step in any time.</p>
  `);
  return { subject, html };
}

// ── 3. Probe form ready email (to recruiter) ───────────────────

export interface ProbeFormReadyEmailOpts {
  recruiterName?: string;
  candidateName: string;
  roleAppliedFor: string;
  resultUrl: string;
  /** When true, the .xlsx is attached; otherwise body mentions to download from result page. */
  attached: boolean;
}

export function probeFormReadyEmail(
  opts: ProbeFormReadyEmailOpts
): { subject: string; html: string } {
  const subject = `Probe form ready: ${opts.candidateName}`;
  const greeting = opts.recruiterName ? `Hi ${escapeHtml(opts.recruiterName.split(" ")[0])},` : "Hi,";
  const attachmentLine = opts.attached
    ? `<p>The probe form is attached to this email as <strong>.xlsx</strong>.</p>`
    : `<p>The probe form is ready on the result page — too large to attach here, so it's available via the link below.</p>`;
  const html = wrapHtml(`
    <h1>Probe form ready</h1>
    <p>${greeting}</p>
    <p><strong>${escapeHtml(opts.candidateName)}</strong>'s interview for the <strong>${escapeHtml(opts.roleAppliedFor)}</strong> role is complete. Medha has scored the transcript and filled the PS probe form.</p>
    ${attachmentLine}
    <p style="margin-top: 24px;">
      <a href="${escapeAttr(opts.resultUrl)}" class="button">Open result page</a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">The result page has the candidate summary, the verdict, and a downloadable copy of the .xlsx if you prefer the canonical version.</p>
  `);
  return { subject, html };
}

// ── HTML escaping ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
