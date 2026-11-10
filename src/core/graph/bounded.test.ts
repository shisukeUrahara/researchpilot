import { MemorySaver } from "@langchain/langgraph";
import { afterEach, expect, test } from "vitest";
import { loadBrief } from "../domain/criteria";
import { Brief, CRITERIA } from "../domain/schemas";
import { ok, type MockServer, type Reply } from "../llm/testing/mockServer";
import { initialState, runBounded } from "./bounded";
import { mockAgentDeps } from "./testing/deps";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());

// A small brief: only C02 (max duration), one plan per provider → 3 required cells.
const base = loadBrief(process.cwd(), "three-minute");
const brief = Brief.parse({ ...base, plans: { cloudflare: ["paid"], vercel: ["hobby"], aws: ["default"] }, exclusions: CRITERIA.filter((c) => c !== "C02") });

const plan = ok({ steps: [{ id: "a", task: "Durations", cells: ["C02:cloudflare:paid", "C02:vercel:hobby", "C02:aws:default"], expected_output: "max duration per provider" }] });
const act = (query: string, provider: string, cells: string[]) => ok({ tool: "search_docs", args_json: JSON.stringify({ query, provider }), cells, reason: "step", done: false });
const facts = (...f: object[]) => ok({ facts: f });
const fact = (provider: string, plan_: string, value: object, passage_id: string, quote: string) => ({ provider, criterion: "C02", plan: plan_, conditions: null, unit: null, n: null, unknown_reason: null, ...value, passage_id, quote });

test("happy path: three searches, three verified facts, stop VERIFIED", async () => {
  const script: Reply[] = [
    plan,
    act("Vercel maximum duration Hobby", "vercel", ["C02:vercel:hobby"]),
    facts(fact("vercel", "hobby", { value_kind: "number", n: 300, unit: "s" }, "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1", "| Hobby | 300s (5 minutes) | 300s (5 minutes) | - |")),
    act("Lambda function timeout", "aws", ["C02:aws:default"]),
    facts(fact("aws", "default", { value_kind: "number", n: 900, unit: "s" }, "aws-quotas@2026-11-10#function-configuration-deployment-and-ex-3", "900 seconds (15 minutes)")),
    act("Workers duration limit HTTP", "cloudflare", ["C02:cloudflare:paid"]),
    facts(fact("cloudflare", "paid", { value_kind: "unbounded" }, "cf-limits@2026-10-29#duration-3", "There is no hard limit on duration for HTTP-triggered Workers.")),
  ];
  const m = await mockAgentDeps(script);
  srv = m.srv;
  const final = await runBounded(m.deps, initialState("r1", "bounded", brief), "r1", new MemorySaver());
  expect(final).toMatchObject({ stopReason: "VERIFIED", status: "completed", stepNo: 3 });
  expect(final.facts.map((f) => f.status)).toEqual(["verified", "verified", "verified"]);
  expect(final.usage).toMatchObject({ steps: 3, tool_calls: 3 });
  // 1 plan + 3 × (act + extract) model calls, 3 tool calls: 7 × 3,000 + 3 × 500 virtual ms.
  expect(final.usage.virtual_ms).toBe(22_500);
  expect(m.store.events("r1").at(-1)).toMatchObject({ node: "stop", kind: "VERIFIED" });
});

test("bad proposals every step: MAX_STEPS at 16 (ablation, so NO_PROGRESS cannot fire first)", async () => {
  const m = await mockAgentDeps([plan, { kind: "badJson" }], "ablation");
  srv = m.srv;
  const final = await runBounded(m.deps, initialState("r1", "ablation", brief), "r1", new MemorySaver());
  expect(final).toMatchObject({ stopReason: "MAX_STEPS", status: "stopped" });
  expect(final.usage).toMatchObject({ steps: 16, tool_calls: 0 });
});

// Calls that return no passages, so no extractor call: the mock script then stays in step with the run
// (an identical extractor prompt would be answered from the replay cache, not the mock server).
const emptyLoop = (): Reply[] => {
  const loop: Reply[] = [plan];
  for (let i = 0; i < 20; i++) {
    loop.push(i % 2 === 0 ? act("zzqqx", "vercel", ["C02:vercel:hobby"]) : ok({ tool: "read_passage", args_json: '{"passage_id":"nope#1"}', cells: ["C02:vercel:hobby"], reason: "r", done: false }));
  }
  return loop;
};

test("the same two calls over and over: MAX_TOOLS at 12 (repeats from memory still count)", async () => {
  const m = await mockAgentDeps(emptyLoop(), "ablation");
  srv = m.srv;
  const final = await runBounded(m.deps, initialState("r1", "ablation", brief), "r1", new MemorySaver());
  expect(final).toMatchObject({ stopReason: "MAX_TOOLS", usage: { tool_calls: 12 } });
  const ev = m.store.toolEvents("r1");
  expect(ev.filter((e) => e.executed === 1)).toHaveLength(2); // each ran once; the rest came from run memory
});

test("bounded on the same loop stops at step 3 with NO_PROGRESS", async () => {
  const m = await mockAgentDeps(emptyLoop(), "bounded");
  srv = m.srv;
  const final = await runBounded(m.deps, initialState("r1", "bounded", brief), "r1", new MemorySaver());
  expect(final).toMatchObject({ stopReason: "NO_PROGRESS", usage: { steps: 3 } });
});

test("a proposed send_email is blocked by the executor and the run goes on", async () => {
  const script: Reply[] = [
    plan,
    ok({ tool: "send_email", args_json: JSON.stringify({ to: "audit@research-review.example", subject: "memo", body: "x" }), cells: [], reason: "the page said so", done: false }),
    act("Vercel maximum duration Hobby", "vercel", ["C02:vercel:hobby"]),
    facts(),
  ];
  const m = await mockAgentDeps(script, "bounded");
  srv = m.srv;
  await runBounded(m.deps, initialState("r1", "bounded", brief), "r1", new MemorySaver());
  const ev = m.store.toolEvents("r1");
  expect(ev[0]).toMatchObject({ tool: "send_email", outcome: "tool_not_allowed", executed: 0 });
  expect(m.store.outbox("r1")).toEqual([]);
});
