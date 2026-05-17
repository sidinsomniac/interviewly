// Smoke test: verify delegated (ROPC) Graph auth works.
// Calls GET /me/chats as the Bot User and logs the result.
// Usage: pnpm smoke:graph

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
import "isomorphic-fetch";
import { getDelegatedClient } from "../src/lib/graph/client";

async function main() {
  console.log("Testing delegated Graph auth (ROPC)...");
  const client = await getDelegatedClient();
  const result = await client.api("/me/chats").get();
  const chats: unknown[] = result.value ?? [];
  console.log(`✓ Delegated token works. Bot User has ${chats.length} chat(s).`);
  if (chats.length > 0) {
    console.log("First chat:", JSON.stringify(chats[0], null, 2));
  }
}

main().catch((err) => {
  console.error("✗ smoke-graph failed:", err.message ?? err);
  process.exit(1);
});
