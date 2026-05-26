"use client";

import { useState } from "react";
import type { InterviewMetadata } from "@/types/index";
import { QuestionList } from "@/components/QuestionList";
import { StatusPanel } from "@/components/StatusPanel";

// Mirrored from MEDHA_TEST_MODE on the server via NEXT_PUBLIC_MEDHA_TEST_MODE.
// Inlined at build time by Next; safe to evaluate at module scope.
const TEST_MODE = process.env.NEXT_PUBLIC_MEDHA_TEST_MODE === "true";

export function LiveDashboard({ interview: initial }: { interview: InterviewMetadata }) {
  const [interview, setInterview] = useState(initial);

  async function refresh() {
    const res = await fetch(`/api/interviews/${initial.id}`);
    const data = await res.json();
    if (data.ok) setInterview(data.interview);
  }

  return (
    <div className="flex flex-col h-screen">
      {TEST_MODE && (
        <div
          role="status"
          className="flex-shrink-0 bg-amber-100 border-b border-amber-300 text-amber-900 px-6 py-2 text-sm flex items-center gap-2"
        >
          <span aria-hidden>🧪</span>
          <span>
            <strong>Test mode active.</strong>{" "}
            End Interview will use a fixture transcript instead of polling Teams.
            Probe form is for development only — the <code>_meta</code> sheet records this run as a fixture.
          </span>
        </div>
      )}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {interview.candidateName}
          </h1>
          <p className="text-xs text-gray-500">{interview.roleAppliedFor} · {interview.round} Round</p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[3] overflow-y-auto border-r border-gray-200">
          <QuestionList interview={interview} onUpdate={refresh} />
        </div>
        <div className="flex-[2] overflow-y-auto">
          <StatusPanel interview={interview} onUpdate={refresh} />
        </div>
      </div>
    </div>
  );
}
