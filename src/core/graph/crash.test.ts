import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { ResponseCache } from "../llm/cache";
import { ok, startMockServer, type MockServer, type Reply } from "../llm/testing/mockServer";
import { openStore } from "../store/db";
import { continueRun, requestFor, startRun, type RunnerEnv } from "./runner";
import type { AgentState } from "./state";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());
const tmp = (p: string) => mkdtempSync(path.join(tmpdir(), p));
const NOW = () => new Date("2026-11-11T10:00:00Z");

const act = (query: string, provider: string, cells: string[]) => ok({ tool: "search_docs", args_json: JSON.stringify({ query, provider }), cells, reason: "r", done: false });
const fact = (provider: string, plan: string, value: object, passage_id: string, quote: string) =>
  ok({ facts: [{ provider, criterion: "C02", plan, conditions: null, unit: null, n: null, ...value, passage_id, quote }] });
const script: Reply[] = [
  ok({ steps: [{ id: "a", task: "Durations", cells: ["C02:cloudflare:paid", "C02:vercel:hobby", "C02:aws:default"], expected_output: "max duration" }] }),
  act("Vercel maximum duration Hobby", "vercel", ["C02:vercel:hobby"]),
  fact("vercel", "hobby", { value_kind: "number", n: 300, unit: "s" }, "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1", "| Hobby | 300s (5 minutes) | 300s (5 minutes) | - |"),
  act("Lambda function timeout", "aws", ["C02:aws:default"]),
  fact("aws", "default", { value_kind: "number", n: 900, unit: "s" }, "aws-quotas@2026-11-10#function-configuration-deployment-and-ex-3", "900 seconds (15 minutes)"),
  act("zzqqx yyqqw", "cloudflare", ["C02:cloudflare:paid"]),
  act("zzqqv yyqqk", "cloudflare", ["C02:cloudflare:paid"]),
  act("Workers duration limit HTTP", "cloudflare", ["C02:cloudflare:paid"]),
  fact("cloudflare", "paid", { value_kind: "unbounded" }, "cf-limits@2026-10-29#duration-3", "There is no hard limit on duration for HTTP-triggered Workers."),
  ok({ summary: "s", verdicts: [], claims: [], unknowns: [], assumptions: [] }),
];

/** What must match between an uninterrupted run and a crashed-then-resumed one (no times, no ids). */
function essence(s: AgentState, stateDir: string, runId: string) {
  const store = openStore(stateDir);
  const tools = store.toolEvents(runId).map((e) => [e.step_no, e.tool, e.args_hash, e.outcome, e.executed]);
  store.close();
  return {
    stopReason: s.stopReason,
    usage: s.usage,
    facts: s.facts.map((f) => [f.criterion, f.provider, f.plan, f.value, f.passage_id, f.status]),
    conflicts: s.conflicts,
    tools,
  };
}

test("SIGKILL at step 4, then resume: same final state as an uninterrupted run, no duplicate tool calls", async () => {
  srv = await startMockServer(script);
  const cacheDir = path.join(tmp("rp-cache-"), "llm");
  const live: RunnerEnv = { dataDir: process.cwd(), stateDir: tmp("rp-a-"), apiKey: "sk-test", cache: new ResponseCache(cacheDir), maxUsd: 1, now: NOW, baseURL: srv.baseURL };

  // 1. The reference run, uninterrupted. It also fills the replay cache.
  const ref = await startRun(live, { arm: "bounded", briefId: "duration-only", approvals: "deny", runId: "run_crash" });
  expect(ref.state.stopReason).toBe("VERIFIED");

  // 2. The same run in a child process, from the cache, killed at the start of step 4.
  const stateB = tmp("rp-b-");
  const child = spawnSync(process.execPath, ["--import", "tsx", path.join(__dirname, "testing", "crashRun.ts"), stateB, cacheDir, "run_crash"], { encoding: "utf8" });
  expect(child.signal).toBe("SIGKILL");
  const before = openStore(stateB);
  expect(before.getRun("run_crash")!.status).toBe("running"); // the kill left it mid-run
  const stepsDone = Math.max(...before.toolEvents("run_crash").map((e) => e.step_no));
  before.close();
  expect(stepsDone).toBe(3);

  // 3. Resume from the checkpoint, replay only.
  const replay: RunnerEnv = { ...live, stateDir: stateB, apiKey: null, baseURL: undefined, cache: new ResponseCache(cacheDir) };
  const store = openStore(stateB);
  const req = requestFor(store, "run_crash", process.cwd());
  store.close();
  const resumed = await continueRun(replay, { ...req, approvals: "deny" }, null);

  expect(essence(resumed.state, stateB, "run_crash")).toEqual(essence(ref.state, live.stateDir, "run_crash"));
}, 60_000);
