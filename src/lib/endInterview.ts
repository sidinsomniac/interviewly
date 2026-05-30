// ============================================================
// Phase I — shared end-interview helper.
//
// Two callers:
//   - app/api/interviews/[id]/end/route.ts        (recruiter clicks End)
//   - app/api/interviews/[id]/bot-event/route.ts  (bot reports callEnded)
//
// `endInterview(id)` is the idempotent wrapper: it short-circuits when the
// interview is already in a terminal/finalizing state ("ended" | "completed"
// | "failed"), stamps status="ended" otherwise, and fires `finalize(id)`
// fire-and-forget.
//
// `finalize(id, injected?)` is the existing body, moved verbatim from
// app/api/interviews/[id]/end/route.ts. Still exported so the
// /upload-transcript path can call it directly with injected VTT segments
// (the recruiter-uploaded path bypasses the idempotency wrapper because
// it explicitly wants to re-run finalize with a fresh transcript).
// ============================================================
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { resolveOrganizerGuid, listTranscripts, fetchTranscriptVtt, parseVtt } from "@/lib/graph/transcript";
import { fetchChatMessages } from "@/lib/graph/chatHistory";
import { mergeTranscriptSources } from "@/lib/transcript-merge";
import { mapTranscriptToProbeForm } from "@/lib/llm/transcript-mapping";
import { loadTemplate, fillProbeForm, addMetaSheet, toBuffer } from "@/lib/probeform/filler";
import { getRoleSchema } from "@/lib/probeform/registry";
import { loadFixtureBundle } from "@/lib/fixtures";
import { stopAutoConduct } from "@/lib/autoConductor";
import { cancelScheduledStart } from "@/lib/interviewScheduler";
import type { TranscriptSegment } from "@/types/index";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Idempotent end-interview entry point. Returns:
 *   - { found: false } if the interview id is unknown.
 *   - { found: true, alreadyEnded: true }  if status is already terminal
 *     or finalizing — no work is done. Caller can still return a
 *     downloadUrl (the probe form is being / has been generated).
 *   - { found: true, alreadyEnded: false } on first call — stamps
 *     status="ended" and fires finalize() fire-and-forget.
 *
 * Designed to be safe to call from concurrent paths (recruiter clicking End
 * while the bot also reports callEnded). At-most-one finalize() will run.
 */
export async function endInterview(
  id: string
): Promise<{ found: boolean; alreadyEnded: boolean }> {
  const interview = store.get(id);
  if (!interview) return { found: false, alreadyEnded: false };
  if (
    interview.status === "ended" ||
    interview.status === "completed" ||
    interview.status === "failed"
  ) {
    log.info(
      { interviewId: id, status: interview.status },
      "endInterview: already in terminal/finalizing state, skipping"
    );
    return { found: true, alreadyEnded: true };
  }
  // Phase J — cancel any pending scheduled auto-start (idempotent no-op
  // if none was scheduled). Recruiter manually ending an interview before
  // its scheduledFor time must not have the conductor fire afterwards.
  cancelScheduledStart(id);
  store.update(id, { status: "ended" });
  void finalize(id); // fire-and-forget — caller returns immediately
  return { found: true, alreadyEnded: false };
}

export async function finalize(id: string, injectedVttSegments?: TranscriptSegment[]): Promise<void> {
  const interview = store.get(id);
  if (!interview) return;

  // Scope X: end-interview always wins. If the auto-conductor is still
  // ticking, stop it BEFORE we start the (potentially long) Graph polling
  // and Excel-fill work, so the timer doesn't post stale questions or
  // pile up logs while finalize runs.
  if (interview.autoConduct?.active) {
    log.info({ interviewId: id }, "end-interview: stopping active auto-conductor");
    stopAutoConduct(id);
    store.update(id, {
      autoConduct: { ...interview.autoConduct, active: false },
    });
  }

  // Scope Y: ask the sidecar bot to leave the meeting. Non-fatal —
  // even if the bot is unreachable or already left, finalize must
  // proceed to produce the probe form.
  if (config.bot.baseUrl) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 6000);
    try {
      await fetch(`${config.bot.baseUrl.replace(/\/$/, "")}/api/bot/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Medha-Secret": config.bot.sharedSecret ?? "",
        },
        body: JSON.stringify({ interviewId: id }),
        signal: controller.signal,
      });
      log.info({ interviewId: id }, "end-interview: bot /api/bot/leave called");
    } catch (err) {
      log.warn(
        { interviewId: id, err: err instanceof Error ? err.message : String(err) },
        "end-interview: bot /api/bot/leave failed (continuing finalize)"
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  const schema = getRoleSchema(interview.roleId);
  if (!schema) {
    const msg = `Unknown roleId "${interview.roleId}" on interview ${id}. ` +
      `Registry has: ${Object.keys((await import("@/lib/probeform/registry")).ROLE_REGISTRY).join(", ")}`;
    log.error({ interviewId: id }, msg);
    store.update(id, { status: "failed", errorMessage: msg });
    return;
  }

  try {
    let vttSegments: TranscriptSegment[] = injectedVttSegments ?? [];
    let vttRaw = "";
    let chatSegments: TranscriptSegment[] = [];
    let fixtureMeta: { role: string; outcome: string } | null = null;

    // ── TEST_MODE branch ─────────────────────────────────────
    // Skip all Graph polling and use fixtures from data/fixtures/.
    // Lets the full pipeline run in <30 sec without a real meeting.
    if (config.app.testMode && !injectedVttSegments) {
      // MEDHA_TEST_FIXTURE_ROLE is an explicit dev override: when set in
      // .env.local, it forces the fixture lookup regardless of the
      // interview's roleId. Useful for testing roles whose own fixture
      // doesn't exist yet (e.g. UI shows "Frontend Engineer" but we want
      // to load the existing "core" fixture). We read the raw env here
      // rather than config.app.fixtureRole because that getter defaults
      // to "react" — which would silently hijack every TEST_MODE run if
      // we used it as the fallback when the env is unset.
      const explicitFixtureRole = process.env.MEDHA_TEST_FIXTURE_ROLE?.trim();
      const fixtureRole = explicitFixtureRole || interview.roleId;
      log.info(
        {
          interviewId: id,
          interviewRoleId: interview.roleId,
          explicitFixtureRole: explicitFixtureRole ?? null,
          resolvedFixtureRole: fixtureRole,
        },
        "TEST_MODE fixture role resolution"
      );
      const bundle = await loadFixtureBundle({
        role: fixtureRole,
        outcome: config.app.fixtureOutcome,
      });
      vttRaw = bundle.vttRaw;
      vttSegments = bundle.vttSegments;
      chatSegments = bundle.chatSegments;
      fixtureMeta = bundle.meta;
      log.warn(
        { interviewId: id, ...fixtureMeta },
        "TEST_MODE active — using fixture transcript + chat history instead of Graph"
      );
    } else if (!injectedVttSegments) {
      // ── Real Graph path ──────────────────────────────────
      const organizerGuid = interview.organizerGuid
        ?? await resolveOrganizerGuid(config.ms.organizerEmail);
      // Phase J — reduced 6-poll/5-min backoff to 3-poll/35-sec.
      // Recruiters often forget to enable Teams transcription; we degrade
      // to liveTranscript+chat rather than blocking finalize for 5 minutes.
      const delays = [5, 10, 20];
      let transcripts: Array<{ id: string }> = [];

      for (const delaySec of delays) {
        await sleep(delaySec * 1000);
        log.info({ interviewId: id, delaySec }, "Polling for transcript...");
        transcripts = await listTranscripts(organizerGuid, interview.meetingId!);
        if (transcripts.length > 0) break;
      }

      if (transcripts.length === 0) {
        log.warn(
          { interviewId: id },
          "end-interview: Teams VTT unavailable after 35s — continuing with liveTranscript + chat only"
        );
        // vttSegments stays []; we keep going.
      } else {
        vttRaw = await fetchTranscriptVtt(organizerGuid, interview.meetingId!, transcripts[0].id);
        vttSegments = parseVtt(vttRaw);
        log.info({ interviewId: id, segmentCount: vttSegments.length }, "VTT parsed");
      }
    }

    // Chat history: fixtures already populated `chatSegments` above; in
    // every other path (real meeting, or injected VTT via manual upload)
    // we still want the live chat from Graph.
    if (!config.app.testMode || injectedVttSegments) {
      chatSegments = await fetchChatMessages(interview.chatId!);
    }

    // Phase J — also consume the bot's STT stream collected via
    // /live-transcript. Each chunk has { speaker, text, timestamp, isFinal };
    // /live-transcript only persists finals so we don't need to filter.
    // Estimate endTime at +3s (typical utterance duration — used only for
    // sort stability; merge sorts on startTime).
    const liveSegments: TranscriptSegment[] = (interview.liveTranscript ?? []).map((c) => ({
      speaker: c.speaker,
      startTime: c.timestamp,
      endTime: new Date(Date.parse(c.timestamp) + 3000).toISOString(),
      text: c.text,
    }));

    const merged = mergeTranscriptSources(vttSegments, chatSegments, liveSegments);
    const transcript = dedupeNearDuplicates(merged);
    log.info(
      {
        interviewId: id,
        vttCount: vttSegments.length,
        liveCount: liveSegments.length,
        chatCount: chatSegments.length,
        mergedCount: merged.length,
        dedupedCount: transcript.length,
        testMode: !!fixtureMeta,
      },
      "Transcript assembled"
    );

    const filledForm = await mapTranscriptToProbeForm({
      schema,
      interviewId: id,
      candidateName: interview.candidateName,
      roleAppliedFor: interview.roleAppliedFor,
      candidateTotalYears: interview.candidateTotalYears,
      candidateRelevantYears: interview.candidateRelevantYears,
      transcript,
      questionPlan: interview.questionPlan!,
    });

    const wb = await loadTemplate(schema.excelTemplate);
    fillProbeForm(wb, schema, filledForm);

    const transcriptSha256 = vttRaw
      ? createHash("sha256").update(vttRaw).digest("hex")
      : createHash("sha256").update(JSON.stringify(vttSegments)).digest("hex");

    addMetaSheet(wb, {
      app: "interviewly",
      version: "0.1.0",
      modelProvider: config.llm.provider,
      modelId: config.llm.modelId,
      generatedAt: new Date().toISOString(),
      meetingId: fixtureMeta
        ? `TEST_MODE:${fixtureMeta.role}-${fixtureMeta.outcome}`
        : (interview.meetingId ?? "unknown"),
      transcriptSha256,
      recruiterEmail: config.ms.organizerEmail,
      botUserEmail: config.ms.botUserEmail,
      testMode: !!fixtureMeta,
      fixtureId: fixtureMeta ? `${fixtureMeta.role}/${fixtureMeta.outcome}` : undefined,
    });

    const buffer = await toBuffer(wb);

    const outputDir = path.resolve(process.cwd(), config.app.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const filePath = path.join(outputDir, `${id}.xlsx`);
    fs.writeFileSync(filePath, buffer);

    store.update(id, {
      status: "completed",
      filledForm,
      transcript,
      probeFormFilePath: `${id}.xlsx`,
    });

    log.info({ interviewId: id, filePath }, "Probe form generated successfully");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({ interviewId: id, err: errorMessage }, "Finalize failed");
    store.update(id, { status: "failed", errorMessage });
  }
}

// ── Phase J — near-duplicate dedup ───────────────────────────────────────
//
// VTT (Teams transcription) and liveTranscript (bot's Azure STT) cover the
// same audio. When both are populated, the merge produces near-duplicate
// pairs. Catch them with a simple two-pass:
//   1. Time window: pairs whose startTime is within 2 sec.
//   2. Content: word-overlap ratio ≥ 0.8 (Jaccard-like, simpler).
// Keep the longer text (Teams' VTT often includes filler words STT drops).
// Word-overlap is cheap and resilient to minor word swaps; not perfect but
// fine for the demo. LLM tolerates a few residual dupes anyway.

function dedupeNearDuplicates(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const s of segments) {
    const dupIdx = out.findIndex((p) => {
      const dt = Math.abs(Date.parse(s.startTime) - Date.parse(p.startTime));
      if (isNaN(dt) || dt > 2000) return false; // > 2s apart, not a dup
      return wordOverlap(s.text, p.text) >= 0.8;
    });
    if (dupIdx < 0) {
      out.push(s);
    } else if (s.text.length > out[dupIdx].text.length) {
      // Replace the shorter version with the longer (more complete) one.
      out[dupIdx] = s;
    }
  }
  return out;
}

function wordOverlap(a: string, b: string): number {
  const norm = (s: string) => new Set(s.toLowerCase().match(/\w+/g) ?? []);
  const A = norm(a);
  const B = norm(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
