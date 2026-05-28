# Medha

**An AI-driven Teams interviewer bot that fills out the Publicis Sapient Experience Engineering hiring probe form.**

This is the planning home for **App 1** in the PS Expo: AI@Work 2026 submission. Medha conducts technical interviews via Microsoft Teams, generates probe-form-aligned questions from a JD, posts them in the meeting chat, captures the conversation via Teams' built-in transcription, and emits a filled `.xlsx` probe form for downstream evaluation by **Verdict** (App 2 — separate project).

> The repo folder, package name, and `_meta.app` stamp are still `interviewly` for backward compatibility with historical artefacts. The product name everywhere user-facing is **Medha**.

## Supported Roles

The probe-form pipeline is role-driven via a schema registry at [`src/lib/probeform/registry.ts`](src/lib/probeform/registry.ts). Each role bundles its competency rows, Excel template, sheet name, and (optionally) hands-on exercises into a single `RoleSchema`. Adding a role is a one-file change.

| `roleId` | Display name | Excel template | TEST_MODE fixture |
|---|---|---|---|
| `react` | React Engineer | `data/templates/react.xlsx` (sheet `2 - FW React`) | ✅ good-hire + no-hire |
| `java-backend` | Java Backend Engineer | `data/templates/java-backend.xlsx` (sheet `2 - Java Backend`) | ✅ good-hire |
| `python-backend` | Python Backend Engineer | `data/templates/python-backend.xlsx` (sheet `2 - Python Backend`) | ✅ good-hire |
| `node-backend` | Node.js Backend Engineer | `data/templates/node-backend.xlsx` (sheet `2 - Node Backend`) | — (schema-filler smoke only) |
| `frontend-generic` | Frontend Engineer (HTML/CSS/JS) | `data/templates/frontend-generic.xlsx` (sheet `1 - HTML, CSS & NFRs`) | — (schema-filler smoke only) |

### Adding a new role

1. Create `src/lib/probeform/roles/<roleId>.ts` exporting a `RoleSchema` (mirror [`roles/react.ts`](src/lib/probeform/roles/react.ts) — 3-5 categories, 4-8 competency rows each, mix of `architecture` / `development` rubric types).
2. Drop a `data/templates/<roleId>.xlsx` workbook with at least a `Data` sheet (rubric dropdowns) and the role's content sheet. The fastest path: copy `data/templates/react.xlsx` and run [`scripts/build-role-templates.ts`](scripts/build-role-templates.ts) with your new schema in the targets array.
3. Register the schema in [`src/lib/probeform/registry.ts`](src/lib/probeform/registry.ts).
4. (Optional) Add fixture data at `data/fixtures/transcript-<roleId>-good-hire.vtt` + matching `chat-history-<roleId>-good-hire.json` so the role can be exercised end-to-end under `MEDHA_TEST_MODE`. Use [`scripts/generate-role-fixtures.ts`](scripts/generate-role-fixtures.ts) to generate them via DeepSeek.

The UI dropdown ([`src/components/NewInterviewForm.tsx`](src/components/NewInterviewForm.tsx)) auto-populates from `listRoles()` — no UI changes needed.

### Smoke tests

| Command | Purpose |
|---|---|
| `pnpm smoke:probeform [ROLE_ID=…]` | Schema-driven filler regression. Defaults to `react`. |
| `pnpm smoke:end-interview-testmode [ROLE_ID=…]` | Full TEST_MODE pipeline (fixture → LLM → Excel). Requires a fixture for the role. |
| `pnpm smoke:all-roles` | Meta-runner: probeform smoke for every registered role, end-interview smoke for every role with a fixture. |
| `pnpm smoke:question-plan` | DeepSeek question-plan generation against the React schema. |
