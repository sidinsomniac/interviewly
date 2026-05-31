"use client";

// ============================================================
// Phase J — Recruiter UI for resume upload + LLM screening + approve.
//
// Two stages:
//   1. Upload + screen: form posts to /api/screen, LLM runs (~10–15s),
//      report renders.
//   2. Approve: button posts to /api/screen/approve, dashboard redirect.
//
// State machine: "idle" → "screening" → "screened" → "approving" → "done".
// ============================================================
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/LoadingStates";
import type { CandidateProfile, ScreeningScore } from "@/types/index";

interface RoleOption {
  roleId: string;
  displayName: string;
}

type Stage = "idle" | "screening" | "screened" | "approving";

export function ScreenClient({
  roles,
  defaultRecruiterEmail,
}: {
  roles: RoleOption[];
  defaultRecruiterEmail?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [roleId, setRoleId] = useState<string>(roles[0]?.roleId ?? "");
  const [jdText, setJdText] = useState<string>("");
  const [recruiterEmail, setRecruiterEmail] = useState<string>(defaultRecruiterEmail ?? "");
  const [report, setReport] = useState<{
    profile: CandidateProfile;
    score: ScreeningScore;
    resumeText: string;
  } | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string>(() => {
    // Default to "now + 5 min" in local datetime-local format.
    const d = new Date(Date.now() + 5 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [conductMode, setConductMode] = useState<"manual" | "auto">("auto");

  const recruiterEmailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recruiterEmail.trim()),
    [recruiterEmail]
  );

  const canSubmit = useMemo(
    () => stage === "idle" && !!file && !!roleId && recruiterEmailValid,
    [stage, file, roleId, recruiterEmailValid]
  );

  async function handleScreen(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !roleId) return;
    setStage("screening");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roleId", roleId);
      if (jdText.trim()) fd.append("jdText", jdText.trim());
      const res = await fetch("/api/screen", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Screening failed");
      setReport({ profile: data.profile, score: data.score, resumeText: data.resumeText });
      setStage("screened");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  }

  async function handleApprove() {
    if (!report) return;
    setStage("approving");
    setError(null);
    try {
      const isoScheduledFor = new Date(scheduledFor).toISOString();
      const res = await fetch("/api/screen/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: report.profile,
          score: report.score,
          roleId,
          recruiterEmail: recruiterEmail.trim(),
          scheduledFor: isoScheduledFor,
          conductMode,
          jdText: jdText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Approve failed");
      toast.success("Interview scheduled — taking you to the dashboard");
      router.push(data.dashboardPath ?? data.dashboardUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("screened");
    }
  }

  // ── Sub-renders ───────────────────────────────────────────────

  const verdictColor =
    report?.score.verdict === "selected"
      ? "bg-green-100 text-green-800 ring-green-200"
      : report?.score.verdict === "rejected"
        ? "bg-red-100 text-red-800 ring-red-200"
        : "bg-amber-100 text-amber-800 ring-amber-200";

  const difficultyColor =
    report?.score.recommendedDifficultyBias === "easy"
      ? "bg-green-50 text-green-700"
      : report?.score.recommendedDifficultyBias === "medium"
        ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";

  return (
    <div className="space-y-6">
      {/* ── Upload form ──────────────────────────── */}
      <form
        onSubmit={handleScreen}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            Resume (.pdf or .docx)
          </label>
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={stage !== "idle"}
            className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
          />
          {file && (
            <p className="mt-1 text-xs text-gray-500">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1.5">Target role</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={stage !== "idle"}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          >
            {roles.map((r) => (
              <option key={r.roleId} value={r.roleId}>
                {r.displayName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            Your email (recruiter) <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={recruiterEmail}
            onChange={(e) => setRecruiterEmail(e.target.value)}
            disabled={stage !== "idle"}
            placeholder="you@company.com"
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            We&apos;ll send you the interview confirmation and the probe form when it&apos;s ready.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            Job description (optional)
          </label>
          <textarea
            rows={4}
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            disabled={stage !== "idle"}
            placeholder="Paste the JD here. Specific libraries / services will be woven into the question plan."
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-500">
            {stage === "screening" ? "Extracting profile + scoring against rubric…" : "Takes ~10–15 sec."}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {stage === "screening" ? <Spinner size="sm" /> : null}
            Screen Candidate
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </form>

      {/* ── Screening report ──────────────────────── */}
      {report && (
        <div className="space-y-4">
          {/* Verdict header */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{report.profile.candidateName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {report.profile.roleAppliedFor} ·{" "}
                  {report.profile.candidateRelevantYears} relevant /{" "}
                  {report.profile.candidateTotalYears} total years
                  {report.profile.candidateEmail && ` · ${report.profile.candidateEmail}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${verdictColor}`}
                >
                  {report.score.verdict[0].toUpperCase() + report.score.verdict.slice(1)} ·{" "}
                  {(report.score.confidence * 100).toFixed(0)}%
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColor}`}
                >
                  Difficulty: {report.score.recommendedDifficultyBias}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-700 leading-relaxed">{report.score.summary}</p>
          </div>

          {/* Strengths + Gaps grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <h3 className="text-sm font-semibold text-green-900 mb-2">Strengths</h3>
              <ul className="space-y-1.5">
                {report.score.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-green-900 flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <h3 className="text-sm font-semibold text-rose-900 mb-2">Gaps to probe</h3>
              <ul className="space-y-1.5">
                {report.score.gaps.map((g, i) => (
                  <li key={i} className="text-sm text-rose-900 flex gap-2">
                    <span className="text-rose-600">·</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Skills + Projects */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Key skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {report.profile.keySkills.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            {report.profile.notableProjects.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Notable projects</h3>
                <ul className="space-y-1">
                  {report.profile.notableProjects.map((p, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      • {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Approve controls */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Approve + schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Scheduled start
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  disabled={stage === "approving"}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Interview style
                </label>
                <select
                  value={conductMode}
                  onChange={(e) => setConductMode(e.target.value as "manual" | "auto")}
                  disabled={stage === "approving"}
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="auto">🤖 Auto (Medha runs it)</option>
                  <option value="manual">👤 Manual (recruiter drives)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled
                title="Email rejection wires up in Phase K"
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={stage === "approving"}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {stage === "approving" ? <Spinner size="sm" /> : null}
                Approve + Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
