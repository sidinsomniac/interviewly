"use client";

// ============================================================
// Phase J — Recruiter UI for resume upload + LLM screening + approve.
//
// Two stages:
//   1. Upload + screen: form posts to /api/screen, LLM runs (~10–15s),
//      report renders.
//   2. Approve: button posts to /api/screen/approve, dashboard redirect.
//
// State machine: "idle" → "screening" → "screened" → "approving" → "done".
//
// Phase O (2026-06-01) — UI overhaul to Teams Fluent + bento + glass.
// Business logic (state, fetches, handlers) is preserved byte-identical;
// only the JSX shape + Tailwind class strings changed. Pre/post-screen
// states each render their own bento grid; the auto-reject countdown
// + inline-confirm-reject panel both live INSIDE the post-screen bento.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/LoadingStates";
import { BentoCard } from "@/components/ui/BentoCard";
import { BentoGrid } from "@/components/ui/BentoGrid";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { SparkleIcon } from "@/components/ui/icons";
import type { CandidateProfile, ScreeningScore } from "@/types/index";

interface RoleOption {
  roleId: string;
  displayName: string;
}

type Stage = "idle" | "screening" | "screened" | "approving";

export function ScreenClient({
  roles,
  defaultRecruiterEmail,
}: {
  roles: RoleOption[];
  defaultRecruiterEmail?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [roleId, setRoleId] = useState<string>(roles[0]?.roleId ?? "");
  const [jdText, setJdText] = useState<string>("");
  const [recruiterEmail, setRecruiterEmail] = useState<string>(defaultRecruiterEmail ?? "");
  const [report, setReport] = useState<{
    profile: CandidateProfile;
    score: ScreeningScore;
    resumeText: string;
  } | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string>(() => {
    // Default to "now + 1 min" in local datetime-local format.
    const d = new Date(Date.now() + 1 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [conductMode, setConductMode] = useState<"manual" | "auto">("auto");

  // 2026-05-31 — Reject + auto-reject state. `confirmReject` swaps the
  // button row for an inline "Send rejection email to {email}?" panel
  // (no modal component exists in the codebase, and we deliberately
  // didn't add one). `rejecting` covers in-flight POSTs to
  // /api/screen/reject. `autoRejectCancelled` latches once the recruiter
  // clicks Cancel on the countdown so a re-render doesn't restart it.
  // `autoRejectSecondsLeft` is the visible countdown (10 → 0).
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [autoRejectCancelled, setAutoRejectCancelled] = useState(false);
  const [autoRejectSecondsLeft, setAutoRejectSecondsLeft] = useState(10);

  // Threshold (0–1) below which a `borderline` verdict triggers
  // auto-rejection. `rejected` verdicts always trigger regardless of
  // confidence. Default 0.65 if the env var is unset / unparseable.
  const AUTO_REJECT_THRESHOLD = (() => {
    const parsed = parseFloat(
      process.env.NEXT_PUBLIC_MEDHA_AUTO_REJECT_THRESHOLD ?? "0.65"
    );
    return Number.isFinite(parsed) ? parsed : 0.65;
  })();

  const isAutoReject =
    !!report &&
    (report.score.verdict === "rejected" ||
      (report.score.verdict === "borderline" &&
        report.score.confidence < AUTO_REJECT_THRESHOLD));
  const candidateEmail = report?.profile.candidateEmail ?? "";
  const canSendRejection =
    !!candidateEmail && candidateEmail.includes("@");
  const autoRejectActive =
    isAutoReject && canSendRejection && !autoRejectCancelled;

  const recruiterEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recruiterEmail.trim()),
    [recruiterEmail]
  );

  const canSubmit = useMemo(
    () => stage === "idle" && !!file && !!roleId && recruiterEmailValid,
    [stage, file, roleId, recruiterEmailValid]
  );

  async function handleScreen(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !roleId) return;
    setStage("screening");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roleId", roleId);
      if (jdText.trim()) fd.append("jdText", jdText.trim());
      const res = await fetch("/api/screen", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Screening failed");
      setReport({ profile: data.profile, score: data.score, resumeText: data.resumeText });
      setStage("screened");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  }

  async function handleApprove() {
    if (!report) return;
    setStage("approving");
    setError(null);
    try {
      const isoScheduledFor = new Date(scheduledFor).toISOString();
      const res = await fetch("/api/screen/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: report.profile,
          score: report.score,
          roleId,
          recruiterEmail: recruiterEmail.trim(),
          scheduledFor: isoScheduledFor,
          conductMode,
          jdText: jdText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Approve failed");
      toast.success("Interview scheduled — taking you to the dashboard");
      router.push(data.dashboardPath ?? data.dashboardUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("screened");
    }
  }

  async function handleReject(trigger: "manual" | "auto") {
    if (!report || !canSendRejection) return;
    setRejecting(true);
    setError(null);
    try {
      const res = await fetch("/api/screen/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: report.profile,
          roleId,
          // Phase P (2026-06-01) — dual-send context. recruiterEmail
          // drives the audit notification; trigger distinguishes manual
          // vs auto-countdown; confidence pills the LLM's certainty.
          recruiterEmail: recruiterEmail.trim() || undefined,
          trigger,
          confidence: report.score.confidence,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Rejection failed");
      toast.success(`Rejection email sent to ${candidateEmail}`);
      router.push("/recruiter/screen");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRejecting(false);
      setConfirmReject(false);
    }
  }

  // Auto-reject countdown — see Phase M plan notes. handleReject is
  // intentionally omitted from deps (closure captures latest report).
  useEffect(() => {
    if (!autoRejectActive) return;
    if (autoRejectSecondsLeft <= 0) {
      void handleReject("auto");
      return;
    }
    const t = setTimeout(
      () => setAutoRejectSecondsLeft((s) => s - 1),
      1000
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRejectActive, autoRejectSecondsLeft]);

  // ── Pre-screen view ──────────────────────────────────────────

  if (!report) {
    return (
      <BentoGrid>
        <BentoCard span="col-span-12" hero>
          {/* Round-4 (2026-06-01) — Medha logo + wordmark header. */}
          <div className="flex items-center gap-2 mb-3">
            <img src="/images/medha_logo_color.png" alt="" className="h-7" />
            <span className="text-lg font-semibold text-teams-primary">Medha</span>
          </div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teams-primary/10 px-3 py-1 text-xs font-medium text-teams-primary ring-1 ring-teams-primary/20">
            <SparkleIcon className="h-3.5 w-3.5" />
            Screening
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--medha-text-primary)] mb-2">
            Screen a candidate
          </h1>
          <p className="text-base text-[color:var(--medha-text-secondary)]">
            Upload a resume + pick the role. Medha extracts the profile, scores against the
            competency rubric, and pre-fills the interview record on approval.
          </p>
        </BentoCard>

        <form onSubmit={handleScreen} className="contents">
          {/* Resume + role + email — left column */}
          <BentoCard span="col-span-12 md:col-span-7">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
                  Resume (.pdf or .docx)
                </label>
                <div className={`rounded-xl border-2 border-dashed p-5 transition-colors ${file ? "border-teams-primary/60 bg-teams-primary/5" : "border-[color:var(--medha-border-accent)] hover:border-teams-primary/40"}`}>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    disabled={stage !== "idle"}
                    className="block w-full text-sm text-[color:var(--medha-text-secondary)] file:mr-4 file:rounded-md file:border-0 file:bg-teams-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teams-primary hover:file:bg-teams-primary/20 disabled:opacity-50"
                  />
                  {file && (
                    <p className="mt-2 text-xs text-[color:var(--medha-text-secondary)]">
                      {file.name} · {(file.size / 1024).toFixed(0)} KB
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
                  Target role
                </label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  disabled={stage !== "idle"}
                  className="block w-full rounded-md border border-[color:var(--medha-border-accent)] bg-white/60 px-3 py-2 text-sm shadow-sm focus:border-teams-primary focus:ring-1 focus:ring-teams-primary disabled:opacity-50"
                >
                  {roles.map((r) => (
                    <option key={r.roleId} value={r.roleId}>
                      {r.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
                  Your email (recruiter) <span className="text-teams-error">*</span>
                </label>
                <input
                  type="email"
                  value={recruiterEmail}
                  onChange={(e) => setRecruiterEmail(e.target.value)}
                  disabled={stage !== "idle"}
                  placeholder="you@company.com"
                  className="block w-full rounded-md border border-[color:var(--medha-border-accent)] bg-white/60 px-3 py-2 text-sm shadow-sm focus:border-teams-primary focus:ring-1 focus:ring-teams-primary disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-[color:var(--medha-text-secondary)]">
                  We&apos;ll send you the interview confirmation and the probe form when it&apos;s ready.
                </p>
              </div>
            </div>
          </BentoCard>

          {/* JD + Submit — right column */}
          <BentoCard span="col-span-12 md:col-span-5">
            <div className="flex flex-col h-full">
              <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
                Job description <span className="text-[color:var(--medha-text-secondary)]">(optional)</span>
              </label>
              <textarea
                rows={9}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                disabled={stage !== "idle"}
                placeholder="Paste the JD here. Specific libraries / services will be woven into the question plan."
                className="block w-full flex-1 rounded-md border border-[color:var(--medha-border-accent)] bg-white/60 px-3 py-2 text-sm shadow-sm focus:border-teams-primary focus:ring-1 focus:ring-teams-primary disabled:opacity-50"
              />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-[color:var(--medha-text-secondary)]">
                  {stage === "screening" ? "Extracting profile + scoring against rubric…" : "Takes ~10–15 sec."}
                </p>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-teams-primary px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teams-primary/30 hover:bg-teams-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {stage === "screening" ? <Spinner size="sm" /> : null}
                  Screen Candidate
                </button>
              </div>
              {error && (
                <div className="mt-3 rounded-md border border-teams-error/30 bg-teams-error/10 p-3 text-sm text-teams-error">
                  {error}
                </div>
              )}
            </div>
          </BentoCard>
        </form>
      </BentoGrid>
    );
  }

  // ── Post-screen view ─────────────────────────────────────────

  const confidencePct = Math.round(report.score.confidence * 100);

  return (
    <BentoGrid>
      {/* Verdict hero */}
      <BentoCard span="col-span-12" hero>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="mb-3">
              <VerdictBadge verdict={report.score.verdict} size="lg" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[color:var(--medha-text-primary)]">
              {report.profile.candidateName}
            </h2>
            <p className="text-sm text-[color:var(--medha-text-secondary)] mt-1">
              {report.profile.roleAppliedFor} ·{" "}
              {report.profile.candidateRelevantYears} relevant /{" "}
              {report.profile.candidateTotalYears} total years
              {report.profile.candidateEmail && ` · ${report.profile.candidateEmail}`}
            </p>
            <p className="mt-4 text-sm text-[color:var(--medha-text-primary)] leading-relaxed">
              {report.score.summary}
            </p>
          </div>
          <ConfidenceDial value={report.score.confidence} />
        </div>

        {/* Auto-reject sub-banner inside the hero — see Phase M for state semantics. */}
        {isAutoReject && canSendRejection && (
          <div className="mt-5 rounded-xl border border-teams-warning/40 bg-teams-warning/10 p-4">
            <p className="text-sm font-semibold text-teams-warning">Recommendation: Reject</p>
            <p className="text-sm text-[color:var(--medha-text-primary)] mt-1">
              {report.score.verdict === "rejected"
                ? `Verdict is "rejected" with ${confidencePct}% confidence.`
                : `Confidence ${confidencePct}% is below the auto-reject threshold of ${Math.round(AUTO_REJECT_THRESHOLD * 100)}%.`}
            </p>
            {autoRejectActive ? (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[color:var(--medha-text-primary)]">
                  Sending rejection email to{" "}
                  <strong>{candidateEmail}</strong> in {autoRejectSecondsLeft}s…
                </span>
                <button
                  type="button"
                  onClick={() => setAutoRejectCancelled(true)}
                  className="rounded-md border border-teams-warning/50 bg-white/60 px-3 py-1 text-xs font-medium text-teams-warning hover:bg-white/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[color:var(--medha-text-secondary)]">
                Auto-rejection cancelled. Use the Reject Now button below to send manually.
              </p>
            )}
          </div>
        )}

        {isAutoReject && !canSendRejection && (
          <div className="mt-5 rounded-xl border border-teams-warning/40 bg-teams-warning/10 p-4">
            <p className="text-sm font-semibold text-teams-warning">Auto-reject suppressed</p>
            <p className="text-sm text-[color:var(--medha-text-primary)] mt-1">
              No candidate email on file — open the resume PDF and reach out manually, or
              revisit the screen with a resume that includes the email.
            </p>
          </div>
        )}
      </BentoCard>

      {/* Strengths + Gaps */}
      <BentoCard span="col-span-12 md:col-span-6" accent="success" title="Strengths">
        <ul className="space-y-2">
          {report.score.strengths.map((s, i) => (
            <li key={i} className="text-sm text-[color:var(--medha-text-primary)] flex gap-2">
              <span className="text-teams-success font-bold">✓</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </BentoCard>
      <BentoCard span="col-span-12 md:col-span-6" accent="error" title="Gaps to probe">
        <ul className="space-y-2">
          {report.score.gaps.map((g, i) => (
            <li key={i} className="text-sm text-[color:var(--medha-text-primary)] flex gap-2">
              <span className="text-teams-error font-bold">·</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </BentoCard>

      {/* Skills + projects */}
      <BentoCard span="col-span-12" title="Profile">
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--medha-text-secondary)] mb-2">
              Key skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {report.profile.keySkills.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-teams-primary/10 px-2.5 py-0.5 text-xs font-medium text-teams-primary"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          {report.profile.notableProjects.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--medha-text-secondary)] mb-2">
                Notable projects
              </div>
              <ul className="space-y-1">
                {report.profile.notableProjects.map((p, i) => (
                  <li key={i} className="text-sm text-[color:var(--medha-text-primary)]">
                    • {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </BentoCard>

      {/* Approve form + difficulty pill */}
      <BentoCard span="col-span-12 md:col-span-7" title="Approve + schedule">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
              Scheduled start
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              disabled={stage === "approving"}
              className="block w-full rounded-md border border-[color:var(--medha-border-accent)] bg-white/60 px-3 py-2 text-sm shadow-sm focus:border-teams-primary focus:ring-1 focus:ring-teams-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--medha-text-primary)] mb-1.5">
              Interview style
            </label>
            <select
              value={conductMode}
              onChange={(e) => setConductMode(e.target.value as "manual" | "auto")}
              disabled={stage === "approving"}
              className="block w-full rounded-md border border-[color:var(--medha-border-accent)] bg-white/60 px-3 py-2 text-sm shadow-sm focus:border-teams-primary focus:ring-1 focus:ring-teams-primary disabled:opacity-50"
            >
              <option value="auto">🤖 Auto (Medha runs it)</option>
              <option value="manual">👤 Manual (recruiter drives)</option>
            </select>
          </div>
        </div>
        <p className="mt-4 text-xs text-[color:var(--medha-text-secondary)]">
          Recommended difficulty: <strong className="text-[color:var(--medha-text-primary)]">{report.score.recommendedDifficultyBias}</strong> · the question plan will bias toward this tier.
        </p>
      </BentoCard>

      {/* Brief — LLM 1-liner */}
      <BentoCard span="col-span-12 md:col-span-5" title="Brief for the interviewer">
        <p className="text-sm text-[color:var(--medha-text-primary)] leading-relaxed">
          Medha will probe the gaps above first, then move to strengths for depth. Watch for
          how the candidate handles the {report.score.recommendedDifficultyBias} questions —
          that&apos;s where the {report.score.verdict === "borderline" ? "borderline" : report.score.verdict} verdict will firm up or shift.
        </p>
      </BentoCard>

      {/* Action bar — outside a card, full width */}
      <div className="col-span-12">
        {confirmReject ? (
          <div className="flex items-center justify-end gap-2 flex-wrap p-4 rounded-xl glass">
            <span className="text-sm text-[color:var(--medha-text-primary)] mr-auto">
              Send rejection email to <strong>{candidateEmail}</strong>?
            </span>
            <button
              type="button"
              onClick={() => setConfirmReject(false)}
              disabled={rejecting}
              className="rounded-lg border border-[color:var(--medha-border-accent)] bg-white/60 px-4 py-2 text-sm font-medium text-[color:var(--medha-text-primary)] hover:bg-white/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleReject("manual")}
              disabled={rejecting}
              className="inline-flex items-center gap-2 rounded-lg bg-teams-error px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teams-error/30 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {rejecting ? <Spinner size="sm" /> : null}
              Confirm Reject
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmReject(true)}
              disabled={
                !canSendRejection ||
                stage === "approving" ||
                rejecting
              }
              title={
                canSendRejection
                  ? undefined
                  : "Candidate email missing — cannot send rejection"
              }
              className="inline-flex items-center rounded-lg border border-[color:var(--medha-border-accent)] bg-white/40 px-4 py-2 text-sm font-medium text-[color:var(--medha-text-primary)] hover:bg-white/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAutoReject ? "Reject Now" : "Reject"}
            </button>
            {!isAutoReject && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={stage === "approving"}
                className="inline-flex items-center gap-2 rounded-lg bg-teams-primary px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teams-primary/30 hover:bg-teams-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {stage === "approving" ? <Spinner size="sm" /> : null}
                Approve + Schedule
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-teams-error/30 bg-teams-error/10 p-3 text-sm text-teams-error">
            {error}
          </div>
        )}
      </div>
    </BentoGrid>
  );
}

// ── Confidence dial ──────────────────────────────────────────────
// 120px SVG ring. value is 0-1; we render the arc length as a
// fraction of the ring's circumference via stroke-dasharray. The
// stroke is currentColor so the parent's `text-teams-primary` (or
// similar) drives the hue.
function ConfidenceDial({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * pct;
  return (
    <div
      role="img"
      aria-label={`Confidence: ${Math.round(pct * 100)} percent`}
      className="flex-shrink-0 text-teams-primary"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fontSize={22}
          fontWeight={700}
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="text-center text-xs font-medium text-[color:var(--medha-text-secondary)] mt-1">
        Confidence
      </div>
    </div>
  );
}
