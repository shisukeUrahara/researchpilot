import path from "node:path";
import { parseArgs } from "node:util";
import { GuardError, fileShas, gitState, guardRun, machine, writeRunFolder } from "@/core/artifacts/manifest";
import { loadBudgetConfig } from "@/core/budget/runBudget";
import { addSpend, loadSpend, TOTAL_CAP_USD } from "@/core/budget/spend";
import { loadPricing } from "@/core/cost/pricing";
import { Arm } from "@/core/domain/schemas";
import { runEval } from "@/core/graph/evalRun";
import { PROMPTS, promptSet } from "@/core/graph/runner";
import { loadModelRoles } from "@/core/llm/config";
import { Budget } from "@/core/runner/budget";
import { loadScenarios } from "@/core/scenarios/schema";
import { sha256Hex } from "@/core/sources/text";
import { loadPolicy, PolicyName } from "@/core/tools/policy";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/**
 * rp eval --arm <arm> --split dev|eval|injection [--policy p] [--only id,id] [--concurrency 4] [--replay] [--dry-run] [--set name]
 * Runs every scenario of the split, writes runs/<set>/manifest.json and records.jsonl.
 */
export const evalCmd: Command = async (argv, deps) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      arm: { type: "string" },
      split: { type: "string" },
      policy: { type: "string" },
      only: { type: "string" },
      concurrency: { type: "string", default: "4" },
      replay: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      set: { type: "string" },
    },
  });
  if (!values.arm || !values.split) {
    deps.err("usage: rp eval --arm bounded|ablation|naive --split dev|eval|injection [--policy strict|permissive] [--only ids] [--concurrency 4] [--replay] [--dry-run] [--set name]");
    return EXIT.USAGE;
  }
  const arm = Arm.parse(values.arm);
  const policy = values.policy ? PolicyName.parse(values.policy) : null;
  const only = values.only ? new Set(values.only.split(",")) : null;
  const scenarios = loadScenarios(deps.dataDir).filter((s) => s.split === values.split && (!only || only.has(s.id)));
  const perRun = loadBudgetConfig(deps.dataDir).limits.max_usd;
  const spend = loadSpend(deps.stateDir);
  const setId = values.set ?? `${values.split}-${arm}${policy ? `-${policy}` : ""}`;
  if (values["dry-run"]) {
    deps.out(`${setId}: ${scenarios.length} runs; worst case $${(scenarios.length * perRun).toFixed(2)} at the $${perRun} per-run cap; spent so far $${spend.spent_usd.toFixed(4)} of $${TOTAL_CAP_USD}`);
    return EXIT.OK;
  }
  const replay = values.replay || deps.replay;
  const env = deps.runner(TOTAL_CAP_USD, replay);
  const { prompts, sha } = promptSet(env);
  const demo = policy !== null && policy !== loadPolicy(deps.dataDir).arms[arm].policy;
  try {
    guardRun(deps.dataDir, values.split, demo || replay, Object.values(PROMPTS).map((n) => `data/prompts/${n}.md`));
  } catch (e) {
    if (e instanceof GuardError) {
      deps.err(e.message);
      return EXIT.DIRTY_TREE;
    }
    throw e;
  }
  const pricing = loadPricing(path.join(deps.dataDir, "pricing.json"));
  const live = new Budget(pricing, Math.max(0, TOTAL_CAP_USD - spend.spent_usd));
  let done = 0;
  const res = await runEval(
    { ...env, liveBudget: replay ? undefined : live },
    {
      arm,
      scenarios,
      policy,
      concurrency: Number(values.concurrency),
      spentBefore: spend.spent_usd,
      capUsd: TOTAL_CAP_USD,
      liveSpent: () => live.spentUsd,
      onDone: (id, r) => deps.out(`[${++done}/${scenarios.length}] ${id} ${r ? `${r.stop_reason} · ${r.usage.tool_calls} calls · $${r.usage.usd.toFixed(4)}` : "NOT RUN (spend cap)"}`),
    },
    setId,
  );
  if (!replay) addSpend(deps.stateDir, setId, live.spentUsd, deps.now());
  const g = gitState(deps.dataDir);
  const records = res.records.map((r) => JSON.stringify(r));
  writeRunFolder(
    path.join(deps.dataDir, "runs", setId),
    {
      run_set: setId,
      kind: "eval",
      split: values.split as "dev" | "eval" | "injection",
      arm,
      policy: res.policy,
      demo: res.demo,
      sample_count: scenarios.length,
      repetitions: 1,
      concurrency: Number(values.concurrency),
      git_sha: g.sha,
      git_dirty: g.dirty.length > 0,
      prompt_set_sha: sha,
      prompts: Object.fromEntries(Object.entries(prompts).map(([k, p]) => [k, `${p.name} ${p.sha.slice(0, 12)}`])),
      model_spec: loadModelRoles(deps.dataDir).actor.spec,
      index_version: `bm25 over passages ${sha256Hex(JSON.stringify(fileShas(deps.dataDir, ["fixtures/sources/manifest.json"]))).slice(0, 12)}`,
      file_shas: fileShas(deps.dataDir),
      ...machine(),
      created_at_utc: deps.now().toISOString(),
      live_usd: Number(live.spentUsd.toFixed(6)),
      not_run: res.notRun,
      limitations: [
        "one model (gpt-4.1-mini-2025-04-14), temperature 0, one repetition",
        "time is virtual (3,000 ms per model call, 500 ms per tool call); real latency is not measured",
        "gold facts and memo samples are reviewed by a model, not by a human",
      ],
    },
    records,
  );
  deps.out(`wrote runs/${setId}: ${res.records.length} records, ${res.notRun.length} not run, live $${live.spentUsd.toFixed(4)}`);
  return EXIT.OK;
};
