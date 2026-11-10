import { beforeEach, expect, test } from "vitest";
import { emptyUsage, loadBudgetConfig, type RunUsage } from "../budget/runBudget";
import type { Proposal } from "../domain/schemas";
import { loadScenarios } from "../scenarios/schema";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { Store } from "../store/db";
import { DocTools } from "../tools/docs";
import { loadPolicy } from "../tools/policy";
import { makeRegistry } from "../tools/registry";
import { execute, type ExecContext } from "./executor";

const dir = process.cwd();
const manifest = loadManifest(dir);
const world = { manifest, passages: loadAllPassages(dir, manifest.sources.map((s) => s.id)), notes: loadSynthetic(dir) };
const scenarios = new Map(loadScenarios(dir).map((s) => [s.id, s]));
let store: Store;

beforeEach(() => {
  store = new Store();
  store.upsertRun({ run_id: "r1", arm: "bounded", brief_id: "three-minute", scenario_id: null, policy: "strict", status: "running", stop_reason: null, created_at: "t", updated_at: "t" });
});

const ctx = (over: Partial<ExecContext> = {}, scenario: string | null = null): ExecContext => ({
  runId: "r1",
  stepNo: 1,
  policyFile: loadPolicy(dir),
  policy: "strict",
  registry: makeRegistry(),
  docs: new DocTools({ ...world, scenario: scenario ? scenarios.get(scenario)! : null }),
  store,
  budget: loadBudgetConfig(dir),
  usage: emptyUsage(),
  approved: new Set(),
  ...over,
});
const prop = (tool: Proposal["tool"], args: unknown): Proposal => ({ tool, args_json: typeof args === "string" ? args : JSON.stringify(args), cells: [], reason: "r", done: false });
const search = prop("search_docs", { query: "Lambda function timeout", provider: "aws" });

test("a normal search runs, is charged once and recorded", () => {
  const r = execute(search, ctx());
  expect(r).toMatchObject({ outcome: "ok", executed: true, usage: { tool_calls: 1, virtual_ms: 500 } });
  expect((r.result as { results: unknown[] }).results.length).toBeGreaterThan(0);
  expect(store.toolEvents("r1")).toHaveLength(1);
  expect(store.events("r1")[0]).toMatchObject({ node: "execute", kind: "ok", request_id: expect.stringMatching(/^req_[0-9a-f]{16}$/) });
});

test("the same step re-run (after a crash) runs nothing twice and charges the same", () => {
  const first = execute(search, ctx());
  const again = execute(search, ctx());
  expect(again).toMatchObject({ outcome: "ok", executed: false, usage: first.usage });
  expect(store.toolEvents("r1")).toHaveLength(1);
});

test("the same call in a later step is answered from run memory and counted", () => {
  execute(search, ctx());
  const later = execute(search, ctx({ stepNo: 2, usage: { ...emptyUsage(), tool_calls: 1 } }));
  expect(later).toMatchObject({ outcome: "from_memory", executed: false, usage: { tool_calls: 2 } });
});

test("the decoy is blocked under strict and the attempt is recorded", () => {
  const r = execute(prop("send_email", { to: "a@b.example", subject: "s", body: "b" }), ctx());
  expect(r).toMatchObject({ outcome: "tool_not_allowed", executed: false, usage: emptyUsage() });
  expect(store.toolEvents("r1")[0]).toMatchObject({ tool: "send_email", executed: 0, outcome: "tool_not_allowed" });
});

test("bad args are tool_args_invalid; nothing runs, nothing is charged", () => {
  const r = execute(prop("search_docs", "{not json"), ctx());
  expect(r).toMatchObject({ outcome: "tool_args_invalid", executed: false, usage: emptyUsage() });
});

test("budget is checked before the tool runs: MAX_TOOLS stops the run", () => {
  const full: RunUsage = { ...emptyUsage(), tool_calls: 12 };
  const r = execute(search, ctx({ usage: full }));
  expect(r).toMatchObject({ outcome: "budget_exceeded", executed: false, stop: "MAX_TOOLS" });
});

test("a per-tool rate limit blocks the call without ending the run", () => {
  const r = execute(search, ctx({ usage: { ...emptyUsage(), tool_calls: 8, per_tool: { search_docs: 8 } } }));
  expect(r).toMatchObject({ outcome: "budget_exceeded", stop: null, error: "RATE_LIMIT" });
});

test("malformed tool output becomes tool_malformed; an unavailable source becomes tool_unavailable", () => {
  const bad = execute(prop("search_docs", { query: "Workers CPU time memory", provider: "cloudflare" }), ctx({}, "malformed-02"));
  expect(bad).toMatchObject({ outcome: "tool_malformed", executed: true, result: null });
  const gone = execute(prop("read_passage", { passage_id: "cf-limits@2026-10-29#memory-1" }), ctx({ stepNo: 2 }, "unavail-02"));
  expect(gone).toMatchObject({ outcome: "tool_unavailable", executed: true });
});

test("every request id in a run is unique", () => {
  for (let step = 1; step <= 4; step++) execute(prop("search_docs", { query: `limit ${step}`, provider: null }), ctx({ stepNo: step }));
  const ids = store.events("r1").map((e) => e.request_id);
  expect(new Set(ids).size).toBe(ids.length);
});
