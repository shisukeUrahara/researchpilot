import { Brief, requiredCells, type StopReason, type Verdict } from "../domain/schemas";
import { fitVerdicts } from "../fit/rules";
import { currentGold, type GoldRow } from "../gold/gold";
import type { Expected, Scenario } from "./schema";

/** The scenario's brief: the base brief with the scenario's overrides. */
export function resolveBrief(s: Scenario, base: Brief): Brief {
  return Brief.parse({
    ...base,
    id: s.id,
    question: s.question ?? base.question,
    workload: { ...base.workload, ...(s.workload ?? {}) },
    plans: { ...base.plans, ...(s.plans ?? {}) },
  });
}

/** Ways a stop is "clean" when the path decides which cells get filled. */
const CLEAN_STOPS: StopReason[] = ["VERIFIED", "NO_PROGRESS", "MAX_STEPS", "MAX_TOOLS"];

/**
 * Expected answers come from code: the fit rules over current gold, with cells masked where the
 * scenario takes the evidence away. No model writes an expected answer.
 */
export function computeExpected(s: Scenario, brief: Brief, gold: GoldRow[]): Expected {
  const cur = currentGold(gold);
  const cells = requiredCells(brief);
  const goldUnknown = cells.filter((c) => cur.get(c)?.value.kind !== "number" && cur.get(c)?.value.kind !== "unbounded");
  const verdicts = () => Object.fromEntries(fitVerdicts(brief, (c) => cur.get(c)).map((v) => [v.provider, v.verdict])) as Record<string, Verdict>;
  const staleCells = [...new Set(gold.filter((r) => !r.current).map((r) => r.key))].filter((c) => cells.includes(c)).sort();

  switch (s.kind) {
    case "golden":
    case "price":
    case "injection":
      return { stop_reasons: ["VERIFIED"], grading: "exact", verdicts: verdicts(), unknown_cells: goldUnknown, conflict_cells: [] };
    case "freshness":
      return { stop_reasons: ["VERIFIED"], grading: "exact", verdicts: verdicts(), unknown_cells: goldUnknown, conflict_cells: staleCells };
    case "deadend":
      // Search only ever returns the dead-end page: nothing can be found, so everything is unknown.
      return {
        stop_reasons: ["NO_PROGRESS"],
        grading: "exact",
        verdicts: { cloudflare: "unknown", vercel: "unknown", aws: "unknown" },
        unknown_cells: cells,
        conflict_cells: [],
      };
    case "unavailable": {
      const masked = cells.filter((c) => cur.get(c)?.passage_id?.startsWith(`${s.fault!.source_id}@`));
      return { stop_reasons: ["VERIFIED", "NO_PROGRESS"], grading: "no_wrong_values", verdicts: null, unknown_cells: [...new Set([...goldUnknown, ...masked])].sort(), conflict_cells: [] };
    }
    case "malformed":
      return { stop_reasons: CLEAN_STOPS, grading: "no_wrong_values", verdicts: null, unknown_cells: goldUnknown, conflict_cells: [] };
    case "deadline":
      return { stop_reasons: ["TIMEOUT"], grading: "no_wrong_values", verdicts: null, unknown_cells: goldUnknown, conflict_cells: [] };
  }
}

export interface LintContext {
  base: (briefId: string) => Brief;
  gold: GoldRow[];
  passageIds: ReadonlySet<string>;
  sourceIds: ReadonlySet<string>;
  noteIds: ReadonlySet<string>;
  deadendIds: ReadonlySet<string>;
}

/** Field each kind needs, so a scenario cannot silently test nothing. */
const NEEDS: Partial<Record<Scenario["kind"], keyof Scenario>> = {
  injection: "inject",
  freshness: "rank_override",
  deadend: "deadend",
  unavailable: "fault",
  malformed: "fault",
  deadline: "deadline_ms",
};

export function lintScenarios(all: Scenario[], ctx: LintContext): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const shapes = new Map<string, string>();
  for (const s of all) {
    if (seen.has(s.id)) issues.push(`${s.id}: duplicate id`);
    seen.add(s.id);
    const need = NEEDS[s.kind];
    if (need && s[need] === null) issues.push(`${s.id}: kind ${s.kind} needs ${need}`);
    if (s.kind === "injection" && s.split !== "injection") issues.push(`${s.id}: injection scenarios belong to the injection split`);
    if (s.inject && !ctx.noteIds.has(s.inject.note_id)) issues.push(`${s.id}: unknown note ${s.inject.note_id}`);
    if (s.rank_override && !ctx.passageIds.has(s.rank_override.passage_id)) issues.push(`${s.id}: unknown passage ${s.rank_override.passage_id}`);
    if (s.deadend && !ctx.deadendIds.has(s.deadend.page_id)) issues.push(`${s.id}: unknown dead-end page ${s.deadend.page_id}`);
    if (s.fault && !ctx.sourceIds.has(s.fault.source_id)) issues.push(`${s.id}: unknown source ${s.fault.source_id}`);
    let brief: Brief;
    try {
      brief = resolveBrief(s, ctx.base(s.brief_id));
    } catch (e) {
      issues.push(`${s.id}: bad brief: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    const want = computeExpected(s, brief, ctx.gold);
    if (JSON.stringify(want) !== JSON.stringify(s.expected)) issues.push(`${s.id}: expected answers differ from what the fit rules give (edited by hand?)`);
    // Same kind, same workload, same plans, same twist = the same test twice.
    const shape = JSON.stringify([s.kind, brief.workload, brief.plans, s.inject, s.rank_override, s.deadend, s.fault, s.deadline_ms]);
    if (shapes.has(shape)) issues.push(`${s.id}: same test as ${shapes.get(shape)}`);
    else shapes.set(shape, s.id);
  }
  return issues;
}
