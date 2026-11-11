import type { ReactNode } from "react";

export type Tone = "neutral" | "brand" | "success" | "warn" | "danger" | "waived";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-bg text-brand",
  success: "bg-success-bg text-success",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  // A waived check never looks like a pass: steel ink, dashed outline, no fill.
  waived: "border border-dashed border-muted text-muted",
};

/** Small rounded label, 11px mono, tint + matching ink. Never a solid fill. */
export function Pill({ tone = "neutral", dot = false, children, className = "" }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium ${TONES[tone]} ${className}`}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
