// ============================================================
// Fixture loader for MEDHA_TEST_MODE.
//
// When MEDHA_TEST_MODE=true, /api/interviews/[id]/end skips real
// Graph polling and uses pre-baked fixture data from data/fixtures/.
// Lets the full pipeline run in <30 sec instead of waiting for a
// real 30–60 min Teams meeting.
//
// Layout: data/fixtures/transcript-<role>-<outcome>.vtt
//         data/fixtures/chat-history-<role>-<outcome>.json
//         data/fixtures/coderpad-submission-<role>-<outcome>.json (optional)
//
// Role and outcome default to env vars MEDHA_TEST_FIXTURE_ROLE
// and MEDHA_TEST_FIXTURE_OUTCOME but can be overridden per call
// (e.g. picked from the interview's round). React/Core map to
// "react"/"core"; anything else is lowercased.
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { parseVtt } from "@/lib/graph/transcript";
import type { TranscriptSegment } from "@/types/index";

export interface FixtureBundle {
  /** Raw VTT text — used for the SHA256 in the _meta sheet. */
  vttRaw: string;
  /** VTT parsed into typed transcript segments. */
  vttSegments: TranscriptSegment[];
  /** Chat history rendered into TranscriptSegment shape for merge. */
  chatSegments: TranscriptSegment[];
  /** Optional coderpad submission attached when present. */
  codeSubmission?: CoderPadSubmission;
  /** Fixture identifiers actually loaded — useful for logs. */
  meta: { role: string; outcome: string };
}

export interface CoderPadSubmission {
  exerciseId: string;
  language: string;
  finalCode: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTimeMs?: number;
  submittedAt?: string;
  notes?: string;
}

interface RawChatMessage {
  id: string;
  createdDateTime: string;
  from?: { user?: { displayName?: string } };
  body?: { contentType?: "html" | "text"; content?: string };
  messageType?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function chatMessagesToSegments(messages: RawChatMessage[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const msg of messages) {
    if (msg.messageType && msg.messageType !== "message") continue;
    const raw = msg.body?.content ?? "";
    if (!raw) continue;
    const text = msg.body?.contentType === "html" ? stripHtml(raw) : raw.trim();
    if (!text) continue;
    segments.push({
      speaker: msg.from?.user?.displayName ?? "Unknown",
      startTime: msg.createdDateTime,
      endTime: msg.createdDateTime,
      text,
    });
  }
  return segments;
}

// Sub-Phase C: `roundToFixtureRole` was removed. The roleId now drives
// the fixture filename directly (e.g., roleId="react" → "transcript-react-*").

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Load a fixture bundle for a given role + outcome. Falls back to env
 * defaults when arguments are omitted. Throws when the VTT file for the
 * requested role+outcome is missing — without a transcript, the pipeline
 * cannot produce a probe form.
 */
export async function loadFixtureBundle(opts?: {
  role?: string;
  outcome?: string;
}): Promise<FixtureBundle> {
  const role = (opts?.role ?? config.app.fixtureRole).toLowerCase();
  const outcome = (opts?.outcome ?? config.app.fixtureOutcome).toLowerCase();

  const baseDir = path.resolve(process.cwd(), "data/fixtures");
  const vttPath = path.join(baseDir, `transcript-${role}-${outcome}.vtt`);
  const chatPath = path.join(baseDir, `chat-history-${role}-${outcome}.json`);
  const codePath = path.join(baseDir, `coderpad-submission-${role}-${outcome}.json`);

  const vttRaw = await readIfExists(vttPath);
  if (vttRaw === null) {
    throw new Error(
      `TEST_MODE fixture not found: ${vttPath}. Create it or set ` +
        `MEDHA_TEST_FIXTURE_ROLE / MEDHA_TEST_FIXTURE_OUTCOME to a pair that exists.`
    );
  }

  const chatRaw = await readIfExists(chatPath);
  const chatSegments: TranscriptSegment[] = chatRaw
    ? chatMessagesToSegments(JSON.parse(chatRaw) as RawChatMessage[])
    : [];

  const codeRaw = await readIfExists(codePath);
  const codeSubmission: CoderPadSubmission | undefined = codeRaw
    ? (JSON.parse(codeRaw) as CoderPadSubmission)
    : undefined;

  const vttSegments = parseVtt(vttRaw);

  log.info(
    {
      role,
      outcome,
      vttSegments: vttSegments.length,
      chatSegments: chatSegments.length,
      codeSubmission: codeSubmission ? codeSubmission.exerciseId : null,
    },
    "TEST_MODE: fixture bundle loaded"
  );

  return {
    vttRaw,
    vttSegments,
    chatSegments,
    codeSubmission,
    meta: { role, outcome },
  };
}
