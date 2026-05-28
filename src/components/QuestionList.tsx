"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/LoadingStates";
import type { InterviewMetadata } from "@/types/index";

const CONSENT_TEXT =
  "Hello! I'm Medha, your AI interviewer. This session may be recorded and transcribed for evaluation purposes. By continuing, you consent to this recording. Let's get started!";

export function QuestionList({
  interview,
  onUpdate,
}: {
  interview: InterviewMetadata;
  onUpdate: () => Promise<void>;
}) {
  const [posting, setPosting] = useState<number | null>(null);
  // Sub-Phase E4: one-click welcome+consent button. Idempotent — server
  // returns 409 after the first successful post; UI mirrors that with
  // welcomePostedAt straight off the interview record.
  const [postingWelcome, setPostingWelcome] = useState(false);
  const welcomeSent = !!interview.welcomePostedAt;

  const questions = interview.questionPlan?.questions ?? [];
  const posted = new Set(interview.postedQuestionIndices ?? []);
  const total = questions.length;

  async function postWelcome() {
    setPostingWelcome(true);
    try {
      const res = await fetch(`/api/interviews/${interview.id}/post-welcome`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        data.testMode
          ? "Posted (test mode stub) — Welcome + Consent"
          : "Welcome + consent posted to Teams chat"
      );
      await onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Welcome post failed");
    } finally {
      setPostingWelcome(false);
    }
  }

  async function postQuestion(rowIndex: number, label: string) {
    setPosting(rowIndex);
    try {
      const res = await fetch(`/api/interviews/${interview.id}/post-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIndex }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        data.testMode
          ? `Posted (test mode stub) — "${label}"`
          : `"${label}" posted to Teams chat`
      );
      await onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Post failed", {
        action: { label: "Retry", onClick: () => postQuestion(rowIndex, label) },
      });
    } finally {
      setPosting(null);
    }
  }

  return (
    <div className="p-4 space-y-3">
      {/* Sub-Phase E4: one-click welcome+consent button */}
      <div className="flex justify-end">
        <button
          onClick={postWelcome}
          disabled={welcomeSent || postingWelcome}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {postingWelcome ? <Spinner size="sm" /> : null}
          🤖 {welcomeSent ? "Welcome sent ✓" : "Post Welcome + Consent"}
        </button>
      </div>

      {/* Consent row */}
      <ConsentRow
        posted={posted.has(0)}
        posting={posting === 0}
        onPost={() => postQuestion(0, "Consent message")}
      />

      {/* Question rows */}
      {questions.map((q, i) => {
        const isPosted = posted.has(q.rowIndex);
        const isPosting = posting === q.rowIndex;
        return (
          <div
            key={q.rowIndex}
            className={`rounded-xl border p-4 flex gap-4 transition-colors ${isPosted ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}
          >
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${isPosted ? "bg-green-600 text-white" : "bg-blue-50 text-blue-700"}`}>
              {isPosted ? "✓" : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">{q.competencyName}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${q.rubricType === "architecture" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700"}`}>
                  {q.rubricType}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${isPosted ? "text-gray-400" : "text-gray-700"}`}>
                {q.questionText}
              </p>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => postQuestion(q.rowIndex, q.competencyName)}
                disabled={isPosted || isPosting || posting !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPosting ? <Spinner size="sm" /> : null}
                {isPosted ? "Posted" : "Post"}
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400 text-center pt-2">
        {posted.size} of {total + 1} posted
      </p>
    </div>
  );
}

function ConsentRow({
  posted,
  posting,
  onPost,
}: {
  posted: boolean;
  posting: boolean;
  onPost: () => void;
}) {
  return (
    <div className={`rounded-xl border p-4 flex gap-4 transition-colors ${posted ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${posted ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>
        {posted ? "✓" : "!"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 mb-1">Consent &amp; Introduction</p>
        <p className={`text-sm leading-relaxed ${posted ? "text-gray-400" : "text-gray-600"}`}>{CONSENT_TEXT}</p>
      </div>
      <div className="flex-shrink-0">
        <button
          onClick={onPost}
          disabled={posted || posting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {posting ? <Spinner size="sm" /> : null}
          {posted ? "Posted" : "Post"}
        </button>
      </div>
    </div>
  );
}
