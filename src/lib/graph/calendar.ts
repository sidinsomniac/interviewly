import { getAppClient } from "@/lib/graph/client";
import { log } from "@/lib/logger";

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

  // Diagnostic checkpoint #2: log the attendees array immediately
  // before the events POST so we see what Medha is about to send even
  // if Graph throws. A missing/empty candidateEmail here points at the
  // schedule-interview route's attendees-array construction.
  log.info({ attendees: params.attendees }, "createTeamsMeeting — attendees");

  // 2. Create calendar event with an online meeting attached.
  // `responseRequested: true` is required by some tenants for Graph
  // to actually send the Outlook invitation email — set it explicitly
  // so this isn't a confounding variable when diagnosing missing invites.
  const event = await client.api(`/users/${organizerGuid}/events`).post({
    subject: params.subject,
    start: { dateTime: params.startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: params.endIso, timeZone: "Asia/Kolkata" },
    attendees: params.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: "required",
    })),
    body: { contentType: "HTML", content: params.bodyContent },
    responseRequested: true,
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
  const onlineMeetingId = meeting.id as string;

  // Sub-Phase E: PATCH the meeting to bypass the lobby and auto-record.
  // Non-fatal — tenants vary on which of these settings they accept, so
  // a 403/400 here must not block the scheduling pipeline. The booth-day
  // verification is the pino log line emitted below.
  try {
    await client
      .api(`/users/${organizerGuid}/onlineMeetings/${onlineMeetingId}`)
      .patch({
        allowedPresenters: "everyone",
        lobbyBypassSettings: {
          scope: "everyone",
          isDialInBypassEnabled: true,
        },
        recordAutomatically: true,
      });
    log.info({ onlineMeetingId, lobbyScope: "everyone" }, "Meeting properties PATCH succeeded");
  } catch (err) {
    // Round-4 (2026-06-01) — surface statusCode/code so Sid can tell a real
    // PATCH failure (guests stuck in lobby) from a tenant-policy override
    // (PATCH succeeds but AutoAdmittedUsers policy still gates). See
    // docs/03-MICROSOFT-INTEGRATION.md §12.
    log.warn(
      {
        onlineMeetingId,
        errMessage: err instanceof Error ? err.message : String(err),
        errCode: (err as { code?: string })?.code,
        errStatusCode: (err as { statusCode?: number })?.statusCode,
      },
      "Meeting properties PATCH FAILED — guests will be stuck in lobby"
    );
  }

  return {
    eventId: event.id as string,
    onlineMeetingId,
    joinUrl,
    chatId: (meeting.chatInfo?.threadId as string) ?? "",
    organizerGuid,
  };
}
