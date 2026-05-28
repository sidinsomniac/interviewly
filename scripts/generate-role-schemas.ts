// ============================================================
// Sub-Phase D: generate four role schemas via DeepSeek.
//
// For each of (java-backend, python-backend, node-backend,
// frontend-generic) this script asks DeepSeek to produce a
// RoleSchema matching the structural depth of the React schema:
//   - 3-5 categories named after the stack's natural breakdown
//   - 4-8 competency rows per category, with role-specific
//     rowIndex values inside the 14-43 range (blank-row separators
//     between categories preserved, mirroring the template)
//   - A mix of `architecture` vs `development` rubric types
//   - 3-5 ExerciseDef entries with realistic problem titles
//
// The header block is identical for every role (corrected addresses
// from Sub-Phase D verify pass: C4/C5/C6/C7/C8/F4/F5/I4/I5/I6/I7/
// D9/C10/C11) so we don't ask the LLM for it — we inject it.
//
// Output: a TypeScript file per role at src/lib/probeform/roles/<id>.ts.
// Run once; the resulting files are committed verbatim.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getChatModel, structuredOutputMethod } from "../src/lib/llm";

const RoleSchemaContentSchema = z.object({
  categories: z.array(z.object({
    name: z.string().min(1),
    rows: z.array(z.object({
      rowIndex: z.number().int().min(14).max(43),
      competencyName: z.string().min(8),
      rubricType: z.enum(["architecture", "development"]),
    })).min(4).max(10),
  })).min(3).max(5),
  exercises: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(3),
    language: z.string().min(1),
    starterUrl: z.string().nullable().optional(),
  })).min(3).max(5),
});

type GeneratedContent = z.infer<typeof RoleSchemaContentSchema>;

interface RoleSpec {
  roleId: string;
  displayName: string;
  sheetName: string;
  stackBlurb: string;
}

const ROLES: RoleSpec[] = [
  {
    roleId: "java-backend",
    displayName: "Java Backend Engineer",
    sheetName: "2 - Java Backend",
    stackBlurb: "Java 17+/21, Spring Boot 3, Spring Data JPA / Hibernate, RESTful APIs, Maven/Gradle, JUnit 5 / Mockito, observability (Micrometer/Prometheus), containerization (Docker), reactive (Project Reactor / WebFlux). Probe for: Spring Boot autoconfiguration, transaction management, JPA N+1 + fetch strategies, concurrency primitives, JVM tuning, REST design, security (Spring Security / OAuth2), system design at scale.",
  },
  {
    roleId: "python-backend",
    displayName: "Python Backend Engineer",
    sheetName: "2 - Python Backend",
    stackBlurb: "Python 3.11+/3.12, Django 5 or FastAPI, SQLAlchemy 2.x / Django ORM, Celery + Redis, pytest, async (asyncio / async-django), Pydantic, type hints (mypy), packaging (poetry/uv). Probe for: ORM query optimization, GIL implications, async/await pitfalls, dependency injection patterns, pytest fixtures + parametrize, type safety beyond duck typing, deployment (Gunicorn + Uvicorn workers), task queues.",
  },
  {
    roleId: "node-backend",
    displayName: "Node.js Backend Engineer",
    sheetName: "2 - Node Backend",
    stackBlurb: "Node 20+/22 LTS, TypeScript 5.x, Fastify or NestJS or Express, Prisma or TypeORM, BullMQ + Redis, Vitest / Jest, OpenTelemetry, ESM vs CJS, streams, worker_threads, Docker. Probe for: event-loop awareness, backpressure on streams, error handling in async, validation with Zod, microservice patterns, GraphQL servers with DataLoader, observability, package management (pnpm/npm/yarn), Node 20 specifics (test runner, fetch).",
  },
  {
    roleId: "frontend-generic",
    displayName: "Frontend Engineer (HTML/CSS/JS)",
    sheetName: "1 - HTML, CSS & NFRs",
    stackBlurb: "Vanilla web platform — HTML5 semantics + accessibility, CSS3 (grid, flex, container queries, custom properties, layers), modern JavaScript (ES2023, modules, async iterators), TypeScript fundamentals, browser internals (CSSOM, rendering pipeline, event loop), web performance (Core Web Vitals), PWA + service workers, build tools (Vite). Probe for: a11y depth (ARIA, focus management, screen-reader testing), CSS architecture (BEM/CUBE/CSS layers), responsive design strategies, JS asynchrony, polyfills + browser support, SEO + meta tags, security (CSP, CSRF, XSS), forms + validation, Core Web Vitals + optimization techniques.",
  },
];

const HEADER_BLOCK = `  // Corrected mappings from Sub-Phase D verify pass (2026-05-27).
  // Cell addresses match data/templates/<roleId>.xlsx structurally.
  header: [
    { field: "candidateName",            cell: "C4",  required: true },
    { field: "totalYears",               cell: "C5",  required: true },
    { field: "relevantYears",            cell: "C6",  required: true },
    { field: "interviewedFor",           cell: "C7",  required: true },
    { field: "evaluationDate",           cell: "C8",  required: true },
    { field: "interviewerName",          cell: "F4",  required: true },
    { field: "interviewerOid",           cell: "F5",  required: true },
    { field: "interviewOutcome",         cell: "I4",  required: true },
    { field: "selectedForLevel",         cell: "I5" },
    { field: "rejectionReason",          cell: "I6" },
    { field: "sectionsToBeTrainedOn",    cell: "I7" },
    { field: "domainFeedbackSummary",    cell: "D9",  required: true },
    { field: "teachableSkillGapDetails", cell: "C10" },
    { field: "handsOnExerciseId",        cell: "C11" },
  ],`;

const SYSTEM_PROMPT = `You design hiring competency rubrics for a senior engineering recruiting platform at Publicis Sapient. You produce probe-form schemas that mirror the depth of the existing React Engineer schema: each competency row is named with high specificity so a senior interviewer reads it and knows the exact follow-up to ask.

Rules:
- Categories: 3 to 5 distinct buckets covering the stack's natural breakdown. Name them with the stack's own vocabulary, not generic labels.
- Rows per category: 4 to 8.
- rowIndex assignment: start at 14, leave blank rows between categories. Use rows 14-20 for category 1; row 21 is blank; rows 22-29 for category 2; row 30 blank; rows 31-36 for category 3; row 37 blank; rows 38-43 for categories 4/5. Up to row 43 max. Skip blank rows in the output.
- rubricType: "architecture" for rows about design / tradeoffs / system-level decisions; "development" for hands-on coding / library APIs / specific implementation knowledge.
- competencyName: specific enough that an interviewer can ask one question and know whether the candidate can go deep. Examples of GOOD: "Spring Boot — @Transactional propagation + isolation", "asyncio — task vs gather vs as_completed". Examples of BAD: "Spring knowledge", "Python async".
- Exercises: 3 to 5 hands-on coding problem titles realistic for a 30-min screen. Use stack-native exercise ids (kebab-case). Examples: "rate-limiter", "user-service-crud", "stream-aggregator".

Output ONLY a single JSON object with this exact shape (no prose, no markdown fences):
{
  "categories": [
    { "name": "...", "rows": [ { "rowIndex": 14, "competencyName": "...", "rubricType": "development" }, ... ] },
    ...
  ],
  "exercises": [
    { "id": "kebab-case-id", "title": "Human readable", "language": "java" | "python" | "javascript" | "typescript", "starterUrl": null }
  ]
}`;

async function generateRole(role: RoleSpec): Promise<GeneratedContent> {
  const humanPrompt = `Generate the RoleSchema content for the **${role.displayName}** role (roleId="${role.roleId}").

Stack scope:
${role.stackBlurb}

Generate the JSON now. Aim for 25-30 total competency rows across all categories.`;

  const model = getChatModel(0.4);
  const method = structuredOutputMethod();
  let parsed: GeneratedContent | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let raw: unknown;
      try {
        const structured = method
          ? model.withStructuredOutput(RoleSchemaContentSchema, { method })
          : model.withStructuredOutput(RoleSchemaContentSchema);
        raw = await structured.invoke([
          new SystemMessage(SYSTEM_PROMPT),
          new HumanMessage(humanPrompt),
        ]);
      } catch {
        const response = await model.invoke([
          new SystemMessage(SYSTEM_PROMPT + "\n\nReturn only valid JSON matching the shape above."),
          new HumanMessage(humanPrompt),
        ]);
        const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("no JSON in response");
        raw = JSON.parse(jsonMatch[0]);
      }
      parsed = RoleSchemaContentSchema.parse(raw);
      return parsed;
    } catch (err) {
      console.warn(`  attempt ${attempt + 1} failed: ${String(err).slice(0, 200)}`);
      if (attempt === 2) throw err;
    }
  }
  throw new Error("unreachable");
}

function renderSchemaFile(role: RoleSpec, content: GeneratedContent): string {
  const tsTemplate = role.roleId === "frontend-generic"
    ? "data/templates/frontend-generic.xlsx"
    : `data/templates/${role.roleId}.xlsx`;

  const catBlock = content.categories
    .map((cat) => {
      const rows = cat.rows
        .map((r) => `        { rowIndex: ${r.rowIndex}, competencyName: ${JSON.stringify(r.competencyName)}, rubricType: ${JSON.stringify(r.rubricType)} },`)
        .join("\n");
      return `    {\n      name: ${JSON.stringify(cat.name)},\n      rows: [\n${rows}\n      ],\n    },`;
    })
    .join("\n");

  const exBlock = content.exercises
    .map((e) => `    { id: ${JSON.stringify(e.id)}, title: ${JSON.stringify(e.title)}, language: ${JSON.stringify(e.language)} },`)
    .join("\n");

  return `// ============================================================
// ${role.displayName} role schema.
//
// Sub-Phase D: generated via scripts/generate-role-schemas.ts on
// 2026-05-27 against DeepSeek V4-Flash. Categories + competency rows
// + exercises drafted by the LLM; header block injected to match the
// universal Excel cell layout (verified in Sub-Phase D).
//
// Excel template: ${tsTemplate}
// Sheet:          "${role.sheetName}"
// ============================================================

import type { RoleSchema } from "../types";

export const ${role.roleId.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Schema: RoleSchema = {
  roleId: ${JSON.stringify(role.roleId)},
  displayName: ${JSON.stringify(role.displayName)},
  excelTemplate: ${JSON.stringify(tsTemplate)},
  sheetName: ${JSON.stringify(role.sheetName)},

${HEADER_BLOCK}

  categories: [
${catBlock}
  ],

  exercises: [
${exBlock}
  ],
};
`;
}

async function main() {
  const outDir = path.resolve(process.cwd(), "src/lib/probeform/roles");
  fs.mkdirSync(outDir, { recursive: true });

  for (const role of ROLES) {
    console.log(`\n[${role.roleId}] generating…`);
    const content = await generateRole(role);
    const rowCount = content.categories.reduce((s, c) => s + c.rows.length, 0);
    console.log(`  ✓ ${content.categories.length} categories, ${rowCount} rows, ${content.exercises.length} exercises`);
    for (const cat of content.categories) {
      console.log(`    - ${cat.name}: rows ${cat.rows.map((r) => r.rowIndex).join(",")}`);
    }

    const filePath = path.join(outDir, `${role.roleId}.ts`);
    fs.writeFileSync(filePath, renderSchemaFile(role, content));
    console.log(`  ✓ wrote ${filePath}`);
  }
  console.log("\n✅ All 4 role schemas generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
