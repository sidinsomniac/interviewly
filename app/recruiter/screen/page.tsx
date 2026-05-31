// ============================================================
// Phase J — /recruiter/screen page.
//
// Server component wrapper that loads the role registry once at
// request time and hands it to the ScreenClient. Keeps the role
// list out of the client bundle.
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
    <main className="flex-1 px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200">
            🤖 Screening
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
            Screen a candidate
          </h1>
          <p className="text-base text-gray-500">
            Upload a resume + pick the role. Medha extracts the profile, scores against the
            competency rubric, and pre-fills the interview record on approval.
          </p>
        </div>
        <ScreenClient roles={roles} defaultRecruiterEmail={defaultRecruiterEmail} />
      </div>
    </main>
  );
}
