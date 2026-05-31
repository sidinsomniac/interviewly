import type { ReactNode } from "react";

/**
 * Phase O (2026-06-01) — 12-column bento grid wrapper.
 *
 * Children should be BentoCards with `span="col-span-N"` declarations
 * (e.g. col-span-12, col-span-8, col-span-4). Below the `sm` breakpoint
 * cards naturally stack via Tailwind's responsive col-span utilities.
 */
export function BentoGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`grid grid-cols-12 gap-4 ${className}`}>{children}</div>;
}
