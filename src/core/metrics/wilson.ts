/**
 * Wilson score interval for k successes in n trials (95% by default). Honest
 * for small n and for rates near 0 or 1, unlike the normal approximation.
 */
export function wilson(k: number, n: number, z = 1.959964): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  if (k < 0 || k > n) throw new Error(`k=${k} out of range for n=${n}`);
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
