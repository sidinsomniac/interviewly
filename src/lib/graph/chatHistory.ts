import { getDelegatedClient } from "@/lib/graph/client";
import type { TranscriptSegment } from "@/types/index";

// Exported for Scope X — the auto-conductor needs raw id + from.user.id
// to filter out bot/organizer messages by GUID.
export type ChatMessage = {
  id: string;
  createdDateTime: string;
  from?: { user?: { id?: string; displayName?: string } };
  body?: { content?: string; contentType?: string };
  messageType?: string;
};

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Scope X — fetch raw chat messages newer than `lastSeenCreatedDateTime`.
 * Returns up to the most recent 20 messages, chronological asc. When
 * `lastSeenCreatedDateTime` is undefined, returns all 20 (the caller
 * will typically use the last id of that set as the next seed). The
 * auto-conductor polls this every 5s during an active session.
 */
export async function fetchChatMessagesSince(
  chatId: string,
  lastSeenCreatedDateTime?: string
): Promise<ChatMessage[]> {
  const client = await getDelegatedClient();
  const res = await client
    .api(`/chats/${chatId}/messages`)
    .orderby("createdDateTime desc")
    .top(20)
    .get();
  const raw: ChatMessage[] = (res.value ?? []) as ChatMessage[];

  // Restore chronological order (Graph returned desc).
  raw.reverse();

  if (!lastSeenCreatedDateTime) return raw;
  const cutoff = Date.parse(lastSeenCreatedDateTime);
  return raw.filter((m) => Date.parse(m.createdDateTime) > cutoff);
}

export async function fetchChatMessages(chatId: string): Promise<TranscriptSegment[]> {
  const client = await getDelegatedClient();

  let res = await client
    .api(`/chats/${chatId}/messages`)
    .orderby("createdDateTime desc")
    .top(50)
    .get();

  const allMessages: ChatMessage[] = [...(res.value ?? [])];

  while (res["@odata.nextLink"]) {
    res = await client.api(res["@odata.nextLink"]).get();
    allMessages.push(...(res.value ?? []));
  }

  allMessages.reverse(); // Graph returns desc; restore chronological order for merge

  const segments: TranscriptSegment[] = [];

  for (const msg of allMessages) {
    if (msg.messageType !== "message") continue;
    const rawContent = msg.body?.content ?? "";
    if (!rawContent || rawContent === "<systemEventMessage/>") continue;

    const text = msg.body?.contentType === "html" ? stripHtml(rawContent) : rawContent.trim();
    if (!text) continue;

    const speaker = msg.from?.user?.displayName ?? "Unknown";
    segments.push({
      speaker,
      startTime: msg.createdDateTime,
      endTime: msg.createdDateTime,
      text,
    });
  }

  return segments;
}
