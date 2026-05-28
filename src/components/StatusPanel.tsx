"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/LoadingStates";
import { getRoleSchema } from "@/lib/probeform/registry";
import type { InterviewMetadata } from "@/types/index";

export function StatusPanel({
  interview,
  onUpdate,
}: {
  interview: InterviewMetadata;
  onUpdate: () => Promise<void>;
}) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const posted = interview.postedQuestionIndices?.length ?? 0;
  const total = (interview.questionPlan?.questions.length ?? 0) + 1; // +1 for consent
  const canEnd = posted >= 1;

  async function endInterview() {
    setEnding(true);
    setConfirm(false);
    try {
      const res = await fetch(`/api/interviews/${interview.id}/end`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to end interview");
      toast.success("Interview ended — generating probe form…");
      router.push(`/interviews/${interview.id}/result`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "End failed");
      setEnding(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Meeting Info</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="font-medium text-gray-700">Candidate:</span> {interview.candidateName}</p>
          <p><span className="font-medium text-gray-700">Role:</span> {interview.roleAppliedFor}</p>
          <p><span className="font-medium text-gray-700">Role:</span> {getRoleSchema(interview.roleId)?.displayName ?? interview.roleId}</p>
          {interview.meetingId && (
            <p><span className="font-medium text-gray-700">Meeting ID:</span> <span className="font-mono text-xs break-all">{interview.meetingId}</span></p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Progress</h2>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-3xl font-bold text-gray-900">{posted}</span>
          <span className="text-sm text-gray-500 mb-1">of {total} posted</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all"
            style={{ width: `${Math.min(100, (posted / total) * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            disabled={!canEnd || ending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            End Interview
          </button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">End the interview and generate the probe form?</p>
            <div className="flex gap-3">
              <button
                onClick={endInterview}
                disabled={ending}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {ending ? <Spinner size="sm" /> : null}
                {ending ? "Ending…" : "Yes, End"}
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!canEnd && (
          <p className="text-xs text-center text-gray-400">Post at least one question to enable ending.</p>
        )}
      </div>
    </div>
  );
}
