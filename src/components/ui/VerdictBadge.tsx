/**
 * Phase O (2026-06-01) — Semantic verdict / status pill.
 *
 * Drives off the existing union literals used across
 * ScreeningScore.verdict ("selected"|"borderline"|"rejected") and
 * InterviewMetadata.status ("draft"|"scheduled"|"in_progress"|
 * "ended"|"completed"|"failed"). Replaces the prior inline
 * `bg-green-100 text-green-800 ring-green-200`-style chains with
 * Teams-palette tokens.
 */
type Verdict =
  | "selected"
  | "borderline"
  | "rejected"
  | "completed"
  | "failed"
  | "ended"
  | "completing"
  | "scheduled"
  | "in_progress"
  | "draft";

const STYLES: Record<
  Verdict,
  { bg: string; text: string; ring: string; label: string }
> = {
  selected:    { bg: "bg-teams-success/10", text: "text-teams-success", ring: "ring-teams-success/30", label: "Selected" },
  borderline:  { bg: "bg-teams-warning/10", text: "text-teams-warning", ring: "ring-teams-warning/30", label: "Borderline" },
  rejected:    { bg: "bg-teams-error/10",   text: "text-teams-error",   ring: "ring-teams-error/30",   label: "Rejected" },
  completed:   { bg: "bg-teams-success/10", text: "text-teams-success", ring: "ring-teams-success/30", label: "Completed" },
  failed:      { bg: "bg-teams-error/10",   text: "text-teams-error",   ring: "ring-teams-error/30",   label: "Failed" },
  ended:       { bg: "bg-teams-warning/10", text: "text-teams-warning", ring: "ring-teams-warning/30", label: "Ended" },
  completing:  { bg: "bg-teams-primary/10", text: "text-teams-primary", ring: "ring-teams-primary/30", label: "Finalizing" },
  scheduled:   { bg: "bg-teams-primary/10", text: "text-teams-primary", ring: "ring-teams-primary/30", label: "Scheduled" },
  in_progress: { bg: "bg-teams-primary/10", text: "text-teams-primary", ring: "ring-teams-primary/30", label: "In progress" },
  draft:       { bg: "bg-black/5",          text: "text-[color:var(--medha-text-secondary)]", ring: "ring-black/10", label: "Draft" },
};

export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: Verdict;
  size?: "sm" | "md" | "lg";
}) {
  const style = STYLES[verdict];
  const sizing =
    size === "sm"
      ? "px-2 py-0.5 text-xs"
      : size === "lg"
        ? "px-4 py-1.5 text-base"
        : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full ring-1 ${style.bg} ${style.text} ${style.ring} ${sizing}`}
    >
      {style.label}
    </span>
  );
}
