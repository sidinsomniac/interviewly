// Smoke test: resolve a Teams meeting by join URL, then post "Hello from Interviewly"
// into the meeting chat as the Bot User.
// Usage: MEETING_JOIN_URL="https://teams.microsoft.com/l/meetup-join/..." pnpm smoke:send-message

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
import "isomorphic-fetch";
import { getDelegatedClient } from "../src/lib/graph/client";

async function main() {
  const joinUrl = process.env.MEETING_JOIN_URL;
  if (!joinUrl) {
    console.error("Set MEETING_JOIN_URL env var before running this script.");
    console.error('Example: MEETING_JOIN_URL="https://teams.microsoft.com/..." pnpm smoke:send-message');
    process.exit(1);
  }

  const client = await getDelegatedClient();

  console.log("Resolving meeting by join URL...");
  const meetingsRes = await client
    .api("/me/onlineMeetings")
    .filter(`joinWebUrl eq '${joinUrl}'`)
    .get();

  const meetings: Array<{ id: string; chatInfo?: { threadId?: string }; subject?: string }> =
    meetingsRes.value ?? [];

  if (meetings.length === 0) {
    throw new Error(
      "No meeting found with that join URL. Make sure the Bot User was invited to the meeting."
    );
  }

  const meeting = meetings[0];
  const chatId = meeting.chatInfo?.threadId;
  if (!chatId) throw new Error("Meeting found but has no chatInfo.threadId.");

  console.log(`✓ Resolved meeting "${meeting.subject ?? meeting.id}"`);
  console.log(`  meetingId: ${meeting.id}`);
  console.log(`  chatId:    ${chatId}`);

  console.log("Posting message to meeting chat...");
  const msg = await client.api(`/chats/${chatId}/messages`).post({
    body: {
      contentType: "html",
      content: "<p><strong>Hello from Interviewly</strong> 👋 — smoke test successful.</p>",
    },
  });

  console.log(`✓ Message posted! id=${msg.id}, createdAt=${msg.createdDateTime}`);
}

main().catch((err) => {
  console.error("✗ smoke-send-message failed:", err.message ?? err);
  process.exit(1);
});
