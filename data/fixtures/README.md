# TEST_MODE fixtures

These files back `MEDHA_TEST_MODE=true`. When the flag is on, `/api/interviews/[id]/end` reads from here instead of polling Microsoft Graph for the real transcript and chat history.

## Filename pattern

```
transcript-<role>-<outcome>.vtt          # required
chat-history-<role>-<outcome>.json       # optional
coderpad-submission-<role>-<outcome>.json # optional
```

- `<role>` defaults to `MEDHA_TEST_FIXTURE_ROLE` (env), and is overridden per-interview by the interview's round (`react` / `core` / future role ids).
- `<outcome>` defaults to `MEDHA_TEST_FIXTURE_OUTCOME` (env). Today: `good-hire` or `no-hire`.

## Current set

| Role  | Outcome    | Transcript | Chat | CoderPad |
|-------|------------|------------|------|----------|
| react | good-hire  | ✅ rich, ~17 min                                 | ✅   | ✅ shopping-cart |
| react | no-hire    | ✅ rich, ~9 min, deliberately weak               | ✅   | —        |
| core  | good-hire  | ✅ rich, HTML/CSS/JS/TS/perf/a11y, ~11 min       | ✅   | —        |

## VTT format

Real Teams transcripts use the `<v Speaker Name>text</v>` cue tag. Fixtures follow the same format so the existing parser (`src/lib/graph/transcript.ts` → `parseVtt`) works unchanged.

## Adding a new fixture

1. Drop a new `.vtt` (and optionally `.json` chat / coderpad files) in this directory.
2. Set `MEDHA_TEST_FIXTURE_ROLE` + `MEDHA_TEST_FIXTURE_OUTCOME` to match, or rely on the round-to-role mapping.
3. Restart `pnpm dev`, create an interview with the matching round, click End.

The pipeline emits a warning log at end-of-interview that names the fixture loaded (`role`, `outcome`), and the generated probe form's hidden `_meta` sheet stamps `test_mode=true` plus `fixture_id=<role>/<outcome>` so a TEST_MODE artefact is never confused for a real one.
