import { getAppClient } from "@/lib/graph/client";
import type { TranscriptSegment } from "@/types/index";

let _organizerGuid: string | null = null;

export async function resolveOrganizerGuid(email: string): Promise<string> {
  if (_organizerGuid) return _organizerGuid;
  const client = await getAppClient();
  const user = await client.api(`/users/${email}`).get();
  _organizerGuid = user.id as string;
  return _organizerGuid;
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
