# Interviewly — Build Status

**Last updated:** 2026-05-17 (Day 1 complete)
**Expo:** 2026-06-01 to 2026-06-05
**Repo:** https://github.com/sidinsomniac/interviewly

---

## Progress overview

| Day | Date | Focus | Status |
|-----|------|-------|--------|
| 1 | Mon May 18 | Scaffold + Graph auth | ✅ Done (1 blocker — see below) |
| 2 | Tue May 19 | LLM + transcript pipeline | ⬜ Not started |
| 3 | Wed May 20 | UI shell + Create Interview | ⬜ Not started |
| 4 | Thu May 21 | Live dashboard + question posting | ⬜ Not started |
| 5 | Fri May 22 | End-interview pipeline + Excel | ⬜ Not started |
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
| `scripts/smoke-send-message.ts` | Resolves a meeting by join URL, posts "Hello from Interviewly" to chat |
| `data/samples/` | PS probe form sample Excel committed as template reference |

### Day 1 blocker — NOT yet resolved ⚠️

`pnpm smoke:graph` fails with `AADSTS50126` (invalid credentials).

**Fix required (manual — 5 min):**
1. Open `https://office.com` in a browser.
2. Sign in as `interviewly.bot@RecipeBari.onmicrosoft.com`.
3. If it prompts for a password change, set a new one and update `MS_BOT_USER_PASSWORD` in `.env.local`.
4. Re-run `pnpm smoke:graph` → should print `✓ Delegated token works`.
5. Schedule a Teams test meeting with the bot as attendee, then run:
   ```
   MEETING_JOIN_URL="<join-url>" pnpm smoke:send-message
   ```
   Verify the message appears in Teams desktop under "Interviewly Bot".

**Day 1 is complete only when:** the bot's message is visible in a real Teams meeting chat.

---

## Day 2 — Not started ⬜

**Goal:** generate a question plan from a JD + fetch a real Teams transcript.

Files to build:
- `src/lib/probeform/rows.ts` — CORE_ROWS and REACT_ROWS competency arrays
- `src/lib/llm.ts` — LLM provider factory (Gemini / Claude / OpenAI)
- `src/lib/llm/question-plan.ts` — `generateQuestionPlan()`
- `src/lib/graph/meeting.ts` — `resolveMeeting(joinUrl)`
- `src/lib/graph/transcript.ts` — VTT fetcher + parser
- `scripts/smoke-question-plan.ts`
- `scripts/smoke-transcript.ts`

**Checkpoint:** `pnpm smoke:question-plan` prints a valid 12–20 question plan. `pnpm smoke:transcript` prints transcript segments from a real meeting.

---

## Known issues / open decisions

| # | Issue | Status |
|---|-------|--------|
| 1 | Bot User ROPC auth failing (`AADSTS50126`) | ⚠️ Needs manual fix (see Day 1 blocker above) |
| 2 | SSH push to GitHub not working (host key) | ✅ Worked around with HTTPS push |
| 3 | CodeSandbox vs StackBlitz for exercises | Pending — decide on Day 4 |
| 4 | Demo persona (strong candidate vs ambiguous) | Pending — decide on Day 6 |

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
