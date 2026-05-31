"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/LoadingStates";
import { TranscriptUpload } from "@/components/TranscriptUpload";
import { getRoleSchema } from "@/lib/probeform/registry";
import { BentoCard } from "@/components/ui/BentoCard";
import { BentoGrid } from "@/components/ui/BentoGrid";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import type { InterviewMetadata } from "@/types/index";

/**
 * Phase M (2026-05-31) — "ready" simplified to terminal status only. The
 * probe-form file no longer exists (in-memory + email-only), so the older
 * probeFormFilePath / filledForm fallbacks are gone. `finalize()` always
 * stamps status: "completed" before attempting the email send, so polling
 * stops cleanly even when the recruiterEmail is missing or the send fails.
 *
 * Phase O (2026-06-01) — UI moved to bento + Teams palette. Business
 * logic (polling, retry, isReady predicate) is byte-identical.
 */
const isReady = (iv: InterviewMetadata) =>
  iv.status === "completed" || iv.status === "failed";

export function ResultClient({ interview: initial }: { interview: InterviewMetadata }) {
  const [interview, setInterview] = useState(initial);
  const pollStartedAt = useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (isReady(interview) || interview.status === "failed") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/interviews/${initial.id}`);
        const data = await res.json();
        if (data.ok) setInterview(data.interview);
      } catch {
        // ignore transient fetch errors
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [interview.status, interview.probeFormSentAt, interview.filledForm, initial.id]);

  useEffect(() => {
    if (isReady(interview) || interview.status === "failed") return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - pollStartedAt.current) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, [interview.status, interview.probeFormSentAt, interview.filledForm]);

  async function retry() {
    const res = await fetch(`/api/interviews/${initial.id}/end`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setInterview((iv) => ({ ...iv, status: "ended", errorMessage: undefined }));
  }

  // Delivery state (matches Phase M three-banner logic byte-identical).
  const deliveryState: "delivered" | "failed" | "manual" =
    interview.probeFormSentAt
      ? "delivered"
      : interview.recruiterEmail
        ? "failed"
        : "manual";

  // Transcript preview — first 6 lines if populated. Optional.
  const transcriptPreview = interview.transcript?.slice(0, 6) ?? [];

  return (
    <BentoGrid>
      {/* Verdict hero */}
      <BentoCard span="col-span-12" hero>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="mb-3">
              <VerdictBadge verdict={interview.status} size="lg" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[color:var(--medha-text-primary)]">
              {interview.candidateName}
            </h1>
            <p className="text-sm text-[color:var(--medha-text-secondary)] mt-1">
              {interview.roleAppliedFor} · {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}
            </p>
          </div>
        </div>
        {interview.filledForm?.header?.domainFeedbackSummary && (
          <p className="mt-4 text-sm text-[color:var(--medha-text-primary)] leading-relaxed line-clamp-3">
            {interview.filledForm.header.domainFeedbackSummary}
          </p>
        )}
      </BentoCard>

      {/* Ended-state — interview wrapped up, finalize in flight */}
      {!isReady(interview) && interview.status === "ended" && (
        <BentoCard span="col-span-12" accent="warning">
          <div className="flex items-start gap-4">
            <div className="text-teams-warning"><Spinner size="lg" /></div>
            <div className="flex-1">
              <p className="font-semibold text-[color:var(--medha-text-primary)]">Generating probe form…</p>
              <p className="text-sm text-[color:var(--medha-text-secondary)] mt-1">
                Waiting for transcript from Teams. This may take up to 5 minutes.
              </p>
              {elapsedSec > 90 && (
                <div className="mt-3 rounded-lg border border-teams-warning/40 bg-teams-warning/10 p-3">
                  <p className="text-sm font-medium text-teams-warning">Taking longer than usual.</p>
                  <p className="text-xs text-[color:var(--medha-text-secondary)] mt-0.5">
                    The probe form file may already exist — try reloading.
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-teams-warning/50 bg-white/60 px-3 py-1 text-xs font-medium text-teams-warning hover:bg-white/80"
                  >
                    Reload
                  </button>
                </div>
              )}
            </div>
          </div>
        </BentoCard>
      )}

      {/* Ready (not failed) — delivery banner + summary + transcript preview */}
      {isReady(interview) && interview.status !== "failed" && (
        <>
          {/* Delivery card — three states */}
          {deliveryState === "delivered" && (
            <BentoCard
              span={transcriptPreview.length > 0 ? "col-span-12 md:col-span-6" : "col-span-12"}
              accent="success"
              title="Probe form delivered"
            >
              <p className="text-sm text-[color:var(--medha-text-primary)]">
                Sent to <strong>{interview.recruiterEmail}</strong> at{" "}
                {new Date(interview.probeFormSentAt!).toLocaleTimeString()}.
              </p>
              <p className="text-xs text-[color:var(--medha-text-secondary)] mt-2">
                {interview.postedQuestionIndices?.length ?? 0} questions posted ·{" "}
                {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}
              </p>
            </BentoCard>
          )}
          {deliveryState === "failed" && (
            <BentoCard
              span={transcriptPreview.length > 0 ? "col-span-12 md:col-span-6" : "col-span-12"}
              accent="warning"
              title="Email delivery failed"
            >
              <p className="text-sm text-[color:var(--medha-text-primary)]">
                Probe form was generated but the email send returned non-2xx.
              </p>
              <p className="text-xs text-[color:var(--medha-text-secondary)] mt-2">
                Check server logs for the sendMail error. The .xlsx was not persisted to disk.
              </p>
            </BentoCard>
          )}
          {deliveryState === "manual" && (
            <BentoCard
              span={transcriptPreview.length > 0 ? "col-span-12 md:col-span-6" : "col-span-12"}
              title="Manual interview"
            >
              <p className="text-sm text-[color:var(--medha-text-primary)]">
                No recruiter email configured — probe form not generated.
              </p>
            </BentoCard>
          )}

          {/* Transcript preview — first 6 lines, optional */}
          {transcriptPreview.length > 0 && (
            <BentoCard span="col-span-12 md:col-span-6" title="Transcript preview">
              <ul className="space-y-2 text-sm">
                {transcriptPreview.map((seg, i) => (
                  <li key={i} className="text-[color:var(--medha-text-primary)]">
                    <span className="text-xs font-semibold text-teams-primary mr-2">
                      {seg.speaker ?? "—"}:
                    </span>
                    <span className="text-[color:var(--medha-text-secondary)] line-clamp-2">
                      {seg.text}
                    </span>
                  </li>
                ))}
              </ul>
            </BentoCard>
          )}

          {/* Full domain feedback summary — only render if populated */}
          {interview.filledForm?.header?.domainFeedbackSummary && (
            <BentoCard span="col-span-12" title="Domain feedback summary">
              <p className="text-sm text-[color:var(--medha-text-primary)] leading-relaxed whitespace-pre-wrap">
                {interview.filledForm.header.domainFeedbackSummary}
              </p>
            </BentoCard>
          )}
        </>
      )}

      {/* Failed state — error card + retry + manual upload */}
      {interview.status === "failed" && (
        <>
          <BentoCard span="col-span-12" accent="error" title="Generation failed">
            <p className="text-sm font-mono text-teams-error">{interview.errorMessage}</p>
            <button
              onClick={retry}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-teams-error px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teams-error/30 hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </BentoCard>
          <BentoCard span="col-span-12" title="Upload transcript manually">
            <p className="text-xs text-[color:var(--medha-text-secondary)] mb-4">
              If Teams transcript polling timed out, upload the .vtt or .txt transcript file directly.
            </p>
            <TranscriptUpload interviewId={interview.id} />
          </BentoCard>
        </>
      )}
    </BentoGrid>
  );
}
