import { getAppClient } from "@/lib/graph/client";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import type { TranscriptSegment } from "@/types/index";

/**
 * Per-email AAD GUID cache. Keyed lowercased so callers don't have to
 * normalize. Replaces a previous single-cell cache that ignored the
 * `email` parameter — that bug silently collapsed botUserGuid and
 * organizerGuid to whichever email arrived first and broke the
 * conductor's sender filter (Mode B burst-advance, 2026-05-30).
 */
const _guidCache = new Map<string, string>();

/**
 * Resolve an email to its AAD object id via Graph /users/{email}.
 * Uses application credentials (getAppClient) so it can resolve any
 * user in the tenant, not only the token's own identity. Throws on
 * lookup failure so wrong-resolutions never silently propagate.
 */
export async function resolveOrganizerGuid(email: string): Promise<string> {
  const key = email.toLowerCase();
  const cached = _guidCache.get(key);
  if (cached) return cached;
  const client = await getAppClient();
  const user = await client.api(`/users/${email}`).get();
  const guid = user?.id as string | undefined;
  if (!guid) {
    throw new Error(`resolveOrganizerGuid: Graph returned no id for ${email}`);
  }
  _guidCache.set(key, guid);
  log.info({ email, guid }, "resolveOrganizerGuid: resolved");
  return guid;
}

/**
 * Phase P (2026-06-01) — cached singleton for the bot's AAD GUID.
 *
 * `config.ms.botUserEmail` is env-static so the resolved GUID never
 * changes per process. The underlying `_guidCache` in
 * `resolveOrganizerGuid` already caches by email, but this thin
 * wrapper:
 *   - removes the `config.ms.botUserEmail` ceremony from every call
 *     site (autoConductor.buildContext, /auto-conduct/start's
 *     wait-for-candidate loop)
 *   - documents the intent ("get the bot's GUID") at the type level
 *
 * On first call → one Graph /users/{email} request. Subsequent calls
 * hit the cache. Throws only if the FIRST call throws — once cached
 * we never retry (a future env-var swap requires process restart).
 */
export async function getBotUserGuid(): Promise<string> {
  return resolveOrganizerGuid(config.ms.botUserEmail);
}

export async function listTranscripts(
  organizerGuid: string,
  meetingId: string
): Promise<Array<{ id: string }>> {
  const client = await getAppClient();
  const res = await client
    .api(`/users/${organizerGuid}/onlineMeetings/${meetingId}/transcripts`)
    .get();
  return (res.value ?? []) as Array<{ id: string }>;
}

export async function fetchTranscriptVtt(
  organizerGuid: string,
  meetingId: string,
  transcriptId: string
): Promise<string> {
  const client = await getAppClient();
  // The Graph SDK returns the raw body for content endpoints
  const vtt = await client
    .api(`/users/${organizerGuid}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`)
    .query({ $format: "text/vtt" })
    .getStream();

  // Convert stream to string
  const chunks: Buffer[] = [];
  for await (const chunk of vtt) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Split into cue blocks (separated by blank lines)
  const blocks = vtt.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    // Find the timestamp line: "HH:MM:SS.mmm --> HH:MM:SS.mmm"
    const timeLine = lines.find((l) => l.includes(" --> "));
    if (!timeLine) continue;

    const [startTime, endTime] = timeLine.split(" --> ").map((t) => t.trim());

    // Remaining lines are the cue text — may contain Teams speaker tags: <v Speaker Name>text</v>
    const textLines = lines.filter((l) => l !== timeLine && !l.match(/^\d+$/) && l !== "WEBVTT");
    const rawText = textLines.join(" ").trim();

    // Extract speaker from <v Speaker Name>text</v>
    const speakerMatch = rawText.match(/^<v ([^>]+)>([\s\S]*)/);
    let speaker = "Unknown";
    let text = rawText;

    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2].replace(/<\/v>$/, "").trim();
    }

    // Strip any remaining HTML/VTT tags
    text = text.replace(/<[^>]+>/g, "").trim();

    if (text) {
      segments.push({ speaker, startTime, endTime, text });
    }
  }

  return segments;
}
