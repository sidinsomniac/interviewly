// ============================================================
// Budget tracker — token usage + cost-estimate recorder for every
// LLM call Medha makes.
//
// Wires into getChatModel via a LangChain BaseCallbackHandler that
// fires on handleLLMEnd, reads provider-normalised token counts off
// the LLMResult, computes cost from a baked-in price table, and
// appends to a globalThis-singleton ring buffer (last 500 calls).
//
// Why a ring buffer: per-interview cost telemetry is the only
// production use case; we don't need durable storage. Hot-reload
// safety via globalThis matches the src/lib/store.ts pattern.
// ============================================================
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";

export interface UsageEntry {
  id: string;
  timestamp: string;
  provider: string;
  modelId: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUSD?: number;
  interviewId?: string;
  purpose?: string;
}

export interface UsageFilter {
  interviewId?: string;
  since?: string;
  purpose?: string;
  provider?: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUSD: number;
  byProvider: Record<string, { calls: number; costUSD: number }>;
  byPurpose: Record<string, { calls: number; costUSD: number }>;
  byInterview: Record<string, { calls: number; costUSD: number }>;
}

const RING_BUFFER_MAX = 500;

const globalForUsage = globalThis as unknown as {
  __medhaUsageBuffer?: UsageEntry[];
};

const buffer: UsageEntry[] =
  globalForUsage.__medhaUsageBuffer ?? [];

if (process.env.NODE_ENV !== "production") {
  globalForUsage.__medhaUsageBuffer = buffer;
}

// ── Cost table — USD per 1M tokens ─────────────────────────────
// Update as model pricing changes. Keys are matched by `provider`
// + a substring search on `modelId` (so `deepseek-v4-flash` and
// `deepseek-v4-flash-2026-01` both hit the same row).
const COST_TABLE: Array<{ provider: string; modelMatch: string; inUSDPerM: number; outUSDPerM: number }> = [
  { provider: "deepseek", modelMatch: "v4-flash", inUSDPerM: 0.27, outUSDPerM: 1.10 },
  { provider: "deepseek", modelMatch: "v4-pro",   inUSDPerM: 0.55, outUSDPerM: 2.20 },
  { provider: "deepseek", modelMatch: "chat",     inUSDPerM: 0.27, outUSDPerM: 1.10 },
  { provider: "google",   modelMatch: "flash-lite", inUSDPerM: 0.10, outUSDPerM: 0.40 },
  { provider: "google",   modelMatch: "flash",     inUSDPerM: 0.30, outUSDPerM: 2.50 },
  { provider: "openai",   modelMatch: "gpt-4o-mini", inUSDPerM: 0.15, outUSDPerM: 0.60 },
  { provider: "openai",   modelMatch: "gpt-4o",     inUSDPerM: 2.50, outUSDPerM: 10.00 },
  { provider: "anthropic",modelMatch: "haiku",      inUSDPerM: 0.80, outUSDPerM: 4.00 },
  { provider: "anthropic",modelMatch: "sonnet",     inUSDPerM: 3.00, outUSDPerM: 15.00 },
];

export function estimateCostUSD(
  provider: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number | undefined {
  const row = COST_TABLE.find(
    (r) => r.provider === provider && modelId.toLowerCase().includes(r.modelMatch.toLowerCase())
  );
  if (!row) return undefined;
  return (promptTokens / 1_000_000) * row.inUSDPerM + (completionTokens / 1_000_000) * row.outUSDPerM;
}

export function recordUsage(entry: Omit<UsageEntry, "id" | "timestamp"> & { id?: string; timestamp?: string }): void {
  const full: UsageEntry = {
    id: entry.id ?? crypto.randomUUID(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  buffer.push(full);
  if (buffer.length > RING_BUFFER_MAX) buffer.shift();
}

export function listUsage(filter?: UsageFilter): UsageEntry[] {
  if (!filter) return [...buffer];
  return buffer.filter((e) => {
    if (filter.interviewId && e.interviewId !== filter.interviewId) return false;
    if (filter.purpose && e.purpose !== filter.purpose) return false;
    if (filter.provider && e.provider !== filter.provider) return false;
    if (filter.since && Date.parse(e.timestamp) < Date.parse(filter.since)) return false;
    return true;
  });
}

export function summarize(filter?: UsageFilter): UsageSummary {
  const entries = listUsage(filter);
  const summary: UsageSummary = {
    totalCalls: entries.length,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCostUSD: 0,
    byProvider: {},
    byPurpose: {},
    byInterview: {},
  };
  for (const e of entries) {
    summary.totalPromptTokens += e.promptTokens ?? 0;
    summary.totalCompletionTokens += e.completionTokens ?? 0;
    summary.totalCostUSD += e.costUSD ?? 0;

    const p = (summary.byProvider[e.provider] ??= { calls: 0, costUSD: 0 });
    p.calls++; p.costUSD += e.costUSD ?? 0;

    const purpose = e.purpose ?? "(unknown)";
    const q = (summary.byPurpose[purpose] ??= { calls: 0, costUSD: 0 });
    q.calls++; q.costUSD += e.costUSD ?? 0;

    if (e.interviewId) {
      const i = (summary.byInterview[e.interviewId] ??= { calls: 0, costUSD: 0 });
      i.calls++; i.costUSD += e.costUSD ?? 0;
    }
  }
  return summary;
}

// ── LangChain callback handler that records on every LLM end ──
//
// Provider-specific shapes for LLMResult.llmOutput.tokenUsage:
//   - OpenAI / DeepSeek (via ChatOpenAI):
//       llmOutput.tokenUsage = { promptTokens, completionTokens, totalTokens }
//   - Anthropic (via ChatAnthropic):
//       llmOutput.usage = { input_tokens, output_tokens }
//   - Google (via ChatGoogleGenerativeAI):
//       llmOutput.usageMetadata = { promptTokenCount, candidatesTokenCount, totalTokenCount }
//
// We normalise to { promptTokens, completionTokens } and call recordUsage.
export class UsageTrackerCallback extends BaseCallbackHandler {
  name = "medha-usage-tracker";

  constructor(
    private opts: {
      provider: string;
      modelId: string;
      interviewId?: string;
      purpose?: string;
    }
  ) {
    super();
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    try {
      const llmOutput = output.llmOutput as Record<string, unknown> | undefined;
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;

      const tokenUsage = llmOutput?.tokenUsage as { promptTokens?: number; completionTokens?: number } | undefined;
      if (tokenUsage) {
        promptTokens = tokenUsage.promptTokens;
        completionTokens = tokenUsage.completionTokens;
      } else {
        const usage = llmOutput?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (usage) {
          promptTokens = usage.input_tokens;
          completionTokens = usage.output_tokens;
        } else {
          const usageMeta = llmOutput?.usageMetadata as {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          } | undefined;
          if (usageMeta) {
            promptTokens = usageMeta.promptTokenCount;
            completionTokens = usageMeta.candidatesTokenCount;
          }
        }
      }

      const cost =
        promptTokens !== undefined && completionTokens !== undefined
          ? estimateCostUSD(this.opts.provider, this.opts.modelId, promptTokens, completionTokens)
          : undefined;

      recordUsage({
        provider: this.opts.provider,
        modelId: this.opts.modelId,
        promptTokens,
        completionTokens,
        totalTokens:
          promptTokens !== undefined && completionTokens !== undefined
            ? promptTokens + completionTokens
            : undefined,
        costUSD: cost,
        interviewId: this.opts.interviewId,
        purpose: this.opts.purpose,
      });
    } catch {
      // never let usage tracking crash an LLM call
    }
  }
}
