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
import { handleBranching, forceAdvance } from "@/lib/autoConductor";
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
  let updated = store.update(id, {
    liveTranscript: [...(interview.liveTranscript ?? []), chunk],
  });

  // Phase N (2026-05-31) — hardened bot/speaker triage.
  // Three failure modes seen tonight:
  //   1. Bot emitted a chunk with `speaker: ""` (no display name resolved)
  //      and the prior `speaker.toLowerCase().includes("medha")` filter
  //      let it through — Medha's own utterance triggered voice consent.
  //   2. Empty/whitespace text would have matched the regex (it doesn't,
  //      but a defensive guard makes the rejection log unambiguous).
  //   3. The voice path advanced to Q1 even when no human had been
  //      observed in the meeting — gated below via lastHumanActivityAt.
  // Future hardening: when the sidecar starts sending speakerId/GUID we
  // can switch to GUID match like the chat-side conductor (autoConductor
  // line 360). For now, name match is the only signal we have.
  const rawSpeaker = (chunk.speaker ?? "").trim();
  const speakerLower = rawSpeaker.toLowerCase();
  const isBot =
    rawSpeaker === "" ||
    speakerLower.includes("medha") ||
    speakerLower.includes("bot");
  const trimmedText = chunk.text.trim();
  const hasSubstance = trimmedText.length >= 3;

  // Phase N — stamp lastHumanActivityAt as soon as we see a substantive
  // non-bot chunk. Placed BEFORE the consent gate so the human-presence
  // check there sees a fresh timestamp on the very same tick. Drives the
  // autoConductor's watchdog (Fix 4).
  if (!isBot && hasSubstance && updated?.autoConduct) {
    updated = store.update(id, {
      autoConduct: {
        ...updated.autoConduct,
        lastHumanActivityAt: new Date().toISOString(),
      },
    });
  }

  // Branching trigger — fire-and-forget so the bot doesn't block on LLM.
  const conductorActive = updated?.autoConduct?.active === true;
  const haveIndex = (updated?.autoConduct?.currentQuestionIndex ?? -1) >= 0;
  if (!isBot && conductorActive && haveIndex) {
    void handleBranching(id, chunk).catch((err) =>
      log.error({ interviewId: id, err: err instanceof Error ? err.message : String(err) },
                "live-transcript: handleBranching threw (non-fatal)")
    );
  }

  // Phase H follow-up — voice consent path. Mutex with branching above
  // (which requires currentQuestionIndex >= 0; consent fires while it's -1).
  // Phase N (2026-05-31) hardened with three layered defenses so Medha's
  // own utterance can never advance Q1 again.
  if (
    updated?.autoConduct?.awaitingConsent === true &&
    /\bi\s+agree\b/i.test(trimmedText)
  ) {
    if (isBot || !hasSubstance) {
      log.warn(
        {
          interviewId: id,
          speaker: rawSpeaker || "(empty)",
          textSample: trimmedText.slice(0, 80),
          rejection: isBot ? "bot-speaker" : "no-substance",
        },
        "live-transcript: consent candidate REJECTED"
      );
    } else {
      // Human-presence gate via the lastHumanActivityAt watchdog stamp.
      // If we've NEVER stamped activity, or it's stale (>5 min), refuse
      // to advance — the candidate hasn't actually engaged. The watchdog
      // will eventually leave the call via its own timeout (Fix 4).
      // Note: the stamp above just fired this very tick if the chunk
      // qualified, so we re-read from `updated.autoConduct` not from a
      // pre-read snapshot.
      const lastActivity = updated.autoConduct.lastHumanActivityAt;
      const fiveMinAgo = Date.now() - 5 * 60_000;
      const humanPresent =
        !!lastActivity && Date.parse(lastActivity) >= fiveMinAgo;
      if (!humanPresent) {
        log.warn(
          {
            interviewId: id,
            speaker: rawSpeaker,
            lastHumanActivityAt: lastActivity ?? null,
          },
          "live-transcript: consent candidate REJECTED — no recent human activity"
        );
      } else {
        log.info(
          { interviewId: id, speaker: rawSpeaker },
          "live-transcript: voice consent received, advancing to Q1"
        );
        store.update(id, {
          autoConduct: {
            ...updated.autoConduct,
            awaitingConsent: false,
            consentReceivedAt: new Date().toISOString(),
          },
        });
        void forceAdvance(id).catch((err) =>
          log.error(
            { interviewId: id, err: err instanceof Error ? err.message : String(err) },
            "live-transcript: voice-consent forceAdvance threw (non-fatal)"
          )
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
