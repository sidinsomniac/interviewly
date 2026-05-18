import { getDelegatedClient } from "@/lib/graph/client";
import type { TranscriptSegment } from "@/types/index";

type ChatMessage = {
  id: string;
  createdDateTime: string;
  from?: { user?: { displayName?: string } };
  body?: { content?: string; contentType?: string };
  messageType?: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
