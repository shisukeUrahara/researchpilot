import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RunManifest } from "../artifacts/manifest";
import { Arm } from "../domain/schemas";
import { loadRecords, reportSet, runDir } from "../grade/report";
import { loadScenarios } from "../scenarios/schema";
import { PolicyName, loadPolicy } from "../tools/policy";
import { runEval } from "./evalRun";
import { promptSet, type RunnerEnv } from "./runner";

export interface ReproduceRow {
  set: string;
  runs: number;
  records: "same" | "differs" | "skipped";
  metrics: "same" | "differs" | "skipped";
  note: string;
}

/**
 * Replays every eval and injection run set from the committed cache (no key, a fresh temp state dir) and
 * compares the new records with the committed records.jsonl, then the regraded metrics.json. Sets made
 * with older prompts (the dev tuning rounds) are skipped and say so.
 */
export async function reproduceAll(env: RunnerEnv): Promise<ReproduceRow[]> {
  const runsRoot = path.join(env.dataDir, "runs");
  const rows: ReproduceRow[] = [];
  const current = promptSet(env).sha;
  const scenarios = new Map(loadScenarios(env.dataDir).map((s) => [s.id, s]));
  const policies = loadPolicy(env.dataDir);
  for (const set of existsSync(runsRoot) ? readdirSync(runsRoot).sort() : []) {
    const mf = path.join(runDir(env.dataDir, set), "manifest.json");
    if (!existsSync(mf)) continue;
    const m = RunManifest.parse(JSON.parse(readFileSync(mf, "utf8")));
    if (m.split === "dev" || m.prompt_set_sha !== current) {
      rows.push({ set, runs: m.sample_count, records: "skipped", metrics: "skipped", note: m.split === "dev" ? "dev tuning set" : "made with older prompts" });
      continue;
    }
    const committed = readFileSync(path.join(runDir(env.dataDir, set), "records.jsonl"), "utf8");
    const ids = loadRecords(env.dataDir, set).map((r) => r.scenario_id);
    const arm = Arm.parse(m.arm);
    const policy = m.policy === policies.arms[arm].policy ? null : PolicyName.parse(m.policy);
    const res = await runEval(
      { ...env, apiKey: null, stateDir: mkdtempSync(path.join(tmpdir(), "rp-repro-")) },
      { arm, scenarios: ids.map((id) => scenarios.get(id)!), policy, concurrency: 4, spentBefore: 0, capUsd: 0, liveSpent: () => 0 },
      set,
    );
    const fresh = res.records.map((r) => JSON.stringify(r) + "\n").join("");
    const metricsFile = path.join(runDir(env.dataDir, set), "metrics.json");
    const before = existsSync(metricsFile) ? readFileSync(metricsFile, "utf8") : null;
    // Regrade from the committed records; metrics carry no clock, so the bytes must match.
    reportSet(env.dataDir, set);
    const after = readFileSync(metricsFile, "utf8");
    if (before !== null && before !== after) writeFileSync(metricsFile, before);
    rows.push({
      set,
      runs: ids.length,
      records: fresh === committed ? "same" : "differs",
      metrics: before === null ? "skipped" : before === after ? "same" : "differs",
      note: before === null ? "no committed metrics.json" : "",
    });
  }
  return rows;
}
