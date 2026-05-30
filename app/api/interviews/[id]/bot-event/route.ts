// ============================================================
// Phase I — webhook receiver for medha-bot lifecycle events.
//
// Auth mirrors live-transcript/route.ts — X-Medha-Secret header, 503
// when unconfigured, 401 on mismatch. Event payload is open-ended so
// the bot can add new events without coordinated Medha deploys; today
// we only act on "callEnded". Unknown events log and 200 (no retry).
//
// callEnded → trip the shared endInterview() pipeline, which is
// idempotent vs the recruiter also clicking End in the dashboard.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { endInterview } from "@/lib/endInterview";

const BodySchema = z.object({
  eventName: z.string().min(1),
  details: z.unknown().optional(),
  timestamp: z.string().min(1),
});

const SECRET_HEADER = "x-medha-secret";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth — refuse silently-allowed traffic if the secret is unset.
  const expected = config.bot.sharedSecret;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "MEDHA_BOT_SHARED_SECRET not configured — bot integration disabled" },
      { status: 503 }
    );
  }
  if (req.headers.get(SECRET_HEADER) !== expected) {
    return NextResponse.json({ ok: false, error: "X-Medha-Secret mismatch" }, { status: 401 });
  }

  const { id } = await params;
  if (!store.get(id)) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  log.info(
    { interviewId: id, eventName: body.eventName, timestamp: body.timestamp },
    "bot-event: received"
  );

  if (body.eventName === "callEnded") {
    const result = await endInterview(id);
    log.info(
      { interviewId: id, alreadyEnded: result.alreadyEnded },
      "bot-event: callEnded → endInterview"
    );
    return NextResponse.json({ ok: true, alreadyEnded: result.alreadyEnded });
  }

  // Unknown event — log and ack so the bot doesn't retry.
  log.warn({ interviewId: id, eventName: body.eventName }, "bot-event: unknown event, no-op");
  return NextResponse.json({ ok: true, handled: false });
}
