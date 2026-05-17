import { getDelegatedClient } from "@/lib/graph/client";

export async function findMeetingChatByTopic(
  topic: string
): Promise<{ chatId: string; meetingId?: string }> {
  const client = await getDelegatedClient();

  const res = await client
    .api("/me/chats")
    .query({ $top: 50, $orderby: "lastUpdatedDateTime desc" })
    .get();

  const chats: Array<{
    id: string;
    chatType?: string;
    topic?: string;
    onlineMeetingInfo?: { calendarEventId?: string };
  }> = res.value ?? [];

  const match = chats.find(
    (c) =>
      c.chatType === "meeting" &&
      c.topic?.toLowerCase().includes(topic.toLowerCase())
  );

  if (!match) {
    throw new Error(
      `No meeting chat found with topic containing "${topic}". ` +
      "Make sure the Bot User is a participant and the meeting has started."
    );
  }

  return {
    chatId: match.id,
    meetingId: match.onlineMeetingInfo?.calendarEventId,
  };
}

export async function resolveMeeting(joinUrl: string): Promise<{ meetingId: string; chatId: string }> {
  const client = await getDelegatedClient();

  const res = await client
    .api("/me/onlineMeetings")
    .filter(`joinWebUrl eq '${joinUrl}'`)
    .get();

  const meetings: Array<{
    id: string;
    chatInfo?: { threadId?: string };
    subject?: string;
  }> = res.value ?? [];

  if (meetings.length === 0) {
    throw new Error(
      `No meeting found with join URL: ${joinUrl}. ` +
      "Make sure the Bot User (interviewly.bot@RecipeBari.onmicrosoft.com) was invited as an attendee."
    );
  }

  const meeting = meetings[0];
  const chatId = meeting.chatInfo?.threadId;

  if (!chatId) {
    throw new Error(
      `Meeting "${meeting.subject ?? meeting.id}" was found but has no chatInfo.threadId. ` +
      "This can happen if the Bot User has not yet joined the meeting chat. " +
      "Ensure the bot is invited and Teams has processed the invite."
    );
  }

  return { meetingId: meeting.id, chatId };
}
