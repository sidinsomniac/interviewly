// ============================================================
// Scope Y test harness — POST fake live-transcript chunks every 3s
// to /api/interviews/<id>/live-transcript so the dashboard can be
// exercised without a real bot.
//
// Usage:
//   pnpm tsx scripts/simulate-transcript.ts <interviewId>
//
// Reads MEDHA_BOT_SHARED_SECRET from .env.local and sends it as the
// X-Medha-Secret header (matches what the real medha-bot sidecar
// would send).
//
// Alternates interviewer + candidate chunks. Candidate chunks rotate
// through a fixture pool — some short (should NOT trigger branching),
// some long (should). Lets you watch the branching pipeline fire
// without scheduling an actual Teams meeting.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

const POLL_MS = 3000;
const TARGET = process.env.MEDHA_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const SECRET = process.env.MEDHA_BOT_SHARED_SECRET ?? "";

const INTERVIEWER_CHUNKS = [
  "Walk me through how you'd architect that.",
  "What was the hardest part of that project?",
  "How would you handle scale on that system?",
  "Have you done anything with caching there?",
];

// Mix of short (should NOT branch) and long (should branch when on a planned question)
const CANDIDATE_CHUNKS = [
  // Short — too brief to branch on
  "Yes.",
  "Sure, makes sense.",
  // Long — specific technical claims worth probing
  "We used Redis with a 60-second TTL for the hot keys and a dual-write to Postgres for any record that needed read-after-write. The tricky part was cache invalidation when the underlying record changed — we ended up using Postgres LISTEN/NOTIFY to push invalidation events into a Redis pub/sub channel, which kept the cache consistent within about 10ms.",
  "I built that auth flow with NextAuth on the frontend and a custom JWT issuer on the backend. We used short-lived access tokens (15 min) with refresh rotation, and stored the refresh token in an httpOnly secure cookie scoped to the API subdomain. The biggest mistake we made early on was not implementing token theft detection — we added that later by tracking the last-used IP and family of refresh tokens.",
  "For the data pipeline, we went with Apache Beam on Dataflow for stream processing because we needed exactly-once semantics across the Kafka source and the BigQuery sink. The watermark handling was painful — late events would arrive 30+ minutes after the window had closed, so we configured allowed lateness and side outputs to capture them in a separate table for backfill.",
];

async function postChunk(interviewId: string, speaker: string, text: string, isFinal: boolean): Promise<void> {
  const url = `${TARGET}/api/interviews/${interviewId}/live-transcript`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Medha-Secret": SECRET,
      },
      body: JSON.stringify({
        speaker,
        text,
        timestamp: new Date().toISOString(),
        isFinal,
      }),
    });
    const tag = res.ok ? "✓" : `✗ ${res.status}`;
    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
    console.log(`  ${tag} [${speaker}] ${preview}`);
    if (!res.ok) {
      const body = await res.text();
      console.log(`     ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`  ✗ network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<number> {
  const interviewId = process.argv[2];
  if (!interviewId) {
    console.error("Usage: pnpm tsx scripts/simulate-transcript.ts <interviewId>");
    console.error("  The interviewId comes from the /interviews/<id>/live page URL.");
    return 1;
  }
  if (!SECRET) {
    console.error("❌ MEDHA_BOT_SHARED_SECRET is not set in .env.local — the live-transcript route will 503.");
    console.error("   Set both MEDHA_BOT_SHARED_SECRET and (optionally) MEDHA_BOT_BASE_URL.");
    return 1;
  }

  console.log("=".repeat(60));
  console.log("Simulate-transcript — POSTing fake chunks");
  console.log(`  target:       ${TARGET}`);
  console.log(`  interviewId:  ${interviewId}`);
  console.log(`  interval:     ${POLL_MS / 1000}s per chunk`);
  console.log(`  speakers:     "Sid Chatterjee" (interviewer), "Test Candidate" (candidate)`);
  console.log(`  Ctrl-C to stop`);
  console.log("=".repeat(60));

  let stop = false;
  process.on("SIGINT", () => {
    console.log("\nSIGINT — stopping after current chunk");
    stop = true;
  });

  let turn = 0;
  while (!stop) {
    const isCandidate = turn % 2 === 1;
    const speaker = isCandidate ? "Test Candidate" : "Sid Chatterjee";
    const text = isCandidate
      ? CANDIDATE_CHUNKS[Math.floor(turn / 2) % CANDIDATE_CHUNKS.length]
      : INTERVIEWER_CHUNKS[Math.floor(turn / 2) % INTERVIEWER_CHUNKS.length];

    await postChunk(interviewId, speaker, text, true);

    turn++;
    if (stop) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("\n✅ stopped cleanly");
  return 0;
}

main().then((c) => process.exit(c)).catch((err) => {
  console.error(err);
  process.exit(1);
});
