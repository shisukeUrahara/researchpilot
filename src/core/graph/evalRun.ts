import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadBudgetConfig } from "../budget/runBudget";
import { mayStart } from "../budget/spend";
import type { Arm } from "../domain/schemas";
import { toRecord, type RunRecord } from "../grade/record";
import type { Scenario } from "../scenarios/schema";
import { openStore } from "../store/db";
import { armConfig, loadPolicy, type PolicyName } from "../tools/policy";
import { evalRunId, promptSet, startRun, type RunnerEnv } from "./runner";

export interface EvalRequest {
  arm: Arm;
  scenarios: Scenario[];
  policy: PolicyName | null;
  concurrency: number;
  /** Live spend before this command (from var/spend.json) and the owner's total cap. */
  spentBefore: number;
  capUsd: number;
  /** Live spend so far in this command (the Gateway's budget). */
  liveSpent: () => number;
  onDone?: (scenarioId: string, r: RunRecord | null) => void;
}

export interface EvalResult {
  records: RunRecord[];
  notRun: string[];
  stateDir: string;
  promptSetSha: string;
  policy: string;
  demo: boolean;
}

/**
 * Runs one arm over a list of scenarios, `concurrency` at a time, each in its own deterministic run id,
 * approvals denied (no run ever waits). Before each start the spend cap is checked; a run that could
 * push the total past the cap is not started and is listed as not run.
 */
export async function runEval(env: RunnerEnv, req: EvalRequest, setId: string): Promise<EvalResult> {
  const stateDir = path.join(env.stateDir, "eval", `${setId}-${env.now().getTime()}`);
  mkdirSync(stateDir, { recursive: true });
  const runEnv: RunnerEnv = { ...env, stateDir };
  const policyFile = loadPolicy(env.dataDir);
  const cfg = armConfig(policyFile, req.arm, req.policy);
  const { sha } = promptSet(env);
  const perRun = loadBudgetConfig(env.dataDir).limits.max_usd;
  const records = new Map<string, RunRecord>();
  const notRun: string[] = [];
  let next = 0;
  let inFlight = 0;

  const worker = async () => {
    while (next < req.scenarios.length) {
      const s = req.scenarios[next++];
      if (env.apiKey && !mayStart(req.spentBefore + req.liveSpent(), perRun, inFlight, req.capUsd)) {
        notRun.push(s.id);
        req.onDone?.(s.id, null);
        continue;
      }
      inFlight++;
      try {
        const runId = evalRunId(s.id, req.arm, cfg.policy, sha);
        const out = await startRun(runEnv, { arm: req.arm, scenario: s, policy: req.policy, approvals: "deny", runId });
        const store = openStore(stateDir);
        const rec = toRecord({
          state: out.state,
          scenarioId: s.id,
          split: s.split,
          policy: cfg.policy,
          tools: store.toolEvents(runId),
          outbox: store.outbox(runId).length,
          noteSourceId: s.inject ? `synthetic:${s.inject.note_id}` : null,
        });
        store.close();
        records.set(s.id, rec);
        req.onDone?.(s.id, rec);
      } finally {
        inFlight--;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, req.concurrency) }, worker));
  // Records in scenario order, so the file is the same however the runs interleaved.
  const ordered = req.scenarios.map((s) => records.get(s.id)).filter((r): r is RunRecord => r !== undefined);
  return { records: ordered, notRun: req.scenarios.filter((s) => notRun.includes(s.id)).map((s) => s.id), stateDir, promptSetSha: sha, policy: cfg.policy, demo: cfg.demo };
}
