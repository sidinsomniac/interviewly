import fs from "fs";
import path from "path";
import type { InterviewMetadata } from "@/types/index";

const PERSIST_PATH = path.resolve(process.cwd(), "data/output/interviews.json");

export function persistInterviews(map: Map<string, InterviewMetadata>): void {
  try {
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(Array.from(map.values()), null, 2), "utf-8");
  } catch {
    // Non-fatal — persist failure must not crash the request
  }
}

export function loadInterviews(): Map<string, InterviewMetadata> {
  const map = new Map<string, InterviewMetadata>();
  try {
    if (!fs.existsSync(PERSIST_PATH)) return map;
    const arr = JSON.parse(fs.readFileSync(PERSIST_PATH, "utf-8")) as InterviewMetadata[];
    for (const iv of arr) map.set(iv.id, iv);
  } catch {
    // Non-fatal — corrupt file returns empty map
  }
  return map;
}
