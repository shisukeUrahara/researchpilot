import type { Value } from "../domain/schemas";

type Unit = "s" | "ms" | "mb" | "count";

/** Unit words → (kind, factor to the base unit: seconds or MB). */
const TIME: Record<string, number> = {
  ms: 0.001,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
};
const SIZE: Record<string, number> = { kb: 1 / 1024, kib: 1 / 1024, mb: 1, mib: 1, gb: 1024, gib: 1024 };

export interface Quantity {
  /** Value in the base unit: seconds for time, MB for size, plain for counts. */
  base: number;
  kind: "time" | "size" | "count";
}

/**
 * Every number in a text, with its unit if one follows. Numbers are matched on word boundaries, so
 * "30" is not found inside "300", and "10,240" is one number.
 */
export function quantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([a-z]+)?/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    if (unit in TIME) out.push({ base: n * TIME[unit], kind: "time" });
    else if (unit in SIZE) out.push({ base: n * SIZE[unit], kind: "size" });
    else out.push({ base: n, kind: "count" });
  }
  return out;
}

/** The fact's value in the same base unit, for comparing. */
function toBase(n: number, unit: Unit): Quantity {
  if (unit === "s") return { base: n, kind: "time" };
  if (unit === "ms") return { base: n / 1000, kind: "time" };
  if (unit === "mb") return { base: n, kind: "size" };
  return { base: n, kind: "count" };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** True when the text states this number in a compatible unit ("15 minutes" states 900 s). */
export function statesNumber(text: string, n: number, unit: Unit): boolean {
  const want = toBase(n, unit);
  return quantities(text).some((q) => q.kind === want.kind && close(q.base, want.base));
}

/** Phrases that mean "no limit". Kept short and literal: the verifier is code, not judgment. */
const UNBOUNDED = /no (hard |enforced |set )?(time )?limit|unlimited|uncapped|doesn't apply to streamed|does not apply to streamed/i;

export const statesUnbounded = (text: string) => UNBOUNDED.test(text);

/** Does the text state this value? Unknown values are never "stated". */
export function statesValue(text: string, v: Value): boolean {
  if (v.kind === "number") return statesNumber(text, v.n, v.unit);
  if (v.kind === "unbounded") return statesUnbounded(text);
  return false;
}
