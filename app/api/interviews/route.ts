import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { findMeetingChatByTopic, resolveOnlineMeetingId } from "@/lib/graph/meeting";
import { generateQuestionPlan } from "@/lib/llm/question-plan";
import { getRoleSchema } from "@/lib/probeform/registry";
import { CreateInterviewRequestSchema } from "@/types/index";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateInterviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
    }

    const {
      candidateName, candidateTotalYears, candidateRelevantYears,
      roleAppliedFor, roleId, jdText, chosenExerciseId, meetingTopic,
      conductMode,
    } = parsed.data;

    const schema = getRoleSchema(roleId);
    if (!schema) {
      return NextResponse.json(
        { ok: false, error: `Unknown roleId "${roleId}". See src/lib/probeform/registry.ts for the registered roles.` },
        { status: 400 }
      );
    }

    // Sub-Phase E dup-guard: refuse a manual create when the same
    // meetingTopic already has an in-flight interview from the last 24h.
    // n8n collisions are unlikely (n8n always generates a unique subject)
    // but a recruiter hitting "Create" twice for the same candidate is
    // the easy mistake to prevent. Compares trimmed-lowercase topics.
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const existing = store.list().find((iv) => {
      const matchTopic =
        iv.meetingTopic.trim().toLowerCase() === meetingTopic.trim().toLowerCase();
      const within24h =
        Date.now() - new Date(iv.createdAt).getTime() < ONE_DAY_MS;
      return matchTopic && within24h &&
             iv.status !== "completed" && iv.status !== "failed";
    });
    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `An interview for "${meetingTopic}" already exists ` +
            `(scheduled by ${existing.source}). Open it instead.`,
          existingInterviewId: existing.id,
        },
        { status: 409 }
      );
    }

    // In TEST_MODE we skip the Graph meeting lookup entirely so the user
    // can exercise the end-to-end pipeline without first scheduling a
    // real Teams meeting. Fake-but-stable ids let the rest of the
    // pipeline (store, dashboards) function normally.
    let chatId: string | undefined;
    let organizerGuid: string | undefined;
    let meetingId: string | undefined;

    if (config.app.testMode) {
      chatId = `test-mode-chat-${Date.now()}`;
      organizerGuid = "test-mode-organizer";
      meetingId = `test-mode-meeting-${Date.now()}`;
      log.warn({ meetingTopic }, "TEST_MODE: skipping Graph meeting lookup; using stub ids");
    } else {
      const lookup = await findMeetingChatByTopic(meetingTopic);
      chatId = lookup.chatId;
      organizerGuid = lookup.organizerGuid;
      meetingId = (organizerGuid && lookup.joinWebUrl)
        ? await resolveOnlineMeetingId(organizerGuid, lookup.joinWebUrl)
        : undefined;
    }

    const questionPlan = await generateQuestionPlan({
      schema, roleAppliedFor, candidateTotalYears, candidateRelevantYears, jdText,
    });

    const interview = store.create({
      candidateName, candidateTotalYears, candidateRelevantYears,
      roleAppliedFor, roleId, jdText, chosenExerciseId,
      meetingTopic, meetingId, chatId, organizerGuid,
      questionPlan,
      status: "draft",
      postedQuestionIndices: [],
      source: "manual",
      conductMode,
    });

    return NextResponse.json({ ok: true, interview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const interviews = store.list();
  return NextResponse.json({ ok: true, interviews });
}
