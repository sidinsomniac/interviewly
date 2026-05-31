// ============================================================
// Phase J — /recruiter/screen page.
//
// Server component wrapper that loads the role registry once at
// request time and hands it to the ScreenClient. Keeps the role
// list out of the client bundle.
//
// Phase O (2026-06-01) — header trimmed. Hero + tagline now live
// inside the bento layout in ScreenClient so the page swaps between
// pre-screen and post-screen states without a duplicated frame.
// ============================================================
import { listRoles } from "@/lib/probeform/registry";
import { config } from "@/lib/config";
import { ScreenClient } from "@/components/ScreenClient";

export default function ScreenPage() {
  const roles = listRoles().map((r) => ({ roleId: r.roleId, displayName: r.displayName }));
  // Phase K: pre-fill the recruiter-email input with the configured organizer
  // (the recruiter doing the screening is, in most demos, the same identity
  // that owns the Teams meeting). Recruiter can edit before submitting.
  const defaultRecruiterEmail = config.ms.organizerEmail ?? "";
  return (
    <main className="px-6 py-10 max-w-4xl mx-auto">
      <ScreenClient roles={roles} defaultRecruiterEmail={defaultRecruiterEmail} />
    </main>
  );
}
