import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBudgetConfig } from "../budget/runBudget";
import { loadBrief } from "../domain/criteria";
import { evaluateGate, loadRules, type GateResult } from "../gate/evaluate";
import { loadGold } from "../gold/gold";
import { armMetrics, injectionMetrics, type ArmMetrics, type InjectionMetrics } from "../metrics/eval";
import { resolveBrief } from "../scenarios/lint";
import { loadScenarios } from "../scenarios/schema";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { gradeRun, type Grade } from "./grade";
import { RunRecord } from "./record";

export const runDir = (dataDir: string, set: string) => path.join(dataDir, "runs", set);

export function loadRecords(dataDir: string, set: string): RunRecord[] {
  const f = path.join(runDir(dataDir, set), "records.jsonl");
  if (!existsSync(f)) throw new Error(`no records for run set ${set} (${f})`);
  return readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => RunRecord.parse(JSON.parse(l)));
}

/** Grades every record of a run set against its scenario. */
export function gradeSet(dataDir: string, set: string): Grade[] {
  const scenarios = new Map(loadScenarios(dataDir).map((s) => [s.id, s]));
  const gold = loadGold(dataDir);
  const budget = loadBudgetConfig(dataDir);
  const official = new Set(loadManifest(dataDir).sources.map((s) => s.id));
  const notes = loadSynthetic(dataDir);
  return loadRecords(dataDir, set).map((r) => {
    const s = scenarios.get(r.scenario_id);
    if (!s) throw new Error(`record ${r.run_id}: unknown scenario ${r.scenario_id}`);
    return gradeRun(r, s, { gold, brief: resolveBrief(s, loadBrief(dataDir, s.brief_id)), budget, officialSourceIds: official, notes });
  });
}

export interface SetMetrics {
  run_set: string;
  arm: ArmMetrics;
  injection: InjectionMetrics | null;
  failures: { scenario_id: string; run_id: string; reasons: string[] }[];
}

/** metrics.json for one run set. No clock fields: the same records always give the same bytes. */
export function reportSet(dataDir: string, set: string): SetMetrics {
  const grades = gradeSet(dataDir, set);
  const injection = grades.some((g) => g.kind === "injection") ? injectionMetrics(grades, (id) => id.startsWith("poison-")) : null;
  const m: SetMetrics = {
    run_set: set,
    arm: armMetrics(grades),
    injection,
    failures: grades.filter((g) => !g.task_success).map((g) => ({ scenario_id: g.scenario_id, run_id: g.run_id, reasons: g.fail_reasons })),
  };
  writeFileSync(path.join(runDir(dataDir, set), "grades.jsonl"), grades.map((g) => JSON.stringify(g)).join("\n") + "\n");
  writeFileSync(path.join(runDir(dataDir, set), "metrics.json"), JSON.stringify(m, null, 2) + "\n");
  return m;
}

/** gate.json from graded run sets. Every strict-policy set counts for unsafe executions. */
export function gateSets(dataDir: string, boundedEval: string, boundedInjection: string | null, strictSets: string[]): GateResult {
  const { rules, sha } = loadRules(dataDir);
  const result = evaluateGate(
    {
      boundedEval: gradeSet(dataDir, boundedEval),
      boundedInjection: boundedInjection ? gradeSet(dataDir, boundedInjection) : [],
      strictRuns: strictSets.flatMap((s) => gradeSet(dataDir, s)).filter((g) => g.policy === "strict"),
    },
    rules,
    sha,
  );
  writeFileSync(path.join(dataDir, "gate", "gate.json"), JSON.stringify({ inputs: { boundedEval, boundedInjection, strictSets }, ...result }, null, 2) + "\n");
  return result;
}
