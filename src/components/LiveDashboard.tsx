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
  const router = useRouter();

  async function refresh() {
    const res = await fetch(`/api/interviews/${initial.id}`);
    const data = await res.json();
    if (data.ok) setInterview(data.interview);
  }

  // Phase M auto-redirect — preserved byte-identical.
  useEffect(() => {
    if (interview.status === "completed") {
      router.replace(`/interviews/${interview.id}/result`);
    }
  }, [interview.status, interview.id, router]);

  const status = interview.status;
  const validBadgeStatus =
    status === "draft" || status === "scheduled" || status === "in_progress" ||
    status === "ended" || status === "completed" || status === "failed"
      ? status
      : null;

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Phase M "ended" overlay — now uses the brand-consistent glass-hero
          surface instead of the prior bg-white/95 backdrop. Same z-index +
          intent: cover the live UI while finalize runs. */}
      {interview.status === "ended" && (
        <div
          role="status"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center"
        >
          <div className="glass-hero p-10 text-center max-w-md">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-base font-semibold text-[color:var(--medha-text-primary)]">
              Interview ended
            </p>
            <p className="text-sm text-[color:var(--medha-text-secondary)] mt-1">
              Generating probe form…
            </p>
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
          {/* Hero — candidate + role + status pill + mode chip */}
          <BentoCard span="col-span-12" hero>
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

          {/* TranscriptPanel — bottom of the right column */}
          <BentoCard span="col-span-12 lg:col-span-4" className="overflow-hidden">
            <div className="-m-6 max-h-[calc(50vh-130px)] overflow-hidden">
              <TranscriptPanel interview={interview} />
            </div>
          </BentoCard>
        </BentoGrid>
      </main>

      <UsageFooter interviewId={interview.id} />
    </div>
  );
}
