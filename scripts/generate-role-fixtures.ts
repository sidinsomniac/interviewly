// ============================================================
// Sub-Phase D: generate fixture transcripts + chat histories for
// java-backend and python-backend via DeepSeek.
//
// Output per role (committed to data/fixtures/):
//   - transcript-<roleId>-good-hire.vtt  (~40 cues, two speakers,
//     ~30-45 min wall time, technical depth on ≥80% of the schema's
//     categories, modeled on transcript-react-good-hire.vtt)
//   - chat-history-<roleId>-good-hire.json (8 messages, identical
//     format to chat-history-react-good-hire.json)
//
// We ask DeepSeek for JSON (an array of cues + a chat array) and
// format the transcript ourselves into WebVTT with sequential
// timestamps — the LLM is unreliable at producing valid VTT
// directly.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getChatModel, structuredOutputMethod } from "../src/lib/llm";

import { javaBackendSchema } from "../src/lib/probeform/roles/java-backend";
import { pythonBackendSchema } from "../src/lib/probeform/roles/python-backend";
import type { RoleSchema } from "../src/lib/probeform/types";
import { flattenRows } from "../src/lib/probeform/types";

const FixtureSchema = z.object({
  cues: z.array(z.object({
    speaker: z.enum(["Sid Chatterjee", "Test Candidate"]),
    text: z.string().min(20),
    seconds: z.number().int().min(3).max(120),
  })).min(30).max(60),
  chat: z.array(z.object({
    speaker: z.enum(["Medha", "Test Candidate"]),
    contentType: z.enum(["html", "text"]),
    content: z.string().min(5),
    offsetMinutes: z.number().int().min(0).max(50),
  })).min(6).max(10),
});

type Fixture = z.infer<typeof FixtureSchema>;

const ROLES: RoleSchema[] = [javaBackendSchema, pythonBackendSchema];

function buildPrompt(schema: RoleSchema): { system: string; human: string } {
  const cats = schema.categories
    .map((c) => `- ${c.name}: ${c.rows.map((r) => r.competencyName).join("; ")}`)
    .join("\n");

  const system = `You produce realistic interview transcripts for the Publicis Sapient Experience Engineering hiring probe. Your output mirrors the style of a real 30-45 minute technical screen between a senior interviewer ("Sid Chatterjee") and an expert-level candidate ("Test Candidate").

Voice & quality bar:
- The candidate is a HIRE-WORTHY senior engineer with 5+ years in the stack. Their answers show real-world experience, mention specific libraries/tools/versions, trade-offs, war stories.
- The interviewer asks open-ended questions and natural follow-ups. Doesn't read from a script.
- Cover ≥80% of the role's competency categories. Spend longer on areas where the candidate has more depth.
- Length: roughly 30-45 cues total. Candidate cues are usually 40-120 seconds, interviewer cues 5-15 seconds. The whole transcript fits in ~30-45 minutes wall time.
- Mix in 1-2 honest gaps where the candidate admits something they haven't done much of — realism.
- No filler, no hedging cliches, no "great question". Sound like a real engineer.

Chat history rules (8 messages):
1. Bot welcome + AI consent (HTML, mentions transcription + 30-day retention)
2. Candidate acknowledgment (text, brief)
3. Bot posts Q1 (HTML, references actual question topic)
4. Bot posts Q2 (HTML)
5. Bot posts CoderPad exercise link (HTML, exercise name relevant to role)
6. Candidate "opening it" (text)
7. Candidate "submitted" or similar (text)
8. Bot posts final question (HTML)

Output ONLY a single JSON object — no prose, no markdown fences — with this exact shape:
{
  "cues": [
    { "speaker": "Sid Chatterjee" | "Test Candidate", "text": "...", "seconds": <int 3-120> },
    ...
  ],
  "chat": [
    { "speaker": "Medha" | "Test Candidate", "contentType": "html" | "text", "content": "...", "offsetMinutes": <int 0-50> },
    ...
  ]
}`;

  const human = `Role: ${schema.displayName} (${schema.roleId})

Topical scope (use these as the spine — go deep on 2-3 per category):
${cats}

Total competency rows in schema: ${flattenRows(schema).length}. Aim to surface candidate depth on roughly 22 of these — leaving ~5 untouched is realistic for any single interview.

Generate the fixture JSON now.`;

  return { system, human };
}

async function generateFixture(schema: RoleSchema): Promise<Fixture> {
  const { system, human } = buildPrompt(schema);
  const model = getChatModel(0.5);
  const method = structuredOutputMethod();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let raw: unknown;
      try {
        const structured = method
          ? model.withStructuredOutput(FixtureSchema, { method })
          : model.withStructuredOutput(FixtureSchema);
        raw = await structured.invoke([new SystemMessage(system), new HumanMessage(human)]);
      } catch {
        const response = await model.invoke([
          new SystemMessage(system + "\n\nReturn only valid JSON matching the shape above. No markdown fences."),
          new HumanMessage(human),
        ]);
        const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("no JSON in response");
        raw = JSON.parse(jsonMatch[0]);
      }
      return FixtureSchema.parse(raw);
    } catch (err) {
      console.warn(`  attempt ${attempt + 1} failed: ${String(err).slice(0, 250)}`);
      if (attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function renderVtt(cues: Fixture["cues"]): string {
  const lines: string[] = ["WEBVTT", ""];
  let clock = 2;
  cues.forEach((cue, i) => {
    const start = clock;
    const end = clock + cue.seconds;
    clock = end + 1; // 1-second gap
    lines.push(String(i + 1));
    lines.push(`${formatTimestamp(start)} --> ${formatTimestamp(end)}`);
    lines.push(`<v ${cue.speaker}>${cue.text}</v>`);
    lines.push("");
  });
  return lines.join("\n");
}

function renderChat(roleId: string, chat: Fixture["chat"]): string {
  const baseDate = new Date("2026-05-27T10:00:00.000Z");
  const messages = chat.map((m, i) => ({
    id: `msg-${pad(i + 1, 3)}`,
    createdDateTime: new Date(baseDate.getTime() + m.offsetMinutes * 60_000).toISOString(),
    from: { user: { displayName: m.speaker } },
    messageType: "message",
    body: { contentType: m.contentType, content: m.content },
  }));
  // roleId not strictly needed in the payload but keeps the script signature consistent
  void roleId;
  return JSON.stringify(messages, null, 2) + "\n";
}

async function main() {
  const outDir = path.resolve(process.cwd(), "data/fixtures");
  fs.mkdirSync(outDir, { recursive: true });

  for (const schema of ROLES) {
    console.log(`\n[${schema.roleId}] generating fixture…`);
    const fixture = await generateFixture(schema);
    const totalSeconds = fixture.cues.reduce((s, c) => s + c.seconds + 1, 0);
    const minutes = Math.round(totalSeconds / 60);
    console.log(`  ✓ ${fixture.cues.length} cues (~${minutes} min wall time), ${fixture.chat.length} chat messages`);

    const vttPath = path.join(outDir, `transcript-${schema.roleId}-good-hire.vtt`);
    fs.writeFileSync(vttPath, renderVtt(fixture.cues));
    console.log(`  ✓ wrote ${vttPath}`);

    const chatPath = path.join(outDir, `chat-history-${schema.roleId}-good-hire.json`);
    fs.writeFileSync(chatPath, renderChat(schema.roleId, fixture.chat));
    console.log(`  ✓ wrote ${chatPath}`);
  }
  console.log("\n✅ All 2 fixture transcripts + chat histories generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
