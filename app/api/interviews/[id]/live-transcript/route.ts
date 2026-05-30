// ============================================================
// Scope Y — receive transcript chunks from the medha-bot sidecar.
//
// Auth: X-Medha-Secret header MUST match config.bot.sharedSecret.
// When the secret is unset in config, the route 503s — we refuse to
// accept transcripts unauthenticated rather than silently allowing
// them, even in TEST_MODE (the simulate-transcript.ts script reads
// the secret from .env.local and sends the matching header).
//
// Only `isFinal=true` chunks are persisted to interview.liveTranscript.
// Partial chunks are dropped — continuous STT emits a partial every
// ~500ms; persisting all of them would blow up the in-memory store
// and the persist.ts JSON file. Documented limitation; a future
// "live partial" indicator could maintain a separate ephemeral map.
//
// On a final chunk that meets the branching criteria (candidate
// utterance, auto-conduct active, ≥50 chars), we fire-and-forget
// autoConductor.handleBranching so the bot's POST returns quickly
// even when DeepSeek is slow.
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { handleBranching } from "@/lib/autoConductor";
import type { LiveTranscriptChunk } from "@/types/index";

const BodySchema = z.object({
  speaker: z.string().min(1),
  text: z.string(),
  timestamp: z.string().min(1),
  isFinal: z.boolean(),
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
  const got = req.headers.get(SECRET_HEADER);
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: "X-Medha-Secret mismatch" }, { status: 401 });
  }

  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Skip partial chunks entirely — only persist finals.
  if (!body.isFinal) {
    return NextResponse.json({ ok: true, skipped: "partial" });
  }

  const chunk: LiveTranscriptChunk = body;
  const updated = store.update(id, {
    liveTranscript: [...(interview.liveTranscript ?? []), chunk],
  });

  // Branching trigger — fire-and-forget so the bot doesn't block on LLM.
  // Speaker filter: anything containing "Medha" is the bot itself (post-rename).
  // The organizer name isn't reliably knowable here; let handleBranching's
  // own logic decide based on the chunk's text.
  const isBot = chunk.speaker.toLowerCase().includes("medha");
  const conductorActive = updated?.autoConduct?.active === true;
  const haveIndex = (updated?.autoConduct?.currentQuestionIndex ?? -1) >= 0;
  if (!isBot && conductorActive && haveIndex) {
    void handleBranching(id, chunk).catch((err) =>
      log.error({ interviewId: id, err: err instanceof Error ? err.message : String(err) },
                "live-transcript: handleBranching threw (non-fatal)")
    );
  }

  return NextResponse.json({ ok: true });
}
