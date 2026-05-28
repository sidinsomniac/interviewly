// ============================================================
// Sub-Phase D: meta-runner — exercises every registered role.
//
// For each registered role:
//   1. Always run smoke-probeform (schema-driven filler, no LLM).
//   2. If a transcript-<roleId>-good-hire.vtt fixture exists,
//      also run smoke-end-interview-testmode (full LLM pipeline).
//
// Reports per-role pass/fail at the end. Exits non-zero if any
// individual smoke failed.
// ============================================================
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { listRoles } from "../src/lib/probeform/registry";

interface RoleResult {
  roleId: string;
  probeform: "pass" | "fail";
  endInterview: "pass" | "fail" | "skipped";
}

function fixtureExists(roleId: string): boolean {
  const p = path.resolve(process.cwd(), `data/fixtures/transcript-${roleId}-good-hire.vtt`);
  return fs.existsSync(p);
}

function runSmoke(script: string, roleId: string): "pass" | "fail" {
  console.log(`\n  ▶ tsx ${script} (ROLE_ID=${roleId})`);
  const res = spawnSync("pnpm", ["tsx", script], {
    env: { ...process.env, ROLE_ID: roleId },
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
    encoding: "utf-8",
  });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  // Print last few lines so the user sees the verdict per role
  const tail = [stdout, stderr].join("\n").trim().split("\n").slice(-3).join("\n");
  console.log(tail.replace(/^/gm, "    "));
  return res.status === 0 ? "pass" : "fail";
}

async function main() {
  const roles = listRoles();
  console.log(`Found ${roles.length} registered roles: ${roles.map((r) => r.roleId).join(", ")}\n`);

  const results: RoleResult[] = [];
  for (const schema of roles) {
    console.log(`\n=== ${schema.roleId} (${schema.displayName}) ===`);

    const probeform = runSmoke("scripts/smoke-probeform.ts", schema.roleId);

    let endInterview: RoleResult["endInterview"] = "skipped";
    if (fixtureExists(schema.roleId)) {
      endInterview = runSmoke("scripts/smoke-end-interview-testmode.ts", schema.roleId);
    } else {
      console.log(`  ⏭  end-interview-testmode skipped — no fixture at data/fixtures/transcript-${schema.roleId}-good-hire.vtt`);
    }

    results.push({ roleId: schema.roleId, probeform, endInterview });
  }

  // Summary
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("Summary:");
  console.log("=".repeat(60));
  console.log("Role".padEnd(20) + "probeform".padEnd(14) + "end-interview");
  console.log("-".repeat(60));
  for (const r of results) {
    console.log(
      r.roleId.padEnd(20) +
      r.probeform.padEnd(14) +
      r.endInterview
    );
  }
  console.log("=".repeat(60));

  const anyFail = results.some((r) => r.probeform === "fail" || r.endInterview === "fail");
  if (anyFail) {
    console.error("\n❌ One or more roles failed.");
    process.exit(1);
  }
  console.log("\n✅ All roles passed (or skipped end-interview where no fixture).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
