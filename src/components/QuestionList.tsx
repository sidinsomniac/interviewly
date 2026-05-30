"use client";

import { useEffect, useRef, useState } from "react";
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
  const [postingWelcome, setPostingWelcome] = useState(false);
  // Scope X: auto-conduct UI state
  const [autoPending, setAutoPending] = useState<"start" | "stop" | "skip" | null>(null);
  const welcomeSent = !!interview.welcomePostedAt;

  const questions = interview.questionPlan?.questions ?? [];
  const posted = new Set(interview.postedQuestionIndices ?? []);
  const total = questions.length;

  // Scope X: live auto-conduct state derived from the server-polled status.
  // Falls back to interview.autoConduct between polls so the UI doesn't flash.
  const [acStatus, setAcStatus] = useState<{
    active: boolean;
    currentQuestionIndex: number;
    nextQuestionDeadline: string | null;
    remainingMs: number;
  } | null>(
    interview.autoConduct
      ? {
          active: interview.autoConduct.active,
          currentQuestionIndex: interview.autoConduct.currentQuestionIndex,
          nextQuestionDeadline: interview.autoConduct.nextQuestionDeadline,
          remainingMs: Math.max(0, Date.parse(interview.autoConduct.nextQuestionDeadline) - Date.now()),
        }
      : null
  );

  // Visual countdown — recomputes from nextQuestionDeadline every 1s
  // without touching the network. Cheaper than the 5s status poll.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(i);
  }, []);

  // Server status poll every 5s while auto-conduct is active. Picks up
  // index advances from chat-keyword / timeout triggers and syncs other
  // tabs / dashboards.
  const lastIndexRef = useRef<number | null>(acStatus?.currentQuestionIndex ?? null);
  useEffect(() => {
    if (!acStatus?.active) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/interviews/${interview.id}/auto-conduct/status`);
        const data = await res.json();
        if (cancelled || !data.ok) return;
        const next = {
          active: data.active,
          currentQuestionIndex: data.currentQuestionIndex,
          nextQuestionDeadline: data.nextQuestionDeadline,
          remainingMs: data.remainingMs,
        };
        setAcStatus(next);
        if (next.currentQuestionIndex !== lastIndexRef.current) {
          lastIndexRef.current = next.currentQuestionIndex;
          await onUpdate(); // refresh the parent interview so postedQuestionIndices re-renders
        }
        if (!next.active) {
          // Conductor finished (all questions posted, or stopped externally).
          await onUpdate();
        }
      } catch {
        // ignore transient
      }
    };
    fetchStatus(); // immediate kick
    const handle = setInterval(fetchStatus, 5_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [acStatus?.active, interview.id, onUpdate]);

  const remainingMs = acStatus?.nextQuestionDeadline
    ? Math.max(0, Date.parse(acStatus.nextQuestionDeadline) - Date.now())
    : 0;
  // `tick` referenced so the linter knows we rely on it for re-rendering
  void tick;

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

  async function startAutoConduct() {
    setAutoPending("start");
    try {
      const res = await fetch(`/api/interviews/${interview.id}/auto-conduct/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed");
      const ac = data.autoConduct;
      setAcStatus({
        active: ac.active,
        currentQuestionIndex: ac.currentQuestionIndex,
        nextQuestionDeadline: ac.nextQuestionDeadline,
        remainingMs: Math.max(0, Date.parse(ac.nextQuestionDeadline) - Date.now()),
      });
      toast.success("Auto-Conduct started — Q1 will post on first tick");
      await onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start auto-conduct");
    } finally {
      setAutoPending(null);
    }
  }

  async function stopAutoConductAction() {
    setAutoPending("stop");
    try {
      const res = await fetch(`/api/interviews/${interview.id}/auto-conduct/stop`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed");
      setAcStatus((s) => (s ? { ...s, active: false } : s));
      toast.success("Auto-Conduct stopped");
      await onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop auto-conduct");
    } finally {
      setAutoPending(null);
    }
  }

  async function skipAutoConductAction() {
    setAutoPending("skip");
    try {
      const res = await fetch(`/api/interviews/${interview.id}/auto-conduct/skip`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed");
      // The 5s status poll will resync deadline + index shortly; also trigger
      // a status fetch now so the UI updates immediately.
      const sres = await fetch(`/api/interviews/${interview.id}/auto-conduct/status`);
      const sdata = await sres.json();
      if (sdata.ok) {
        setAcStatus({
          active: sdata.active,
          currentQuestionIndex: sdata.currentQuestionIndex,
          nextQuestionDeadline: sdata.nextQuestionDeadline,
          remainingMs: sdata.remainingMs,
        });
      }
      toast.success("Skipped to next question");
      await onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Skip failed");
    } finally {
      setAutoPending(null);
    }
  }

  const acActive = acStatus?.active ?? false;
  const acIndex = acStatus?.currentQuestionIndex ?? -1;
  const triggerKeywords = interview.autoConduct?.triggerKeywords ?? ["done", "next", "ready"];
  // Phase G: defensive read — older records pre-date this field.
  const mode = interview.conductMode ?? "manual";

  return (
    <div className="p-4 space-y-3">
      {/* Phase G: Mode B notice replaces the welcome + inactive Auto-Conduct
          card when conductMode === "auto". The active status row (below)
          still renders for both modes; per-question post buttons stay too
          as a debug fallback. Mode B's voice behavior lands in Phase H. */}
      {mode === "auto" && !acActive && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-center gap-3">
          <div className="text-2xl">🤖</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-900">Auto mode — Medha will run this interview</p>
            <p className="text-xs text-indigo-800 mt-0.5">
              Welcome + questions are spoken automatically once the candidate joins. (Phase H pending.)
            </p>
          </div>
          <button
            onClick={startAutoConduct}
            disabled={autoPending !== null || acActive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {autoPending === "start" ? <Spinner size="sm" /> : null}
            Start Mode B (debug)
          </button>
        </div>
      )}

      {/* Sub-Phase E4: one-click welcome+consent button (manual mode only) */}
      {mode === "manual" && (
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
      )}

      {/* Scope X: Auto-Conduct control row (manual mode only — Auto mode
          shows the indigo notice above instead) */}
      {mode === "manual" && welcomeSent && !acActive && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-4">
          <div className="flex-shrink-0 text-2xl">🎙️</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Auto-Conduct mode</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Medha will auto-advance through the question plan when the candidate types{" "}
              <strong>{triggerKeywords.map((k) => `"${k}"`).join(" / ")}</strong>, or every 8 min.
            </p>
          </div>
          <button
            onClick={startAutoConduct}
            disabled={autoPending !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {autoPending === "start" ? <Spinner size="sm" /> : null}
            Start Auto-Conduct
          </button>
        </div>
      )}

      {acActive && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 flex items-center gap-4">
          <div className="flex-shrink-0 text-2xl animate-pulse">🎙️</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              Auto-Conduct active — Question {acIndex + 1} of {total}
              {interview.branchingInFlight && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 animate-pulse">
                  ⚡ Branching
                </span>
              )}
            </p>
            <p className="text-xs text-blue-800 mt-0.5">
              Auto-advancing in <strong>{formatRemaining(remainingMs)}</strong>{" "}
              or when candidate types <strong>{triggerKeywords.map((k) => `"${k}"`).join(" / ")}</strong>
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={skipAutoConductAction}
              disabled={autoPending !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {autoPending === "skip" ? <Spinner size="sm" /> : null}
              Skip to Next
            </button>
            <button
              onClick={stopAutoConductAction}
              disabled={autoPending !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {autoPending === "stop" ? <Spinner size="sm" /> : null}
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Consent row */}
      <ConsentRow
        posted={posted.has(0)}
        posting={posting === 0}
        disabled={acActive}
        onPost={() => postQuestion(0, "Consent message")}
      />

      {/* Question rows */}
      {questions.map((q, i) => {
        const isPosted = posted.has(q.rowIndex);
        const isPosting = posting === q.rowIndex;
        const isCurrentInAuto = acActive && acIndex === i;
        return (
          <div
            key={q.rowIndex}
            className={`rounded-xl border p-4 flex gap-4 transition-colors ${
              isPosted
                ? "border-green-200 bg-green-50"
                : isCurrentInAuto
                  ? "border-blue-300 bg-white ring-2 ring-blue-200"
                  : "border-gray-200 bg-white"
            }`}
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
                {isCurrentInAuto && (
                  <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-blue-100 text-blue-700">
                    awaiting candidate
                  </span>
                )}
              </div>
              <p className={`text-sm leading-relaxed ${isPosted ? "text-gray-400" : "text-gray-700"}`}>
                {q.questionText}
              </p>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => postQuestion(q.rowIndex, q.competencyName)}
                disabled={isPosted || isPosting || posting !== null || acActive}
                title={acActive ? "Disabled while Auto-Conduct is active" : undefined}
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

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ConsentRow({
  posted,
  posting,
  disabled,
  onPost,
}: {
  posted: boolean;
  posting: boolean;
  disabled?: boolean;
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
          disabled={posted || posting || disabled}
          title={disabled ? "Disabled while Auto-Conduct is active" : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {posting ? <Spinner size="sm" /> : null}
          {posted ? "Posted" : "Post"}
        </button>
      </div>
    </div>
  );
}
