import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { resolveOrganizerGuid, listTranscripts, fetchTranscriptVtt, parseVtt } from "../src/lib/graph/transcript";
import { config } from "../src/lib/config";

const meetingId = process.env.MEETING_ID;
if (!meetingId) {
  console.error("MEETING_ID env var is required. Set it in .env.local or pass inline: MEETING_ID=xxx pnpm smoke:transcript");
  process.exit(1);
}

async function main() {
  console.log(`Resolving organizer GUID for ${config.ms.organizerEmail}…`);
  const guid = await resolveOrganizerGuid(config.ms.organizerEmail);
  console.log(`Organizer GUID: ${guid}\n`);

  console.log(`Listing transcripts for meeting ${meetingId}…`);
  const transcripts = await listTranscripts(guid, meetingId!);
  console.log(`Found ${transcripts.length} transcript(s):`);
  transcripts.forEach((t, i) => console.log(`  ${i + 1}. ${t.id}`));

  if (transcripts.length === 0) {
    console.log("\nNo transcripts available yet. Try after the meeting has ended.");
    return;
  }

  console.log(`\nFetching VTT for transcript ${transcripts[0].id}…`);
  const vtt = await fetchTranscriptVtt(guid, meetingId!, transcripts[0].id);
  const segments = parseVtt(vtt);
  console.log(`Parsed ${segments.length} segments. First 5:\n`);
  segments.slice(0, 5).forEach((s) => {
    console.log(`  [${s.startTime}] ${s.speaker}: ${s.text}`);
  });

  console.log("\n✅ Transcript smoke test passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
