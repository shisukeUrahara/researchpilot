const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** A thin track with the 95% Wilson range as a band and the point as a tick. All values 0..1. */
export function RangeBar({ lo, hi, point, label, barClass }: { lo: number; hi: number; point: number; label: string; barClass: string }) {
  return (
    <span role="img" aria-label={`${label}: ${pct(point)}, 95% range ${pct(lo)} to ${pct(hi)}`} className="relative block h-1.5 w-full rounded-full bg-surface-2">
      <span className={`absolute inset-y-0 rounded-full opacity-60 ${barClass}`} style={{ left: `${clamp(lo) * 100}%`, width: `${(clamp(hi) - clamp(lo)) * 100}%` }} />
      <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `calc(${clamp(point) * 100}% - 1px)` }} />
    </span>
  );
}
