// Smoke test: find a Teams meeting chat by topic, then post "Hello from Interviewly"
// into the meeting chat as the Bot User.
// Usage: MEETING_TOPIC="Interviewly smoke test" pnpm smoke:send-message
// Fallback: MEETING_JOIN_URL="https://..." still works if the bot is the organizer.

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
import "isomorphic-fetch";
import { getDelegatedClient } from "../src/lib/graph/client";
import { findMeetingChatByTopic } from "../src/lib/graph/meeting";

async function main() {
  const topic = process.env.MEETING_TOPIC;
  const joinUrl = process.env.MEETING_JOIN_URL;

  let chatId: string;

  if (topic) {
    console.log(`Finding meeting chat by topic: "${topic}"…`);
    const result = await findMeetingChatByTopic(topic);
    chatId = result.chatId;
    console.log(`✓ Found chat: ${chatId}`);
    if (result.organizerGuid) console.log(`  organizerGuid: ${result.organizerGuid}`);
    if (result.joinWebUrl) console.log(`  joinWebUrl: ${result.joinWebUrl}`);
  } else if (joinUrl) {
    console.log("Resolving meeting by join URL (legacy)…");
    const client = await getDelegatedClient();
    const meetingsRes = await client
      .api("/me/onlineMeetings")
      .filter(`joinWebUrl eq '${joinUrl}'`)
      .get();
    const meetings: Array<{ id: string; chatInfo?: { threadId?: string }; subject?: string }> =
      meetingsRes.value ?? [];
    if (meetings.length === 0) throw new Error("No meeting found with that join URL.");
    const meeting = meetings[0];
    if (!meeting.chatInfo?.threadId) throw new Error("Meeting has no chatInfo.threadId.");
    chatId = meeting.chatInfo.threadId;
    console.log(`✓ Resolved meeting "${meeting.subject ?? meeting.id}" — chatId: ${chatId}`);
  } else {
    console.error("Set MEETING_TOPIC (preferred) or MEETING_JOIN_URL env var before running.");
    console.error('Example: MEETING_TOPIC="Interviewly smoke test" pnpm smoke:send-message');
    process.exit(1);
  }

  const client = await getDelegatedClient();
  console.log("Posting message to meeting chat…");
  const msg = await client.api(`/chats/${chatId}/messages`).post({
    body: {
      contentType: "html",
      content: "<p><strong>Hello from Interviewly</strong> 👋 — smoke test successful.</p>",
    },
  });

  console.log(`✓ Message posted! id=${msg.id}, createdAt=${msg.createdDateTime}`);
  console.log("\n✅ smoke-send-message passed");
}

main().catch((err) => {
  console.error("✗ smoke-send-message failed:", err.message ?? err);
  process.exit(1);
});
