import { getDelegatedClient } from "@/lib/graph/client";
import type { TranscriptSegment } from "@/types/index";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchChatMessages(chatId: string): Promise<TranscriptSegment[]> {
  const client = await getDelegatedClient();

  const res = await client
    .api(`/chats/${chatId}/messages`)
    .orderby("createdDateTime asc")
    .top(100)
    .get();

  const messages: Array<{
    id: string;
    createdDateTime: string;
    from?: { user?: { displayName?: string } };
    body?: { content?: string; contentType?: string };
    messageType?: string;
  }> = res.value ?? [];

  const segments: TranscriptSegment[] = [];

  for (const msg of messages) {
    // Skip system/event messages and empty bodies
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
