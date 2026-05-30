// ============================================================
// Budget tracker — read-only usage endpoint.
//
// GET /api/usage[?interviewId=…&purpose=…&since=…&provider=…]
//
// Returns recent UsageEntry records plus a roll-up summary. Used by
// the LiveDashboard's UsageFooter to show running $-per-interview.
//
// Auth: none. Internal dev-mode telemetry; not exposed in any
// customer-facing flow. Lock down behind a secret header before
// surfacing in production.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { listUsage, summarize, type UsageFilter } from "@/lib/usage/tracker";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter: UsageFilter = {};
  const interviewId = searchParams.get("interviewId");
  if (interviewId) filter.interviewId = interviewId;
  const purpose = searchParams.get("purpose");
  if (purpose) filter.purpose = purpose;
  const provider = searchParams.get("provider");
  if (provider) filter.provider = provider;
  const since = searchParams.get("since");
  if (since) filter.since = since;

  return NextResponse.json({
    ok: true,
    entries: listUsage(filter),
    summary: summarize(filter),
  });
}
