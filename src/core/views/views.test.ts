import { describe, expect, test } from "vitest";
import { loadBudgetConfig } from "../budget/runBudget";
import type { FactRecord, Memo } from "../domain/schemas";
import type { AgentState } from "../graph/state";
import type { SetMetrics } from "../grade/report";
import { rate } from "../metrics/eval";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import type { EventRow, RunRow } from "../store/db";
import { evalsView } from "./evals";
import { memoMarkdown, memoView } from "./memo";
import { meters, runView } from "./run";

const limits = loadBudgetConfig(process.cwd()).limits;
const manifest = loadManifest(process.cwd());
const passages = new Map(loadAllPassages(process.cwd(), manifest.sources.map((s) => s.id)).map((p) => [p.id, p]));
const fact = (id: string, passage_id: string, n: number, plan = "hobby"): FactRecord => ({ id, step_no: 1, provider: "vercel", criterion: "C02", plan, conditions: null, value: { kind: "number", n, unit: "s" }, passage_id, quote: `${n}s`, status: "verified", reject_reason: null }) as FactRecord;
const state = (over: Partial<AgentState> = {}): AgentState =>
  ({
    runId: "r1",
    arm: "bounded",
    brief: null,
    required: [],
    plan: [
      { id: "s1", task: "Vercel durations", cells: ["C02:vercel:hobby"], expected_output: "e" },
      { id: "s2", task: "Lambda", cells: ["C02:aws:default"], expected_output: "e" },
    ],
    stepNo: 2,
    usage: { steps: 13, tool_calls: 12, per_tool: {}, virtual_ms: 60_000, usd: 0.03 },
    facts: [fact("a", "vc-limits-2025@2025-03-08#max-duration-3", 60), fact("b", "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1", 300)],
    conflicts: [],
    stepTries: { s2: 3 },
    stopReason: "MAX_TOOLS",
    status: "stopped",
    ...over,
  }) as unknown as AgentState;
const row: RunRow = { run_id: "r1", arm: "bounded", brief_id: "three-minute", scenario_id: null, policy: "strict", status: "stopped", stop_reason: "MAX_TOOLS", created_at: "t", updated_at: "t" };

describe("run view", () => {
  test("meters turn amber at 80% and coral at the limit", () => {
    const m = meters({ steps: 13, tool_calls: 12, per_tool: {}, virtual_ms: 10_000, usd: 0.01 }, limits);
    expect(m.map((x) => x.tone)).toEqual(["near", "hit", "ok", "ok"]);
  });

  test("plan board: a step whose cells are all resolved is verified; one that used its tries is blocked", () => {
    const v = runView(row, state(), [], [], limits);
    expect(v.plan.verified.map((c) => c.id)).toEqual(["s1"]);
    expect(v.plan.blocked.map((c) => c.id)).toEqual(["s2"]);
  });

  test("a blocked decoy shows as a coral timeline row with the executor's words", () => {
    const e: EventRow = { run_id: "r1", step_no: 2, node: "execute", seq: 0, kind: "tool_not_allowed", request_id: "req_x", virtual_ms: 6000, detail_json: JSON.stringify({ tool: "send_email", executed: false }) };
    const v = runView(row, state(), [e], [{ run_id: "r1", step_no: 2, args_hash: "h", tool: "send_email", args_json: "{}", outcome: "tool_not_allowed", executed: 0, result_json: null, request_id: "req_x", virtual_ms: 6000 }], limits);
    expect(v.timeline[0]).toMatchObject({ tone: "danger", detail: "Blocked by executor: send_email is not on this run's allowlist" });
    expect(v.blockedAttempts).toBe(1);
  });
});

describe("memo view", () => {
  const memo: Memo & { disclaimer: string } = {
    summary: "s",
    verdicts: [{ provider: "vercel", verdict: "fits", plan: null, reasons: "300 s" }],
    claims: [{ provider: "vercel", criterion: "C02", plan: "hobby", value_kind: "number", n: 300, unit: "s", unknown_reason: null, text: "Hobby 300 s", passage_id: null }],
    unknowns: [],
    assumptions: [],
    disclaimer: "Not a recommendation.",
  };

  test("a number opens to its quote, passage, page date and source; the conflict shows used vs superseded", () => {
    const v = memoView(state(), memo, manifest, passages, []);
    expect(v.claims[0].evidence).toMatchObject({ source: "vc-limits", pageDate: "2026-08-24", dateKind: "page", kind: "docs" });
    expect(v.conflicts[0].sides.map((s) => [s.value, s.kind, s.used])).toEqual([
      ["300 s", "docs", true],
      ["60 s", "archive", false],
    ]);
    expect(memoMarkdown("r1", v)).toContain("| C02:vercel:hobby | 300 s | vc-limits | 2026-08-24 (page) |");
  });
});

test("evals view: each cell names its run set; missing sets show a dash", () => {
  const m = (set: string): SetMetrics => ({
    run_set: set,
    arm: { runs: 40, task_success: rate(20, 40), coverage: rate(80, 100), unknown_correct: rate(9, 10), raw_claim_support: rate(90, 100), downgraded_by_check: 0, median_tool_calls: 9, redundant_call_rate: rate(1, 10), budget_compliance: rate(40, 40), stop_reasons: { VERIFIED: 30, NO_PROGRESS: 10 }, no_progress_stops: rate(4, 4), stale_as_current: 0, invented_price: 0, usd_total: 1, usd_mean: 0.025 },
    injection: null,
    failures: [],
  });
  const v = evalsView({ "eval-bounded": m("eval-bounded") }, null);
  const success = v.rows.find((r) => r.label === "Task success")!;
  expect(success.cells.bounded).toMatchObject({ text: "50.0%", set: "eval-bounded" });
  expect(success.cells.naive.text).toBe("—");
});
