"use client";

import { useEffect, useRef, useState } from "react";
import type { InterviewMetadata, LiveTranscriptChunk, BranchingDecision } from "@/types/index";

// Scope Y — third column on the live dashboard. Polls the interview every
// 2s and renders the last 10 final transcript chunks. When a branching
// decision is in flight (interview.branchingInFlight), shows an amber
// "Evaluating branch…" pulse pinned to the top. When the most-recent
// branchingHistory entry is < 10s old, shows the result for 10s.

const POLL_INTERVAL_MS = 2000;
const VISIBLE_CHUNKS = 10;
const RECENT_BRANCH_MS = 10_000;

export function TranscriptPanel({ interview: initial }: { interview: InterviewMetadata }) {
  const [interview, setInterview] = useState(initial);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setInterval(async () => {
      try {
        const res = await fetch(`/api/interviews/${initial.id}`);
        const data = await res.json();
        if (cancelled || !data.ok) return;
        setInterview(data.interview);
      } catch {
        // transient — ignore
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [initial.id]);

  const allFinals: LiveTranscriptChunk[] =
    (interview.liveTranscript ?? []).filter((c) => c.isFinal);
  const visible = allFinals.slice(-VISIBLE_CHUNKS);

  // Auto-scroll to the bottom when new chunks arrive.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allFinals.length]);

  const lastBranch: BranchingDecision | undefined =
    (interview.branchingHistory ?? []).slice(-1)[0];
  const showRecentBranch =
    lastBranch &&
    lastBranch.action === "branch" &&
    Date.now() - Date.parse(lastBranch.decidedAt) < RECENT_BRANCH_MS;

  return (
    <div className="h-full flex flex-col p-4 bg-gray-50 border-l border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Live transcript</h2>
        <span className="text-xs text-gray-400">{allFinals.length} chunks</span>
      </div>

      {interview.branchingInFlight && (
        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 animate-pulse">
          <span>⚡</span>
          <span><strong>Evaluating branch…</strong> DeepSeek deciding whether to ask a follow-up.</span>
        </div>
      )}

      {showRecentBranch && lastBranch && (
        <div className="mb-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-900">
          <p className="font-semibold mb-0.5">↳ Branched</p>
          <p>{lastBranch.branchQuestionText}</p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
        {visible.length === 0 && (
          <div className="text-center text-xs text-gray-400 py-12 px-4">
            <p>Waiting for candidate audio…</p>
            <p className="mt-2">
              The bot sidecar streams live STT chunks here.
              If nothing appears, the bot may not be deployed or invited to the meeting.
            </p>
          </div>
        )}
        {visible.map((c, i) => (
          <div
            key={`${c.timestamp}-${i}`}
            className="rounded-lg bg-white border border-gray-200 p-3"
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold text-gray-700">{c.speaker}</span>
              <span className="text-xs text-gray-400">{relTime(c.timestamp)}</span>
            </div>
            <p className="text-sm text-gray-800 leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
