"use client";

import { useEffect, useState } from "react";
import { StatusBadge, Spinner } from "@/components/LoadingStates";
import { TranscriptUpload } from "@/components/TranscriptUpload";
import { getRoleSchema } from "@/lib/probeform/registry";
import type { InterviewMetadata } from "@/types/index";

export function ResultClient({ interview: initial }: { interview: InterviewMetadata }) {
  const [interview, setInterview] = useState(initial);

  useEffect(() => {
    if (interview.status === "completed" || interview.status === "failed") return;

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
  }, [interview.status, initial.id]);

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

      {(interview.status === "ended") && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 flex items-center gap-4">
          <Spinner size="lg" />
          <div>
            <p className="font-semibold text-blue-900">Generating probe form…</p>
            <p className="text-sm text-blue-700 mt-1">Waiting for transcript from Teams. This may take up to 5 minutes.</p>
          </div>
        </div>
      )}

      {interview.status === "completed" && (
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
