import type { ReactNode } from "react";

/**
 * Phase O (2026-06-01) — Glass card primitive for the bento grid.
 *
 * Wraps the `.glass` (or `.glass-hero`) utility from globals.css with
 * a 12-col span prop, an optional left-edge semantic accent stripe,
 * and an optional uppercase tracking-tight title. Hover lift is built
 * in (subtle 0.5% scale + shadow ramp) so booth visitors get a hint
 * that the card is interactive.
 *
 * No clsx — template-string composition matches the codebase house
 * style. If the prop matrix grows, swap to clsx in one line.
 */
export interface BentoCardProps {
  children: ReactNode;
  /** Tailwind class string for col-span / row-span. Defaults to col-span-12. */
  span?: string;
  /** Use the higher-presence glass-hero variant (taller shadow, accent ring). */
  hero?: boolean;
  /** Optional left-edge vertical accent stripe (semantic). */
  accent?: "success" | "error" | "warning";
  /** Optional title rendered as small uppercase tracking heading inside the card. */
  title?: string;
  /** Extra Tailwind classes — extend the surface utility, don't override it. */
  className?: string;
}

export function BentoCard({
  children,
  span = "col-span-12",
  hero = false,
  accent,
  title,
  className = "",
}: BentoCardProps) {
  const surface = hero ? "glass-hero" : "glass";
  const accentBar =
    accent === "success"
      ? "before:bg-teams-success"
      : accent === "error"
        ? "before:bg-teams-error"
        : accent === "warning"
          ? "before:bg-teams-warning"
          : "";
  const accentLayout = accent
    ? "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-1 before:rounded-r-full before:content-['']"
    : "";
  return (
    <div
      className={`relative ${span} ${surface} p-6 transition-all duration-200 hover:shadow-xl hover:scale-[1.005] ${accentLayout} ${accentBar} ${className}`}
    >
      {title && (
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--medha-text-secondary)]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
