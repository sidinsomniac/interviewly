// ============================================================
// Phase L (2026-05-31) — single source of truth for runtime write paths.
// Phase M (2026-05-31) — MEDHA_OUTPUT_DIR removed; .xlsx probe forms no
// longer persist to disk (they stream straight into Graph sendMail
// attachments). interviews.json now lives at MEDHA_DATA_DIR/interviews.json,
// one level up from the prior MEDHA_OUTPUT_DIR location.
//
// All runtime writes (interviews.json) land under MEDHA_DATA_DIR. The
// default is %USERPROFILE%/.medha (i.e. os.homedir() + "/.medha") which
// is OUTSIDE the project root, so Next's dev file watcher can't see them.
//
// Read-only checked-in assets stay in the repo:
//   - data/templates/   — role .xlsx templates (filler.loadTemplate)
//   - data/fixtures/    — test VTTs + chat-history (loadFixtureBundle)
//
// Override the root by setting MEDHA_DATA_DIR. Subdirs are:
//   MEDHA_DATA_DIR/interviews.json  ← in-memory store persist file
//   MEDHA_LOGS_DIR/                 ← reserved for future file-sink logger
// Smoke scripts write to MEDHA_DATA_DIR/smoke-output/ (each script
// mkdirs that subdir explicitly — paths.ts no longer pre-creates it).
//
// Importing this module has a deliberate side effect: it mkdirSync's the
// data + logs directories. recursive: true makes that idempotent.
// Importers that DON'T do filesystem work (e.g. next.config.ts) should
// inline the path resolution instead of importing this.
// ============================================================
import path from "path";
import os from "os";
import fs from "fs";

export const MEDHA_DATA_DIR =
  process.env.MEDHA_DATA_DIR ??
  path.join(os.homedir(), ".medha");

export const MEDHA_LOGS_DIR = path.join(MEDHA_DATA_DIR, "logs");

// Ensure dirs exist at import time (cheap, idempotent across hot reloads).
for (const dir of [MEDHA_DATA_DIR, MEDHA_LOGS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
