import { PLANS, PROVIDERS, cellId, type Brief, type CriterionId, type PlanName, type Provider, type Value, type Verdict } from "../domain/schemas";

/** What the rules know about one cell. */
export interface CellValue {
  value: Value;
  conditions: string | null;
}
export type CellLookup = (cell: string) => CellValue | undefined;

export type PlanResult = "fits" | "does_not_fit" | "unknown";

export interface ProviderVerdict {
  provider: Provider;
  verdict: Verdict;
  /** For fits_on: the first plan (cheapest first, as listed in PLANS) that fits. */
  plan: PlanName | null;
  perPlan: Record<string, PlanResult>;
  reasons: string[];
  /** C11: does the answer change with the plan? */
  planDependent: boolean;
}

type Check = { result: PlanResult; reason: string };

const fmt = (v: Value) => (v.kind === "number" ? `${v.n} ${v.unit}` : v.kind);

/**
 * One limit check: need ≤ limit. A no-limit value always passes. An unknown limit is "unknown" when
 * the limit is essential, and passes with a note when the pages simply state no such limit.
 */
function within(label: string, need: number, unit: string, cell: CellValue | undefined, essential: boolean): Check {
  if (!cell || cell.value.kind === "unknown") {
    return essential ? { result: "unknown", reason: `${label}: unknown` } : { result: "fits", reason: `${label}: no limit stated` };
  }
  if (cell.value.kind === "unbounded") return { result: "fits", reason: `${label}: no hard limit` };
  const ok = need <= cell.value.n;
  return { result: ok ? "fits" : "does_not_fit", reason: `${label}: need ${need} ${unit}, limit ${fmt(cell.value)}` };
}

/** Extended duration (C03) only counts when its conditions allow a synchronous HTTP request. */
const extendedUsable = (c: CellValue | undefined) => !!c && c.value.kind === "number" && !/asynchronous|async/i.test(c.conditions ?? "");

function planResult(brief: Brief, provider: Provider, plan: PlanName, get: CellLookup): { result: PlanResult; reasons: string[] } {
  const w = brief.workload;
  const at = (c: CriterionId) => get(cellId(c, provider, plan));
  const checks: Check[] = [];

  // Wall-clock duration: the GA maximum first, then the extended maximum if it applies.
  let dur = within("duration", w.duration_s, "s", at("C02"), true);
  const ext = at("C03");
  if (dur.result === "does_not_fit" && extendedUsable(ext)) {
    const e = within("extended duration", w.duration_s, "s", ext, true);
    if (e.result === "fits") dur = { result: "fits", reason: `${e.reason} (needs: ${ext!.conditions ?? "extended limit"})` };
  }
  checks.push(dur);
  // CPU time is separate from wall-clock time (Cloudflare limits CPU, not duration).
  checks.push(within("CPU time", w.cpu_ms, "ms", at("C04"), false));
  checks.push(within("memory", w.memory_mb, "mb", at("C05"), true));
  checks.push(within("request body", w.request_body_mb, "mb", at("C07"), false));
  if (w.streaming) checks.push(within("streamed response", w.streamed_response_mb, "mb", at("C08"), false));

  const results = checks.map((c) => c.result);
  const result: PlanResult = results.includes("does_not_fit") ? "does_not_fit" : results.includes("unknown") ? "unknown" : "fits";
  return { result, reasons: checks.map((c) => c.reason) };
}

/** Per-provider verdicts for a brief, from whatever facts are known. Pure: same input, same output. */
export function fitVerdicts(brief: Brief, get: CellLookup): ProviderVerdict[] {
  return PROVIDERS.map((provider) => {
    const plans = (PLANS[provider] as readonly PlanName[]).filter((p) => (brief.plans[provider] as readonly string[]).includes(p));
    const perPlan: Record<string, PlanResult> = {};
    const reasons: string[] = [];
    for (const plan of plans) {
      const r = planResult(brief, provider, plan, get);
      perPlan[plan] = r.result;
      reasons.push(...r.reasons.map((x) => (plans.length > 1 ? `${plan}: ${x}` : x)));
    }
    const vals = Object.values(perPlan);
    const fitting = plans.filter((p) => perPlan[p] === "fits");
    let verdict: Verdict;
    let plan: PlanName | null = null;
    if (fitting.length === plans.length) verdict = "fits";
    else if (fitting.length > 0) {
      verdict = "fits_on";
      plan = fitting[0];
    } else if (vals.includes("unknown")) verdict = "unknown";
    else verdict = "does_not_fit";
    return { provider, verdict, plan, perPlan, reasons, planDependent: new Set(vals).size > 1 };
  });
}
