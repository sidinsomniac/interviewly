import { getAppClient } from "@/lib/graph/client";

export async function createTeamsMeeting(params: {
  organizerEmail: string;
  subject: string;
  startIso: string;
  endIso: string;
  attendees: Array<{ email: string; name?: string }>;
  bodyContent: string;
}): Promise<{
  eventId: string;
  onlineMeetingId: string;
  joinUrl: string;
  chatId: string;
  organizerGuid: string;
}> {
  const client = await getAppClient();

  // 1. Resolve organizer GUID
  const user = await client.api(`/users/${params.organizerEmail}`).get();
  const organizerGuid = user.id as string;

  // 2. Create calendar event with an online meeting attached
  const event = await client.api(`/users/${organizerGuid}/events`).post({
    subject: params.subject,
    start: { dateTime: params.startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: params.endIso, timeZone: "Asia/Kolkata" },
    attendees: params.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: "required",
    })),
    body: { contentType: "HTML", content: params.bodyContent },
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    allowNewTimeProposals: false,
  });

  const joinUrl = event.onlineMeeting?.joinUrl as string | undefined;
  if (!joinUrl) throw new Error("Event created but onlineMeeting.joinUrl is missing");

  // 3. Resolve online meeting id + chatId by joinUrl (app-tier; access policy in place)
  const meetingsRes = await client
    .api(`/users/${organizerGuid}/onlineMeetings`)
    .filter(`JoinWebUrl eq '${joinUrl}'`)
    .get();
  const meeting = (meetingsRes.value ?? [])[0];
  if (!meeting) throw new Error("Online meeting not found by joinUrl after event creation");

  return {
    eventId: event.id as string,
    onlineMeetingId: meeting.id as string,
    joinUrl,
    chatId: (meeting.chatInfo?.threadId as string) ?? "",
    organizerGuid,
  };
}
