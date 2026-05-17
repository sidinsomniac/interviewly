export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sz = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" }[size];
  return (
    <div
      className={`${sz} animate-spin rounded-full border-2 border-current border-t-transparent`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 h-4 ${className}`} />;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft:       "bg-gray-100 text-gray-700",
    in_progress: "bg-blue-100 text-blue-700",
    ended:       "bg-yellow-100 text-yellow-700",
    completed:   "bg-green-100 text-green-700",
    failed:      "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    draft: "Draft", in_progress: "In Progress", ended: "Processing",
    completed: "Completed", failed: "Failed",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}
