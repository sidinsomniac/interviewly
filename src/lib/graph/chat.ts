import { getDelegatedClient } from "@/lib/graph/client";
import type { PlannedQuestion } from "@/types/index";

const CONSENT_MESSAGE =
  "<p><strong>🤖 Medha</strong></p>" +
  "<p>This interview is being analyzed by <strong>Medha</strong>, an AI assistant. " +
  "The conversation will be transcribed and a structured evaluation form will be generated. " +
  "By proceeding, you consent to this. Data retention: 30 days.</p>" +
  "<p>Please type <strong>I agree</strong> in the chat to acknowledge.</p>";

export function formatQuestionMessage(
  q: PlannedQuestion | null,
  index: number,
  total: number
): string {
  if (index === 0 || q === null) return CONSENT_MESSAGE;
  // Round-4 (2026-06-01) — candidate sees just the question text. The
  // "Question N of M — competency" framing was distracting on the booth
  // floor; the recruiter dashboard still shows the counter separately.
  // index/total kept for the consent guard above.
  return `<p>${q.questionText}</p>`;
}

export async function sendChatMessage(chatId: string, html: string): Promise<string> {
  const client = await getDelegatedClient();
  const msg = await client.api(`/chats/${chatId}/messages`).post({
    body: {
      contentType: "html",
      content: html,
    },
  });
  return msg.id as string;
}

/**
 * Phase P (2026-06-01) — chat thread membership reader.
 *
 * Used by /auto-conduct/start's wait-for-candidate loop to detect when
 * a non-bot non-organizer non-recruiter member has joined the meeting.
 * Teams auto-adds joining attendees to the chat thread as members,
 * which gives us a cheap polling signal without needing the Calls API.
 *
 * `userId` is the AAD GUID for internal users; `email` is populated
 * for federated/guest users (so the filter can match either way).
 */
export interface ChatMember {
  id: string;
  displayName: string;
  userId?: string;
  email?: string;
  roles?: string[];
}

export async function fetchChatMembers(chatId: string): Promise<ChatMember[]> {
  const client = await getDelegatedClient();
  const res = await client.api(`/chats/${chatId}/members`).get();
  const items = (res?.value ?? []) as Array<{
    id: string;
    displayName?: string;
    userId?: string;
    email?: string;
    roles?: string[];
  }>;
  return items.map((m) => ({
    id: m.id,
    displayName: m.displayName ?? "(no name)",
    userId: m.userId,
    email: m.email,
    roles: m.roles,
  }));
}
