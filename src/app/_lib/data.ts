import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadBudgetConfig } from "@/core/budget/runBudget";
import { loadEnv } from "@/core/env";
import type { GateResult } from "@/core/gate/evaluate";
import type { SetMetrics } from "@/core/grade/report";
import { readRunState } from "@/core/graph/runner";
import type { AgentState } from "@/core/graph/state";
import { loadScenarios, type Scenario } from "@/core/scenarios/schema";
import { asPassage, loadSynthetic } from "@/core/scenarios/synthetic";
import { loadManifest } from "@/core/sources/manifest";
import { loadAllPassages, type Passage } from "@/core/sources/passages";
import { openStore, type RunRow } from "@/core/store/db";
import { EVAL_SETS } from "@/core/views/evals";

export const env = () => loadEnv(process.env);

/** Sample briefs the web app can run: eval scenarios whose answers are in the replay cache. */
export const SAMPLES = [
  { id: "golden-01", label: "Three-minute job", arm: "bounded" },
  { id: "fresh-01", label: "Stale page first", arm: "bounded" },
  { id: "inj-01", label: "Planted instruction", arm: "bounded" },
  { id: "poison-01", label: "Planted fake value", arm: "bounded" },
  { id: "deadend-01", label: "Dead end", arm: "bounded" },
] as const;

export function scenarioById(id: string): Scenario | null {
  return loadScenarios(env().dataDir).find((s) => s.id === id) ?? null;
}

export function listRuns(limit = 30): RunRow[] {
  const e = env();
  if (!existsSync(path.join(e.stateDir, "researchpilot.db"))) return [];
  const store = openStore(e.stateDir);
  try {
    return store.listRuns(limit);
  } finally {
    store.close();
  }
}

export interface RunData {
  row: RunRow;
  state: AgentState | null;
  events: ReturnType<ReturnType<typeof openStore>["events"]>;
  tools: ReturnType<ReturnType<typeof openStore>["toolEvents"]>;
  report: { memo_json: string; check_json: string } | null;
  approvals: ReturnType<ReturnType<typeof openStore>["approvals"]>;
}

export async function getRun(runId: string): Promise<RunData | null> {
  const e = env();
  if (!existsSync(path.join(e.stateDir, "researchpilot.db"))) return null;
  const store = openStore(e.stateDir);
  try {
    const row = store.getRun(runId);
    if (!row) return null;
    return { row, state: await readRunState(e.stateDir, runId), events: store.events(runId), tools: store.toolEvents(runId), report: store.getReport(runId) ?? null, approvals: store.approvals(runId) };
  } finally {
    store.close();
  }
}

export const limits = () => loadBudgetConfig(env().dataDir).limits;
export const manifest = () => loadManifest(env().dataDir);

export function passagesWithNotes(): Map<string, Passage> {
  const e = env();
  const m = loadManifest(e.dataDir);
  const all = new Map(loadAllPassages(e.dataDir, m.sources.map((s) => s.id)).map((p) => [p.id, p]));
  for (const n of loadSynthetic(e.dataDir).values()) all.set(asPassage(n).id, asPassage(n));
  return all;
}

function readJson<T>(file: string): T | undefined {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
}

/** metrics.json of every run set the Evals page knows, plus gate/gate.json. */
export function evalData(): { sets: Record<string, SetMetrics | undefined>; gate: GateResult | null; manifests: Record<string, { git_sha: string; prompt_set_sha: string; model_spec: string; sample_count: number; not_run: string[] } | undefined> } {
  const dir = env().dataDir;
  const names = Object.values(EVAL_SETS).flatMap((v) => [v.eval, v.injection]).filter((x): x is NonNullable<typeof x> => x !== null);
  const sets: Record<string, SetMetrics | undefined> = {};
  const manifests: Record<string, never> = {};
  for (const n of names) {
    sets[n] = readJson(path.join(dir, "runs", n, "metrics.json"));
    (manifests as Record<string, unknown>)[n] = readJson(path.join(dir, "runs", n, "manifest.json"));
  }
  return { sets, gate: readJson<GateResult>(path.join(dir, "gate", "gate.json")) ?? null, manifests };
}
