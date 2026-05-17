import { NextRequest, NextResponse } from "next/server";
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
import { loadTemplate, fillRound, addMetaSheet, toBuffer } from "@/lib/probeform/filler";
import type { TranscriptSegment } from "@/types/index";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function finalize(id: string, injectedVttSegments?: TranscriptSegment[]): Promise<void> {
  const interview = store.get(id);
  if (!interview) return;

  try {
    let vttSegments: TranscriptSegment[] = injectedVttSegments ?? [];
    let vttRaw = "";

    if (!injectedVttSegments) {
      // Poll for transcript with exponential backoff
      const organizerGuid = await resolveOrganizerGuid(config.ms.organizerEmail);
      const delays = [5, 10, 20, 40, 80, 120];
      let transcripts: Array<{ id: string }> = [];

      for (const delaySec of delays) {
        await sleep(delaySec * 1000);
        log.info({ interviewId: id, delaySec }, "Polling for transcript...");
        transcripts = await listTranscripts(organizerGuid, interview.meetingId!);
        if (transcripts.length > 0) break;
      }

      if (transcripts.length === 0) {
        throw new Error("Transcript not available after 5 minutes of polling. Use manual upload.");
      }

      vttRaw = await fetchTranscriptVtt(organizerGuid, interview.meetingId!, transcripts[0].id);
      vttSegments = parseVtt(vttRaw);
      log.info({ interviewId: id, segmentCount: vttSegments.length }, "VTT parsed");
    }

    const chatSegments = await fetchChatMessages(interview.chatId!);
    const transcript = mergeTranscriptSources(vttSegments, chatSegments);
    log.info({ interviewId: id, totalSegments: transcript.length }, "Transcript merged");

    const filledForm = await mapTranscriptToProbeForm({
      round: interview.round,
      candidateName: interview.candidateName,
      roleAppliedFor: interview.roleAppliedFor,
      candidateTotalYears: interview.candidateTotalYears,
      candidateRelevantYears: interview.candidateRelevantYears,
      transcript,
      questionPlan: interview.questionPlan!,
    });

    const wb = await loadTemplate();
    fillRound(wb, interview.round, filledForm);

    const transcriptSha256 = vttRaw
      ? createHash("sha256").update(vttRaw).digest("hex")
      : createHash("sha256").update(JSON.stringify(vttSegments)).digest("hex");

    addMetaSheet(wb, {
      app: "interviewly",
      version: "0.1.0",
      modelProvider: config.llm.provider,
      modelId: config.llm.modelId,
      generatedAt: new Date().toISOString(),
      meetingId: interview.meetingId ?? "unknown",
      transcriptSha256,
      recruiterEmail: config.ms.organizerEmail,
      botUserEmail: config.ms.botUserEmail,
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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const interview = store.get(id);
  if (!interview) {
    return NextResponse.json({ ok: false, error: "Interview not found" }, { status: 404 });
  }

  store.update(id, { status: "ended" });
  void finalize(id);

  return NextResponse.json({
    ok: true,
    downloadUrl: `/api/interviews/${id}/probe-form`,
  });
}

// Export for use by upload-transcript route
export { finalize };
