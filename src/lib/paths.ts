// ============================================================
// Phase L (2026-05-31) — single source of truth for runtime write paths.
//
// All runtime writes (interviews.json, per-interview <id>.xlsx, smoke
// outputs) land under MEDHA_DATA_DIR. The default is %USERPROFILE%/.medha
// (i.e. os.homedir() + "/.medha") which is OUTSIDE the project root, so
// Next's dev file watcher can't see them under any circumstance.
//
// Read-only checked-in assets stay in the repo:
//   - data/templates/   — role .xlsx templates (filler.loadTemplate)
//   - data/fixtures/    — test VTTs + chat-history (loadFixtureBundle)
//
// Override the root by setting MEDHA_DATA_DIR. Subdirs are:
//   MEDHA_OUTPUT_DIR/   ← interviews.json, <id>.xlsx, smoke-*.xlsx
//   MEDHA_LOGS_DIR/     ← reserved for future file-sink logger
//
// Importing this module has a deliberate side effect: it mkdirSync's all
// three directories. recursive: true makes that idempotent. Importers
// that DON'T do filesystem work (e.g. next.config.ts) should inline the
// path resolution instead of importing this — see next.config.ts.
// ============================================================
import path from "path";
import os from "os";
import fs from "fs";

export const MEDHA_DATA_DIR =
  process.env.MEDHA_DATA_DIR ??
  path.join(os.homedir(), ".medha");

export const MEDHA_OUTPUT_DIR = path.join(MEDHA_DATA_DIR, "output");
export const MEDHA_LOGS_DIR = path.join(MEDHA_DATA_DIR, "logs");

// Ensure dirs exist at import time (cheap, idempotent across hot reloads).
for (const dir of [MEDHA_DATA_DIR, MEDHA_OUTPUT_DIR, MEDHA_LOGS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
