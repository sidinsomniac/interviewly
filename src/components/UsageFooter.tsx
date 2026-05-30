"use client";

import { useEffect, useState } from "react";

// Budget tracker — small pill at the bottom of the live dashboard.
// Polls /api/usage?interviewId=… every 30s and shows running cost.

interface UsageSummary {
  totalCalls: number;
  totalCostUSD: number;
  byProvider: Record<string, { calls: number; costUSD: number }>;
}

const POLL_MS = 30_000;

export function UsageFooter({ interviewId }: { interviewId: string }) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchUsage() {
      try {
        const res = await fetch(`/api/usage?interviewId=${encodeURIComponent(interviewId)}`);
        const data = await res.json();
        if (cancelled || !data.ok) return;
        setSummary(data.summary);
      } catch {
        // ignore
      }
    }
    fetchUsage();
    const handle = setInterval(fetchUsage, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [interviewId]);

  if (!summary || summary.totalCalls === 0) return null;

  const providers = Object.keys(summary.byProvider);
  const providerLabel = providers.length === 1 ? providers[0] : `${providers.length} providers`;

  return (
    <div className="flex-shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-600 flex items-center justify-between">
      <span>
        💰 <strong>${summary.totalCostUSD.toFixed(4)}</strong> · {summary.totalCalls} LLM calls · {providerLabel}
      </span>
      <span className="text-gray-400">budget tracker</span>
    </div>
  );
}
