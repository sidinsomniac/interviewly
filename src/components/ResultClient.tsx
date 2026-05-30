"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge, Spinner } from "@/components/LoadingStates";
import { TranscriptUpload } from "@/components/TranscriptUpload";
import { getRoleSchema } from "@/lib/probeform/registry";
import type { InterviewMetadata } from "@/types/index";

/**
 * Phase J fix — a probe form is "ready" when any of these is true:
 *   - status === "completed" (normal happy path)
 *   - probeFormFilePath set (finalize wrote the .xlsx — file definitely exists)
 *   - filledForm.header.candidateName populated (mapping ran successfully)
 *
 * Any one of these means the recruiter can download. We see all three in
 * the same store.update at the end of finalize, but the persist layer is
 * racy in multi-process dev, so the status field may not flip in the
 * on-disk JSON even when the file landed.
 */
const isReady = (iv: InterviewMetadata) =>
  iv.status === "completed" ||
  !!iv.probeFormFilePath ||
  !!iv.filledForm?.header?.candidateName;

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
  }, [interview.status, interview.probeFormFilePath, interview.filledForm, initial.id]);

  // Elapsed-seconds ticker for the "taking longer than usual" notice.
  // Resets on remount — `pollStartedAt` measures from first visit, not
  // from when the interview entered "ended" (acceptable for the demo).
  useEffect(() => {
    if (isReady(interview) || interview.status === "failed") return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - pollStartedAt.current) / 1000));
    }, 5000);
    return () => clearInterval(t);
  }, [interview.status, interview.probeFormFilePath, interview.filledForm]);

  async function retry() {
    const res = await fetch(`/api/interviews/${initial.id}/end`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setInterview((iv) => ({ ...iv, status: "ended", errorMessage: undefined }));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">{interview.candidateName}</h1>
          <StatusBadge status={interview.status} />
        </div>
        <p className="text-sm text-gray-500">{interview.roleAppliedFor} · {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}</p>
      </div>

      {!isReady(interview) && interview.status === "ended" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 flex items-start gap-4">
          <Spinner size="lg" />
          <div className="flex-1">
            <p className="font-semibold text-blue-900">Generating probe form…</p>
            <p className="text-sm text-blue-700 mt-1">Waiting for transcript from Teams. This may take up to 5 minutes.</p>
            {elapsedSec > 90 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">Taking longer than usual.</p>
                <p className="text-xs text-amber-800 mt-0.5">The probe form file may already exist — try reloading.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  Reload
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isReady(interview) && interview.status !== "failed" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-800 mb-1">Probe form ready</p>
            <p className="text-sm text-green-700">
              {interview.postedQuestionIndices?.length ?? 0} questions posted ·{" "}
              {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}
            </p>
          </div>

          {interview.filledForm?.header?.domainFeedbackSummary && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Domain Feedback Summary</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {interview.filledForm.header.domainFeedbackSummary}
              </p>
            </div>
          )}

          <a
            href={`/api/interviews/${interview.id}/probe-form`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Download Probe Form (.xlsx)
          </a>
        </div>
      )}

      {interview.status === "failed" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">Generation failed</p>
            <p className="text-sm text-red-700 font-mono">{interview.errorMessage}</p>
          </div>

          <button
            onClick={retry}
            className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </button>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Upload Transcript Manually</h2>
            <p className="text-xs text-gray-500 mb-4">
              If Teams transcript polling timed out, upload the .vtt or .txt transcript file directly.
            </p>
            <TranscriptUpload interviewId={interview.id} />
          </div>
        </div>
      )}
    </div>
  );
}
