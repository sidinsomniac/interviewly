import { getDelegatedClient, getAppClient } from "@/lib/graph/client";
import { resolveOrganizerGuid } from "@/lib/graph/transcript";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

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

  // Resolve MS_ORGANIZER_EMAIL → AAD GUID so we can filter on
  // c.onlineMeetingInfo.organizer.id. The bot may be invited to meetings
  // from several organizers; this env scopes which organizer's meetings
  // the bot considers. Reuses the app-tier helper already used by the
  // transcript-fetch path so we're consistent across both call sites.
  const organizerEmail = config.ms.organizerEmail;
  const expectedOrganizerGuid = await resolveOrganizerGuid(organizerEmail);

  const topicMatches = meetingChats.filter(
    (c) => c.topic?.toLowerCase().includes(topic.toLowerCase())
  );

  const matches = topicMatches
    .filter((c) => c.onlineMeetingInfo?.organizer?.id === expectedOrganizerGuid)
    .sort((a, b) => {
      const ta = a.lastUpdatedDateTime ? new Date(a.lastUpdatedDateTime).getTime() : 0;
      const tb = b.lastUpdatedDateTime ? new Date(b.lastUpdatedDateTime).getTime() : 0;
      return tb - ta;
    });

  if (matches.length === 0) {
    // Differentiate the two failure modes so the user sees which one
    // is biting them: nothing matches the topic at all, or topics match
    // but the configured organizer didn't schedule any of them.
    const allTopics = meetingChats.map((c) => c.topic ?? "(no topic)").join(", ");
    if (topicMatches.length === 0) {
      throw new Error(
        `No meeting chat found with topic containing "${topic}". ` +
        `Meeting chats visible to the bot: [${allTopics || "none"}]. ` +
        "Make sure the Bot User is a participant and the meeting has started."
      );
    }
    const wrongOrgTopics = topicMatches
      .map((c) => `"${c.topic ?? "(no topic)"}" (organizer ${c.onlineMeetingInfo?.organizer?.id ?? "unknown"})`)
      .join(", ");
    throw new Error(
      `Topic "${topic}" matched ${topicMatches.length} chat(s), but none were organized by ` +
      `MS_ORGANIZER_EMAIL=${organizerEmail} (GUID ${expectedOrganizerGuid}). ` +
      `Wrong-organizer matches: [${wrongOrgTopics}]. ` +
      "Either update MS_ORGANIZER_EMAIL to the actual organizer's email or use a more distinctive meetingTopic."
    );
  }

  const picked = matches[0];
  log.info(
    {
      chatId: picked.id,
      topic: picked.topic,
      organizerGuid: picked.onlineMeetingInfo?.organizer?.id,
      lastUpdatedDateTime: picked.lastUpdatedDateTime,
      candidatesConsidered: matches.length,
    },
    "Bot found meeting chat"
  );

  return {
    chatId: picked.id,
    organizerGuid: picked.onlineMeetingInfo?.organizer?.id ?? undefined,
    joinWebUrl: picked.onlineMeetingInfo?.joinWebUrl ?? undefined,
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
