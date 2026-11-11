import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadBudgetConfig } from "../budget/runBudget";
import { loadPricing, type Pricing } from "../cost/pricing";
import { loadBrief, loadCriteria } from "../domain/criteria";
import type { Arm, Brief } from "../domain/schemas";
import type { ResponseCache } from "../llm/cache";
import { loadModelRoles } from "../llm/config";
import { Gateway } from "../llm/gateway";
import { canonicalJson, sha256Hex } from "../prompts/canonical";
import { loadPrompt } from "../prompts/load";
import { statusFor } from "../run/status";
import { Budget } from "../runner/budget";
import { resolveBrief } from "../scenarios/lint";
import { loadScenarios, type Scenario } from "../scenarios/schema";
import { asPassage, loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { openStore, type Store } from "../store/db";
import { sendEmail } from "../tools/decoy";
import { DocTools } from "../tools/docs";
import { fetchLive } from "../tools/fetchLive";
import { armConfig, loadPolicy, type PolicyName } from "../tools/policy";
import { makeRegistry } from "../tools/registry";
import { initialState, runBounded, type AgentDeps, type RunInput } from "./bounded";
import type { ApprovalMode } from "./nodes/approve";
import type { AgentState } from "./state";

/** The prompts every arm uses. Their shas go into run ids and manifests. */
export const PROMPTS = { planner: "planner.v1", actor: "actor.v1", extractor: "extractor.v1", writer: "writer.v1" } as const;

/** One process: one replay cache, one global spend cap. Runs share both. */
export interface RunnerEnv {
  dataDir: string;
  stateDir: string;
  apiKey: string | null;
  cache: ResponseCache;
  /** Global cap for live calls in this process (a run's own cap is in config/budgets.json). */
  maxUsd: number;
  now: () => Date;
  prompts?: Partial<Record<keyof typeof PROMPTS, string>>;
  /** Tests point the Gateway at the local mock OpenAI server. */
  baseURL?: string;
  /** Shared live budget (rp eval reads its spend for the spend ledger). Made from maxUsd if absent. */
  liveBudget?: Budget;
}

export interface RunRequest {
  arm: Arm;
  /** A brief id from data/briefs, or a scenario (which carries its own brief twist). */
  briefId?: string;
  scenario?: Scenario | null;
  policy?: PolicyName | null;
  approvals: ApprovalMode;
  /** Fixed run id (evals); a random one is made otherwise. */
  runId?: string;
  signal?: AbortSignal;
  onStep?: (stepNo: number) => void;
}

export interface RunOutcome {
  runId: string;
  state: AgentState & { paused: unknown | null };
  brief: Brief;
  demo: boolean;
  promptSetSha: string;
}

let gatewayFor: { key: string; gateway: Gateway; budget?: Budget } | null = null;

/** One Gateway per (cache, key, cap): identical calls in flight are shared, as in EvalForge. */
function gateway(env: RunnerEnv, pricing: Pricing): Gateway {
  const key = canonicalJson([env.cache.dir, env.apiKey !== null, env.maxUsd, env.baseURL ?? null]);
  if (env.liveBudget && gatewayFor?.key === key && gatewayFor.budget !== env.liveBudget) gatewayFor = null;
  if (gatewayFor?.key !== key) {
    gatewayFor = { key, budget: env.liveBudget, gateway: new Gateway(env.cache, env.apiKey ? { apiKey: env.apiKey, pricing, budget: env.liveBudget ?? new Budget(pricing, env.maxUsd), baseURL: env.baseURL } : null, env.now) };
  }
  return gatewayFor.gateway;
}

export function promptSet(env: RunnerEnv) {
  const names = { ...PROMPTS, ...(env.prompts ?? {}) };
  const t = {
    planner: loadPrompt(env.dataDir, names.planner),
    actor: loadPrompt(env.dataDir, names.actor),
    extractor: loadPrompt(env.dataDir, names.extractor),
    writer: loadPrompt(env.dataDir, names.writer),
  };
  return { prompts: t, sha: sha256Hex(canonicalJson(Object.values(t).map((p) => p.sha))).slice(0, 16) };
}

/** Deterministic id for an eval run, so a replay maps to the same run. */
export function evalRunId(scenarioId: string, arm: string, policy: string, promptSetSha: string, rep = 0): string {
  return "run_" + sha256Hex(canonicalJson([scenarioId, arm, policy, promptSetSha, rep])).slice(0, 16);
}

export function buildAgentDeps(env: RunnerEnv, req: RunRequest, store: Store): { deps: AgentDeps; brief: Brief; demo: boolean; promptSetSha: string } {
  const dir = env.dataDir;
  const pricing = loadPricing(path.join(dir, "pricing.json"));
  const budget = loadBudgetConfig(dir);
  const manifest = loadManifest(dir);
  const notes = loadSynthetic(dir);
  const passages = loadAllPassages(dir, manifest.sources.map((s) => s.id));
  const all = new Map(passages.map((p) => [p.id, p]));
  for (const n of notes.values()) all.set(asPassage(n).id, asPassage(n));
  const policyFile = loadPolicy(dir);
  const arm = armConfig(policyFile, req.arm, req.policy ?? null);
  const base = loadBrief(dir, req.scenario?.brief_id ?? req.briefId ?? "three-minute");
  const brief = req.scenario ? resolveBrief(req.scenario, base) : base;
  const { prompts, sha } = promptSet(env);
  // Arms with a non-default policy get their own cache rows, so the bounded-permissive run is its own sample.
  const cacheArm = arm.demo ? `${req.arm}-${arm.policy}` : req.arm;
  const deps: AgentDeps = {
    model: { gateway: gateway(env, pricing), roles: loadModelRoles(dir), pricing, budget, arm: cacheArm, signal: req.signal },
    store,
    docs: new DocTools({ manifest, passages, notes, scenario: req.scenario ?? null }),
    registry: makeRegistry([sendEmail, fetchLive]),
    policyFile,
    arm,
    budget,
    criteria: loadCriteria(dir),
    manifest,
    passages: all,
    prompts,
    approvals: req.approvals,
    now: env.now,
    onStep: req.onStep,
  };
  return { deps, brief, demo: arm.demo, promptSetSha: sha };
}

export function checkpointer(stateDir: string): SqliteSaver {
  mkdirSync(stateDir, { recursive: true });
  return SqliteSaver.fromConnString(path.join(stateDir, "checkpoints.db"));
}

/** Starts a run and drives it until it stops or pauses for approval. */
export async function startRun(env: RunnerEnv, req: RunRequest): Promise<RunOutcome> {
  const store = openStore(env.stateDir);
  try {
    const { deps, brief, demo, promptSetSha } = buildAgentDeps(env, req, store);
    const runId = req.runId ?? `run_${randomBytes(8).toString("hex")}`;
    const at = env.now().toISOString();
    store.upsertRun({ run_id: runId, arm: req.arm, brief_id: brief.id, scenario_id: req.scenario?.id ?? null, policy: deps.arm.policy, status: "running", stop_reason: null, created_at: at, updated_at: at });
    const state = await runBounded(deps, initialState(runId, req.arm, brief), runId, checkpointer(env.stateDir), req.signal);
    finishRow(store, runId, state, env.now());
    return { runId, state, brief, demo, promptSetSha };
  } finally {
    store.close();
  }
}

/** Continues a run on its thread: after a crash (`null`) or with an approval answer (`{ resume }`). */
export async function continueRun(env: RunnerEnv, req: RunRequest & { runId: string }, input: RunInput): Promise<RunOutcome> {
  const store = openStore(env.stateDir);
  try {
    const { deps, brief, demo, promptSetSha } = buildAgentDeps(env, req, store);
    const state = await runBounded(deps, input, req.runId, checkpointer(env.stateDir), req.signal);
    finishRow(store, req.runId, state, env.now());
    return { runId: req.runId, state, brief, demo, promptSetSha };
  } finally {
    store.close();
  }
}

function finishRow(store: Store, runId: string, state: AgentState & { paused: unknown | null }, now: Date): void {
  const row = store.getRun(runId)!;
  const status = state.paused ? "awaiting_approval" : state.stopReason ? statusFor(state.stopReason) : state.status;
  store.upsertRun({ ...row, status, stop_reason: state.paused ? null : state.stopReason, updated_at: now.toISOString() });
}

/** The request a stored run was started with, so it can be continued (resume, approval). */
export function requestFor(store: Store, runId: string, dataDir: string): RunRequest & { runId: string } {
  const row = store.getRun(runId);
  if (!row) throw new Error(`no run ${runId}`);
  const scenario = row.scenario_id ? (loadScenarios(dataDir).find((s) => s.id === row.scenario_id) ?? null) : null;
  const arm = row.arm as Arm;
  const base = loadPolicy(dataDir).arms[arm].policy;
  return { arm, briefId: row.brief_id, scenario, policy: row.policy === base ? null : (row.policy as PolicyName), approvals: "interrupt", runId };
}

/** The latest checkpointed state of a run, or null if it has none. */
export async function readRunState(stateDir: string, runId: string): Promise<AgentState | null> {
  const t = await checkpointer(stateDir).getTuple({ configurable: { thread_id: runId } });
  return t ? (t.checkpoint.channel_values as unknown as AgentState) : null;
}

/**
 * Rebuilds the runs table's status and stop reason from the checkpoints (the source of truth). The
 * other tables are written insert-or-ignore by the nodes themselves, so they never hold a half step.
 */
export async function rebuildRunRows(stateDir: string, now: Date): Promise<{ runId: string; from: string; to: string }[]> {
  const store = openStore(stateDir);
  const changed: { runId: string; from: string; to: string }[] = [];
  try {
    for (const row of store.listRuns(10_000)) {
      const st = await readRunState(stateDir, row.run_id);
      if (!st) continue;
      const status = st.stopReason ? statusFor(st.stopReason) : row.status === "awaiting_approval" ? "awaiting_approval" : "running";
      if (status !== row.status || (st.stopReason ?? null) !== row.stop_reason) {
        store.upsertRun({ ...row, status, stop_reason: st.stopReason ?? null, updated_at: now.toISOString() });
        changed.push({ runId: row.run_id, from: `${row.status}/${row.stop_reason ?? "-"}`, to: `${status}/${st.stopReason ?? "-"}` });
      }
    }
  } finally {
    store.close();
  }
  return changed;
}
