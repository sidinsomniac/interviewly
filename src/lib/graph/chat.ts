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
  return (
    `<p><strong>Question ${index} of ${total} — ${q.competencyName}</strong></p>` +
    `<p>${q.questionText}</p>`
  );
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
