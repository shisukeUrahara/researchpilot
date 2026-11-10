import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadBudgetConfig } from "../../budget/runBudget";
import { loadPricing } from "../../cost/pricing";
import { ResponseCache } from "../../llm/cache";
import { loadModelRoles } from "../../llm/config";
import { Gateway } from "../../llm/gateway";
import { startMockServer, type MockServer, type Reply } from "../../llm/testing/mockServer";
import { Budget } from "../../runner/budget";
import type { ModelDeps } from "../model";

/** Model deps that talk to the local mock OpenAI server: the real Gateway and LangChain path, no network. */
export async function mockModelDeps(script: Reply[], arm = "bounded"): Promise<{ deps: ModelDeps; srv: MockServer }> {
  const srv = await startMockServer(script);
  const dir = process.cwd();
  const pricing = loadPricing(path.join(dir, "pricing.json"));
  const cache = new ResponseCache(path.join(mkdtempSync(path.join(tmpdir(), "rp-cache-")), "llm"));
  const gateway = new Gateway(cache, { apiKey: "sk-test", pricing, budget: new Budget(pricing, 5), baseURL: srv.baseURL });
  return { srv, deps: { gateway, roles: loadModelRoles(dir), pricing, budget: loadBudgetConfig(dir), arm } };
}

import { loadCriteria } from "../../domain/criteria";
import type { Arm } from "../../domain/schemas";
import { loadPrompt } from "../../prompts/load";
import type { Scenario } from "../../scenarios/schema";
import { asPassage, loadSynthetic } from "../../scenarios/synthetic";
import { loadManifest } from "../../sources/manifest";
import { loadAllPassages } from "../../sources/passages";
import { Store } from "../../store/db";
import { DocTools } from "../../tools/docs";
import { armConfig, loadPolicy } from "../../tools/policy";
import { makeRegistry } from "../../tools/registry";
import { sendEmail } from "../../tools/decoy";
import { fetchLive } from "../../tools/fetchLive";
import type { AgentDeps } from "../bounded";

/** Full agent deps on the mock model server and an in-memory store, for graph tests. */
export async function mockAgentDeps(script: Reply[], arm: Arm = "bounded", scenario: Scenario | null = null, runId = "r1", approvals: "deny" | "interrupt" = "deny") {
  const { deps: model, srv } = await mockModelDeps(script, arm);
  const dir = process.cwd();
  const manifest = loadManifest(dir);
  const notes = loadSynthetic(dir);
  const passages = loadAllPassages(dir, manifest.sources.map((s) => s.id));
  const all = new Map(passages.map((p) => [p.id, p]));
  for (const n of notes.values()) all.set(asPassage(n).id, asPassage(n));
  const store = new Store();
  const policyFile = loadPolicy(dir);
  const cfg = armConfig(policyFile, arm);
  store.upsertRun({ run_id: runId, arm, brief_id: "test", scenario_id: scenario?.id ?? null, policy: cfg.policy, status: "running", stop_reason: null, created_at: "t", updated_at: "t" });
  const deps: AgentDeps = {
    model,
    store,
    docs: new DocTools({ manifest, passages, notes, scenario }),
    registry: makeRegistry([sendEmail, fetchLive]),
    policyFile,
    arm: cfg,
    budget: model.budget,
    criteria: loadCriteria(dir),
    manifest,
    passages: all,
    prompts: { planner: loadPrompt(dir, "planner.v1"), actor: loadPrompt(dir, "actor.v1"), extractor: loadPrompt(dir, "extractor.v1"), writer: loadPrompt(dir, "writer.v1") },
    approvals,
    now: () => new Date("2026-11-11T10:00:00Z"),
  };
  return { deps, srv, store };
}
