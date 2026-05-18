import { getDelegatedClient, getAppClient } from "@/lib/graph/client";

export async function findMeetingChatByTopic(
  topic: string
): Promise<{ chatId: string; organizerGuid?: string; joinWebUrl?: string }> {
  const client = await getDelegatedClient();

  const res = await client
    .api("/me/chats")
    .query({ $top: 50, $expand: "lastMessagePreview" })
    .get();

  const chats: Array<{
    id: string;
    chatType?: string;
    topic?: string;
    lastUpdatedDateTime?: string;
    onlineMeetingInfo?: {
      calendarEventId?: string;
      joinWebUrl?: string;
      organizer?: { id?: string };
    };
  }> = res.value ?? [];

  const meetingChats = chats.filter((c) => c.chatType === "meeting");

  const matches = meetingChats
    .filter((c) => c.topic?.toLowerCase().includes(topic.toLowerCase()))
    .sort((a, b) => {
      const ta = a.lastUpdatedDateTime ? new Date(a.lastUpdatedDateTime).getTime() : 0;
      const tb = b.lastUpdatedDateTime ? new Date(b.lastUpdatedDateTime).getTime() : 0;
      return tb - ta;
    });

  if (matches.length === 0) {
    const found = meetingChats.map((c) => c.topic ?? "(no topic)").join(", ");
    throw new Error(
      `No meeting chat found with topic containing "${topic}". ` +
      `Meeting chats visible to the bot: [${found || "none"}]. ` +
      "Make sure the Bot User is a participant and the meeting has started."
    );
  }

  return {
    chatId: matches[0].id,
    organizerGuid: matches[0].onlineMeetingInfo?.organizer?.id ?? undefined,
    joinWebUrl: matches[0].onlineMeetingInfo?.joinWebUrl ?? undefined,
  };
}

export async function resolveOnlineMeetingId(
  organizerGuid: string,
  joinWebUrl: string
): Promise<string | undefined> {
  try {
    const client = await getAppClient();
    const res = await client
      .api(`/users/${organizerGuid}/onlineMeetings`)
      .filter(`JoinWebUrl eq '${joinWebUrl}'`)
      .get();
    const meetings: Array<{ id: string }> = res.value ?? [];
    return meetings[0]?.id;
  } catch {
    return undefined;
  }
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
