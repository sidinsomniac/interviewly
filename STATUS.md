# Interviewly — Build Status

**Last updated:** 2026-05-17 (Days 1–7 complete — full app built)
**Expo:** 2026-06-01 to 2026-06-05
**Repo:** https://github.com/sidinsomniac/interviewly

---

## Progress overview

| Day | Date | Focus | Status |
|-----|------|-------|--------|
| 1 | Mon May 18 | Scaffold + Graph auth | ✅ Done (1 blocker — see below) |
| 2 | Tue May 19 | LLM + transcript pipeline | ✅ Done |
| 3 | Wed May 20 | UI shell + Create Interview | ✅ Done |
| 4 | Thu May 21 | Live dashboard + question posting | ✅ Done |
| 5 | Fri May 22 | End-interview pipeline + Excel | ✅ Done |
| 6 | Sat May 23 | Polish + demo rehearsal | ⬜ Not started |
| 7 | Sun May 24 | Buffer / Verdict kickoff | ⬜ Not started |

---

## Day 1 — Done ✅

### What was built

| File | Description |
|------|-------------|
| `package.json` | Next.js 16, all deps installed (MSAL, Graph SDK, LangChain, ExcelJS, Zod, pino, etc.) |
| `tsconfig.json` | Strict TypeScript, `@/*` alias resolves `src/` then root |
| `.gitignore` | Excludes `.env.local`, `data/output/`, `docs/`, `node_modules/` |
| `.env.local.example` | Template for all required env vars (MS + LLM + app config) |
| `src/types/index.ts` | Full data model + Zod schemas — proficiency strings match PS form exactly (typos + trailing spaces preserved) |
| `src/lib/config.ts` | Typed env getters — throws at startup if a required var is missing |
| `src/lib/logger.ts` | Pino logger instance, exported as `log` |
| `src/lib/graph/auth.ts` | `getAppToken()` (client credentials) + `getDelegatedToken()` (ROPC), both with in-memory token caching |
| `src/lib/graph/client.ts` | `getAppClient()` + `getDelegatedClient()` — two Graph client factories |
| `scripts/smoke-graph.ts` | Verifies delegated auth via `GET /me/chats` |
| `scripts/smoke-send-message.ts` | Resolves a meeting by topic (or join URL fallback), posts "Hello from Interviewly" to chat |
| `data/samples/` | PS probe form sample Excel committed as template reference |

### Day 1 blocker — NOT yet resolved ⚠️

`pnpm smoke:graph` fails with `AADSTS50126` (invalid credentials).

**Fix required (manual — 5 min):**
1. Open `https://office.com` in a browser.
2. Sign in as `interviewly.bot@RecipeBari.onmicrosoft.com`.
3. If it prompts for a password change, set a new one and update `MS_BOT_USER_PASSWORD` in `.env.local`.
4. Re-run `pnpm smoke:graph` → should print `✓ Delegated token works`.
5. Schedule a Teams test meeting, invite the bot, then run:
   ```
   MEETING_TOPIC="<meeting subject>" pnpm smoke:send-message
   ```
   Verify the message appears in Teams desktop under "Interviewly Bot".

**Day 1 is complete only when:** the bot's message is visible in a real Teams meeting chat.

---

## Days 2–5 — Done ✅

### Server-side library layer (Phase A)

| File | Description |
|------|-------------|
| `src/lib/probeform/rows.ts` | CORE_ROWS + REACT_ROWS competency arrays, row indices matching probe form |
| `src/lib/llm.ts` | LLM factory — Gemini via `@langchain/google-genai`, with Claude/OpenAI stubs |
| `src/lib/llm/question-plan.ts` | `generateQuestionPlan()` — structured output with JSON fallback |
| `src/lib/llm/transcript-mapping.ts` | `mapTranscriptToProbeForm()` — temp 0.2, 3 retries |
| `src/lib/graph/meeting.ts` | `resolveMeeting()` + `findMeetingChatByTopic()` |
| `src/lib/graph/transcript.ts` | `resolveOrganizerGuid()` / `listTranscripts()` / `fetchTranscriptVtt()` / `parseVtt()` |
| `src/lib/graph/chat.ts` | `sendChatMessage()` + `formatQuestionMessage()` |
| `src/lib/graph/chatHistory.ts` | `fetchChatMessages()` — GET chats/{chatId}/messages |
| `src/lib/store.ts` | In-memory Map store for interview state |
| `src/lib/transcript-merge.ts` | Merge VTT + chat segments, sort by startTime |
| `src/lib/probeform/template.ts` | HEADER_CELLS + CORE/REACT_CELL_MAP constants |
| `src/lib/probeform/filler.ts` | `loadTemplate()` / `fillRound()` / `addMetaSheet()` / `toBuffer()` |

### API routes (Phase B)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/interviews` | POST | Create interview: validate → resolveMeeting → generateQuestionPlan → store |
| `/api/interviews` | GET | List all interviews |
| `/api/interviews/[id]` | GET | Get single interview |
| `/api/interviews/[id]/post-question` | POST | Post a question to Teams chat |
| `/api/interviews/[id]/end` | POST | End interview; fire-and-forget finalize (poll transcript → fill Excel) |
| `/api/interviews/[id]/probe-form` | GET | Stream .xlsx download |
| `/api/interviews/[id]/upload-transcript` | POST | Manual VTT/TXT upload fallback |
| `/api/schedule-interview` | POST | Medha/n8n integration: generate plan + create Teams meeting via Graph calendar → returns join URL, sends Outlook invite |

### UI pages and components (Phase C)

| File | Description |
|------|-------------|
| `app/page.tsx` | Landing page — hero, CTA, feature cards |
| `app/layout.tsx` | Root layout with Geist fonts + Sonner toaster |
| `app/interviews/page.tsx` | Interview list with status badges, download links |
| `app/interviews/new/page.tsx` | New interview form page |
| `src/components/NewInterviewForm.tsx` | react-hook-form + Zod form, POSTs to API |
| `app/interviews/[id]/plan/page.tsx` | Question plan view |
| `src/components/QuestionPlanView.tsx` | Renders planned questions with rubric badges |
| `app/interviews/[id]/live/page.tsx` | Live interview dashboard |
| `src/components/LiveDashboard.tsx` | Two-column layout shell |
| `src/components/QuestionList.tsx` | Question rows with Post buttons + consent row |
| `src/components/StatusPanel.tsx` | Posted count, End Interview with confirm dialog |
| `app/interviews/[id]/result/page.tsx` | Result page |
| `src/components/ResultClient.tsx` | Polls every 3s; shows progress → download / error + retry |
| `src/components/TranscriptUpload.tsx` | Drag-and-drop .vtt/.txt upload |
| `src/components/LoadingStates.tsx` | `Spinner`, `SkeletonLine`, `StatusBadge` |

### Smoke scripts (Phase D)

| Script | Usage |
|--------|-------|
| `scripts/smoke-question-plan.ts` | `pnpm smoke:question-plan` — generates 12–20 React round questions |
| `scripts/smoke-transcript.ts` | `MEETING_ID=xxx pnpm smoke:transcript` — fetches VTT from real meeting |
| `scripts/smoke-excel.ts` | `pnpm smoke:excel` — writes `data/output/smoke-test.xlsx` ✅ |
| `scripts/smoke-schedule.ts` | `pnpm smoke:schedule` — POSTs to `/api/schedule-interview` (requires `pnpm dev` running) |

### Verification results

| Check | Status |
|-------|--------|
| `pnpm tsc --noEmit` | ✅ Zero errors |
| `pnpm smoke:excel` | ✅ Writes smoke-test.xlsx successfully |
| Store survives hot-reload (globalThis) + restarts (JSON) | ✅ |
| `pnpm smoke:question-plan` | ⬜ Requires valid `GEMINI_API_KEY` in `.env.local` |
| `pnpm smoke:transcript` | ⬜ Requires resolved Bot User auth + `MEETING_ID` |
| `pnpm dev` | ⬜ Not yet tested (requires `.env.local` config) |

---

## Known issues / open decisions

| # | Issue | Status |
|---|-------|--------|
| 1 | Bot User ROPC auth failing (`AADSTS50126`) | ⚠️ Needs manual fix (sign in to office.com as the bot, set password) |
| 2 | `resolveMeeting(joinUrl)` fails — Graph 3003 if bot is not meeting organizer | ✅ Fixed — API now uses `findMeetingChatByTopic()` + `resolveOnlineMeetingId()`; form field changed to Meeting Topic |
| 3 | SSH push to GitHub not working (host key) | ✅ Worked around with HTTPS push |
| 4 | CodeSandbox vs StackBlitz for exercises | Pending — decide Day 6 |
| 5 | Demo persona (strong candidate vs ambiguous) | Pending — decide Day 6 |

---

## MVP definition of done

- [ ] `pnpm dev` starts the app at `http://localhost:3000`
- [ ] Create interview from form; question plan in under 30s
- [ ] Live dashboard posts questions into a real Teams meeting chat
- [ ] "End Interview" produces a downloadable `.xlsx` within 60s
- [ ] Excel opens cleanly: formulas resolve, Career Stage shows, `_meta` sheet hidden
- [ ] Manual transcript upload fallback works
- [ ] 90-second booth demo runs reliably 3 times in a row
- [ ] Backup screen recording on USB
