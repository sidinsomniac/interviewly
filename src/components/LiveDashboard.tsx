"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InterviewMetadata } from "@/types/index";
import { getRoleSchema } from "@/lib/probeform/registry";
import { QuestionList } from "@/components/QuestionList";
import { StatusPanel } from "@/components/StatusPanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { UsageFooter } from "@/components/UsageFooter";
import { BentoCard } from "@/components/ui/BentoCard";
import { BentoGrid } from "@/components/ui/BentoGrid";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { Spinner } from "@/components/LoadingStates";

// Mirrored from MEDHA_TEST_MODE on the server via NEXT_PUBLIC_MEDHA_TEST_MODE.
// Inlined at build time by Next; safe to evaluate at module scope.
const TEST_MODE = process.env.NEXT_PUBLIC_MEDHA_TEST_MODE === "true";

// Phase O (2026-06-01) — UI overhaul.
// The three-flex layout becomes a bento envelope: hero card + Question
// list (col-span-8 row-span-2) + Status panel (col-span-4) + Transcript
// (col-span-4 below status). The four child panels keep their internals
// untouched (post-expo polish); only the outer LiveDashboard frame moves.
export function LiveDashboard({ interview: initial }: { interview: InterviewMetadata }) {
  const [interview, setInterview] = useState(initial);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  async function refresh() {
    const res = await fetch(`/api/interviews/${initial.id}`);
    const data = await res.json();
    if (data.ok) {
      setInterview(data.interview);
      setLastSyncedAt(Date.now());
    }
  }

  // Round-4 (2026-06-01) — ALWAYS-ON 2s poll. This is the canonical source
  // for all children. Previously the dashboard only polled during ended/
  // completing, so a SCHEDULER-triggered Mode B start (no human click)
  // never propagated — children seeded their auto-conduct state at mount
  // and never saw the flip. Now the parent refreshes every 2s and feeds
  // the fresh `interview` (local state) to QuestionList/StatusPanel/
  // TranscriptPanel. Also keeps the finalizing overlays fed.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = interview.status;
  const validBadgeStatus =
    status === "draft" || status === "scheduled" || status === "in_progress" ||
    status === "ended" || status === "completing" || status === "completed" || status === "failed"
      ? status
      : null;

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Round-4 (2026-06-01) — full-screen MODAL (fixed + dark backdrop) so
          the "preparing probe form" state is unmissable. Covers ended +
          completing; held visible ≥6s by finalize()'s min-hold. */}
      {(interview.status === "ended" || interview.status === "completing") && (
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="glass-hero max-w-md p-8 text-center">
            <img src="/images/medha_logo_color.png" alt="" className="h-12 mx-auto mb-4" />
            <div className="mx-auto mb-4 flex justify-center"><Spinner size="lg" /></div>
            <h2 className="text-xl font-semibold text-[color:var(--medha-text-primary)] mb-2">
              Interview complete
            </h2>
            <p className="text-sm text-[color:var(--medha-text-secondary)]">
              Medha is preparing the probe form. This usually takes about 30 seconds.
              Please don&apos;t close this tab.
            </p>
            {interview.probeFormSentAt && (
              <p className="text-xs text-teams-success mt-3">
                ✓ Probe form sent to {interview.recruiterEmail}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Round-4 "done" modal — completed. ✓ + delivery copy + 5s countdown. */}
      {interview.status === "completed" && (
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <div className="glass-hero max-w-md p-8 text-center">
            <img src="/images/medha_logo_color.png" alt="" className="h-12 mx-auto mb-4" />
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-teams-success/20 flex items-center justify-center text-3xl text-teams-success">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-[color:var(--medha-text-primary)] mb-2">Done</h2>
            <p className="text-sm text-[color:var(--medha-text-secondary)] mb-4">
              {interview.recruiterEmail
                ? `Probe form delivered to ${interview.recruiterEmail}.`
                : "Interview complete."}
            </p>
            <a
              href={`/interviews/${interview.id}/result`}
              className="inline-flex items-center justify-center rounded-lg bg-teams-primary px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teams-primary/30 hover:bg-teams-primary-hover transition-colors"
            >
              View Result
            </a>
            <CountdownRedirect to={`/interviews/${interview.id}/result`} seconds={5} />
          </div>
        </div>
      )}

      {TEST_MODE && (
        <div
          role="status"
          className="flex-shrink-0 bg-teams-warning/10 border-b border-teams-warning/30 text-teams-warning px-6 py-2 text-sm flex items-center gap-2"
        >
          <span aria-hidden>🧪</span>
          <span>
            <strong>Test mode active.</strong>{" "}
            Question + welcome posts are stubbed locally (not sent to any real Teams chat).
            End Interview will use a fixture transcript.
            Probe form is for development only — the <code>_meta</code> sheet records this run as a fixture.
          </span>
        </div>
      )}

      <main className="flex-1 px-6 py-6 max-w-7xl w-full mx-auto">
        <BentoGrid>
          {/* Hero — logo + candidate + role + status pill + mode chip + sync */}
          <BentoCard span="col-span-12" hero>
            <div className="flex items-center gap-2 mb-3">
              <img src="/images/medha_logo_color.png" alt="" className="h-7" />
              <span className="text-lg font-semibold text-teams-primary">Medha</span>
              <SyncPill lastSyncedAt={lastSyncedAt} />
            </div>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-[color:var(--medha-text-primary)] truncate">
                  {interview.candidateName}
                </h1>
                <p className="text-sm text-[color:var(--medha-text-secondary)] mt-1 flex items-center gap-2 flex-wrap">
                  <span>
                    {interview.roleAppliedFor} ·{" "}
                    {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}
                  </span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-teams-primary/10 text-teams-primary">
                    {(interview.conductMode ?? "manual") === "auto" ? "🤖 Auto" : "👤 Manual"}
                  </span>
                </p>
              </div>
              {validBadgeStatus && (
                <VerdictBadge verdict={validBadgeStatus} size="md" />
              )}
            </div>
          </BentoCard>

          {/* QuestionList — takes the wide left, two row-heights tall to
              align with the Status + Transcript stack. Child internals
              untouched per Phase O scope. */}
          <BentoCard span="col-span-12 lg:col-span-8 lg:row-span-2" className="overflow-hidden">
            <div className="-m-6 max-h-[calc(100vh-260px)] overflow-y-auto">
              <QuestionList interview={interview} onUpdate={refresh} />
            </div>
          </BentoCard>

          {/* StatusPanel — top of the right column */}
          <BentoCard span="col-span-12 lg:col-span-4" className="overflow-hidden">
            <div className="-m-6 max-h-[calc(50vh-130px)] overflow-y-auto">
              <StatusPanel interview={interview} onUpdate={refresh} />
            </div>
          </BentoCard>

          {/* TranscriptPanel — bottom of the right column.
              D (2026-06-01): the prior wrapper's overflow-hidden + calc max-h
              clipped the panel and killed its inner scroll. Dropped both;
              TranscriptPanel's own max-h-[280px] box governs scrolling now. */}
          <BentoCard span="col-span-12 lg:col-span-4" className="overflow-hidden">
            <div className="-m-6 p-2">
              <TranscriptPanel interview={interview} />
            </div>
          </BentoCard>
        </BentoGrid>
      </main>

      <UsageFooter interviewId={interview.id} />
    </div>
  );
}

// Round-4 (2026-06-01) — "Synced Ns ago" pill so Sid can SEE the 2s poll is
// alive. Client-only relative time (hydration-safe): renders "Syncing…"
// until the first successful poll, then ticks once a second.
function SyncPill({ lastSyncedAt }: { lastSyncedAt: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const label =
    lastSyncedAt == null
      ? "Syncing…"
      : `Synced ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`;
  return (
    <span
      suppressHydrationWarning
      className="ml-auto inline-flex items-center gap-1 rounded-full bg-teams-primary/10 px-2 py-0.5 text-[10px] font-medium text-teams-primary"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-teams-success" />
      {label}
    </span>
  );
}

// Round-4 (2026-06-01) — small countdown-then-redirect used by the "done"
// modal. Replaces the prior inline redirectIn state.
function CountdownRedirect({ to, seconds }: { to: string; seconds: number }) {
  const router = useRouter();
  const [n, setN] = useState(seconds);
  useEffect(() => {
    if (n <= 0) {
      router.push(to);
      return;
    }
    const t = setTimeout(() => setN((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [n, to, router]);
  return (
    <p className="text-xs text-[color:var(--medha-text-secondary)] mt-2">Redirecting in {n}s…</p>
  );
}
