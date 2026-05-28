// ============================================================
// Role registry — single source of truth mapping `roleId` → RoleSchema.
//
// Adding a role in Sub-Phase D:
//   1. Drop a new file under `src/lib/probeform/roles/<role>.ts`
//      exporting a const schema: RoleSchema.
//   2. Drop the matching Excel template at `data/templates/<role>.xlsx`.
//   3. Import and register it in ROLE_REGISTRY below.
// ============================================================

import type { RoleSchema } from "./types";
import { reactSchema } from "./roles/react";
import { javaBackendSchema } from "./roles/java-backend";
import { pythonBackendSchema } from "./roles/python-backend";
import { nodeBackendSchema } from "./roles/node-backend";
import { frontendGenericSchema } from "./roles/frontend-generic";

export const ROLE_REGISTRY: Record<string, RoleSchema> = {
  [reactSchema.roleId]:           reactSchema,
  [javaBackendSchema.roleId]:     javaBackendSchema,
  [pythonBackendSchema.roleId]:   pythonBackendSchema,
  [nodeBackendSchema.roleId]:     nodeBackendSchema,
  [frontendGenericSchema.roleId]: frontendGenericSchema,
};

export function getRoleSchema(roleId: string): RoleSchema | undefined {
  return ROLE_REGISTRY[roleId];
}

export function listRoles(): RoleSchema[] {
  return Object.values(ROLE_REGISTRY);
}

/**
 * Best-effort job-title → roleId detection for the Medha/n8n scheduling
 * integration where the caller doesn't know our internal roleIds. Looks
 * for each registered schema's roleId or displayName word in the title.
 * Falls back to the first registered role (Phase 1.5: only "react").
 */
export function detectRoleId(jobTitle: string): string {
  const t = jobTitle.toLowerCase();
  for (const schema of listRoles()) {
    if (t.includes(schema.roleId)) return schema.roleId;
    if (t.includes(schema.displayName.toLowerCase().split(" ")[0])) return schema.roleId;
  }
  // Sensible default while the registry is small. When Sub-Phase D adds
  // more roles this should probably throw instead.
  return listRoles()[0]?.roleId ?? "react";
}
