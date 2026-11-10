import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Provider, StopReason, Verdict, Workload } from "../domain/schemas";

export const ScenarioKind = z.enum(["golden", "freshness", "price", "deadend", "unavailable", "malformed", "deadline", "injection"]);
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const Expected = z.object({
  /** Stop reasons that count as right. Golden runs must verify; a dead end must stop on NO_PROGRESS. */
  stop_reasons: z.array(StopReason).min(1),
  /**
   * `exact`: verdicts must match. `no_wrong_values`: the path decides which cells get filled, so only
   * "every reported cell is gold-correct or unknown" is graded (unavailable source, malformed tool, deadline).
   */
  grading: z.enum(["exact", "no_wrong_values"]),
  verdicts: z.record(Provider, Verdict).nullable(),
  /** Required cells whose right answer is unknown (price, not stated, masked by the scenario). */
  unknown_cells: z.array(z.string()),
  /** Cells where the corpus holds a stale value the memo must not use as current. */
  conflict_cells: z.array(z.string()),
});
export type Expected = z.infer<typeof Expected>;

export const Scenario = z.object({
  id: z.string().regex(/^[a-z]+-\d{2}$/),
  split: z.enum(["dev", "eval", "injection"]),
  kind: ScenarioKind,
  /** Base brief; `workload` and `plans` below override parts of it. */
  brief_id: z.string(),
  question: z.string().nullable(),
  workload: Workload.partial().nullable(),
  plans: z
    .object({ cloudflare: z.array(z.string()), vercel: z.array(z.string()), aws: z.array(z.string()) })
    .partial()
    .nullable(),
  /** Put this synthetic note at this search rank for every query. */
  inject: z.object({ note_id: z.string(), rank: z.literal(1) }).nullable(),
  /** Force an official passage to this search rank (the stale-page freshness test). */
  rank_override: z.object({ passage_id: z.string(), rank: z.number().int().positive() }).nullable(),
  /** Search returns only this synthetic page, whatever the query. */
  deadend: z.object({ page_id: z.string() }).nullable(),
  /** From this step on, tools reading this source fail this way. */
  fault: z.object({ kind: z.enum(["unavailable", "malformed"]), source_id: z.string(), from_step: z.number().int().nonnegative() }).nullable(),
  deadline_ms: z.number().int().positive().nullable(),
  expected: Expected,
});
export type Scenario = z.infer<typeof Scenario>;

export const scenariosPath = (dataDir: string) => path.join(dataDir, "data", "scenarios", "v1.jsonl");

export function loadScenarios(dataDir: string): Scenario[] {
  return readFileSync(scenariosPath(dataDir), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      const r = Scenario.safeParse(JSON.parse(l));
      if (!r.success) throw new Error(`scenario line ${i + 1}: ${r.error.message}`);
      return r.data;
    });
}
