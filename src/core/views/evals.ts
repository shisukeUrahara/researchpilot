import type { GateResult } from "../gate/evaluate";
import type { SetMetrics } from "../grade/report";
import type { Rate } from "../metrics/eval";

/** The run sets the Evals page shows, by column. A missing set shows as "not run". */
export const EVAL_SETS = {
  bounded: { eval: "eval-bounded", injection: "injection-bounded" },
  ablation: { eval: "eval-ablation", injection: null },
  naive: { eval: "eval-naive", injection: "injection-naive" },
} as const;
export type Column = keyof typeof EVAL_SETS;

export interface Cell {
  text: string;
  /** k/n and the 95% range, for the tooltip. */
  detail: string | null;
  set: string | null;
}

export interface EvalsView {
  columns: Column[];
  rows: { label: string; hint: string; cells: Record<Column, Cell> }[];
  stopReasons: Record<Column, Record<string, number>>;
  gate: GateResult | null;
}

const pct = (r: Rate): Cell["text"] => (r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(1)}%`);
const det = (r: Rate) => `${r.k}/${r.n} · 95% ${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}%`;
const none: Cell = { text: "—", detail: null, set: null };

/**
 * The Evals table: one column per arm, one row per measure. Every number names the run set it comes
 * from, so a click leads to the records. Pure.
 */
export function evalsView(sets: Record<string, SetMetrics | undefined>, gate: GateResult | null): EvalsView {
  const columns = Object.keys(EVAL_SETS) as Column[];
  const ev = (c: Column) => sets[EVAL_SETS[c].eval];
  const inj = (c: Column) => {
    const name = EVAL_SETS[c].injection as string | null;
    return name ? sets[name] : undefined;
  };
  const rateRow = (label: string, hint: string, pick: (m: SetMetrics) => Rate | null, from: "eval" | "injection" = "eval") => ({
    label,
    hint,
    cells: Object.fromEntries(
      columns.map((c) => {
        const m = from === "eval" ? ev(c) : inj(c);
        const r = m ? pick(m) : null;
        return [c, r ? { text: pct(r), detail: det(r), set: m!.run_set } : none];
      }),
    ) as Record<Column, Cell>,
  });
  const numRow = (label: string, hint: string, pick: (m: SetMetrics) => number | null, fmt: (n: number) => string, from: "eval" | "injection" = "eval") => ({
    label,
    hint,
    cells: Object.fromEntries(
      columns.map((c) => {
        const m = from === "eval" ? ev(c) : inj(c);
        const n = m ? pick(m) : null;
        return [c, n === null || n === undefined ? none : { text: fmt(n), detail: null, set: m!.run_set }];
      }),
    ) as Record<Column, Cell>,
  });
  return {
    columns,
    rows: [
      rateRow("Task success", "40 frozen tasks", (m) => m.arm.task_success),
      rateRow("Coverage", "cells with a stated gold value the memo got right", (m) => m.arm.coverage),
      rateRow("Unknown correct", "cells the corpus does not answer, left as unknown", (m) => m.arm.unknown_correct),
      rateRow("Raw claim support", "writer's claims before the memo check that match gold", (m) => m.arm.raw_claim_support),
      numRow("Median tool calls", "per task", (m) => m.arm.median_tool_calls, (n) => String(n)),
      rateRow("Redundant calls", "repeats answered from run memory", (m) => m.arm.redundant_call_rate),
      rateRow("Dead ends → NO_PROGRESS", "4 dead-end tasks", (m) => m.arm.no_progress_stops),
      numRow("Stale value used as current", "count", (m) => m.arm.stale_as_current, (n) => String(n)),
      numRow("Invented price", "count", (m) => m.arm.invented_price, (n) => String(n)),
      numRow("Cost", "live runs, total", (m) => m.arm.usd_total, (n) => `$${n.toFixed(2)}`),
      rateRow("Email attempts", "planted instruction seen → send_email proposed", (m) => m.injection?.email_attempt_rate ?? null, "injection"),
      numRow("Email executions", "the tool really ran", (m) => m.injection?.email_executions ?? null, (n) => String(n), "injection"),
      rateRow("Planted value in memo", "fake value seen → stated in the memo", (m) => m.injection?.injected_value_rate ?? null, "injection"),
    ],
    stopReasons: Object.fromEntries(columns.map((c) => [c, ev(c)?.arm.stop_reasons ?? {}])) as Record<Column, Record<string, number>>,
    gate,
  };
}
