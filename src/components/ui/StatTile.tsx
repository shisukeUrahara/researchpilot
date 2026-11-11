import type { ReactNode } from "react";

/** One big light number with a small label under it. */
export function StatTile({ value, label, tone = "ink", className = "" }: { value: ReactNode; label: string; tone?: "ink" | "danger" | "success" | "brand"; className?: string }) {
  const color = { ink: "text-ink", danger: "text-danger", success: "text-success", brand: "text-brand" }[tone];
  return (
    <div className={`min-w-0 rounded-2xl border border-line bg-surface-2/60 p-4 ${className}`}>
      <p className={`display text-4xl ${color}`}>{value}</p>
      <p className="micro mt-2">{label}</p>
    </div>
  );
}
