// ============================================================
// Phase K — Graph Mail.Send helper.
//
// Sends mail FROM the bot identity (config.ms.botUserEmail) via the
// application Graph client. Resolves the bot's AAD GUID via the
// existing per-email cache in `resolveOrganizerGuid` (misnomer; works
// for any user). Uses POST /users/{botGuid}/sendMail.
//
// Never throws — failures are logged warn. Returns Promise<boolean>:
// true on 2xx Graph accept, false on caught exception or skipped send
// (no valid recipients). Phase K callers (selectionEmail / recruiter
// scheduled) keep using `void sendMail(...)` and ignore the return;
// Phase M's probe-form caller awaits + stamps `probeFormSentAt` on true.
// Graph returns 202 Accepted on queueing — no message id is returned.
//
// Required app permission on the bot user: Mail.Send. (Application
// permission, granted to the Entra app, not delegated.)
// ============================================================
import { getAppClient } from "@/lib/graph/client";
import { resolveOrganizerGuid } from "@/lib/graph/transcript";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

export interface MailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

export interface SendMailOpts {
  to: string | string[];
  subject: string;
  /** Full HTML body. Use the templates module to build the HTML. */
  html: string;
  attachments?: MailAttachment[];
}

export async function sendMail(opts: SendMailOpts): Promise<boolean> {
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  const recipients = toList
    .filter((addr) => !!addr && addr.includes("@"))
    .map((address) => ({ emailAddress: { address } }));

  if (recipients.length === 0) {
    log.warn({ subject: opts.subject }, "sendMail: no valid recipients — skipping");
    return false;
  }

  try {
    const botGuid = await resolveOrganizerGuid(config.ms.botUserEmail);
    const client = await getAppClient();

    const message: Record<string, unknown> = {
      subject: opts.subject,
      body: {
        contentType: "HTML",
        content: opts.html,
      },
      toRecipients: recipients,
    };

    if (opts.attachments && opts.attachments.length > 0) {
      message.attachments = opts.attachments.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.contentBase64,
      }));
    }

    await client.api(`/users/${botGuid}/sendMail`).post({
      message,
      saveToSentItems: true,
    });

    log.info(
      {
        subject: opts.subject,
        toCount: recipients.length,
        attachmentCount: opts.attachments?.length ?? 0,
        fromUser: config.ms.botUserEmail,
      },
      "sendMail: 202 Accepted"
    );
    return true;
  } catch (err) {
    log.warn(
      {
        subject: opts.subject,
        toCount: recipients.length,
        err: err instanceof Error ? err.message : String(err),
      },
      "sendMail failed (non-fatal)"
    );
    return false;
  }
}
