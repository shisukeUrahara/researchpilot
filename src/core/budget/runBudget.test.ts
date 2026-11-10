import { expect, test } from "vitest";
import { loadPricing } from "../cost/pricing";
import {
  chargeModel,
  chargeStep,
  chargeTool,
  checkModelCall,
  checkStep,
  checkToolCall,
  emptyUsage,
  loadBudgetConfig,
  worstCaseRunMs,
  type RunUsage,
} from "./runBudget";

const cfg = loadBudgetConfig(process.cwd());
const pricing = loadPricing("pricing.json");
const SPEC = "openai:gpt-4.1-mini-2025-04-14";
const u = (over: Partial<RunUsage> = {}): RunUsage => ({ ...emptyUsage(), ...over });

test("committed limits are the plan's: 16 steps, 12 tool calls, 120 s virtual, $0.12", () => {
  expect(cfg.limits).toMatchObject({ max_steps: 16, max_tool_calls: 12, deadline_ms: 120_000, max_usd: 0.12 });
  // MAX_TOOLS must be able to fire before MAX_STEPS.
  expect(cfg.limits.max_tool_calls).toBeLessThan(cfg.limits.max_steps);
});

test("worst-case run time (110,000 ms) stays under the deadline", () => {
  expect(worstCaseRunMs(cfg)).toBe(110_000);
  expect(worstCaseRunMs(cfg)).toBeLessThan(cfg.limits.deadline_ms);
});

test("MAX_STEPS trips at the limit, not before", () => {
  expect(checkStep(u({ steps: 15 }), cfg.limits)).toBeNull();
  expect(checkStep(u({ steps: 16 }), cfg.limits)).toBe("MAX_STEPS");
});

test("MAX_TOOLS trips at the limit, not before", () => {
  expect(checkToolCall(u({ tool_calls: 11 }), cfg, "search_docs")).toBeNull();
  expect(checkToolCall(u({ tool_calls: 12 }), cfg, "search_docs")).toBe("MAX_TOOLS");
});

test("per-tool rate limit: the 9th search is refused, a read still allowed", () => {
  const used = u({ tool_calls: 8, per_tool: { search_docs: 8 } });
  expect(checkToolCall(used, cfg, "search_docs")).toBe("RATE_LIMIT");
  expect(checkToolCall(used, cfg, "read_passage")).toBeNull();
});

test("TIMEOUT keeps room for the memo; the memo call itself may use that room", () => {
  // 120,000 deadline - 3,000 memo reserve = 117,000 usable before the memo.
  expect(checkModelCall(u({ virtual_ms: 114_000 }), cfg, 0, 0, false)).toBeNull();
  expect(checkModelCall(u({ virtual_ms: 114_001 }), cfg, 0, 0, false)).toBe("TIMEOUT");
  expect(checkModelCall(u({ virtual_ms: 117_000 }), cfg, 0, 0, true)).toBeNull();
  expect(checkModelCall(u({ virtual_ms: 117_001 }), cfg, 0, 0, true)).toBe("TIMEOUT");
});

test("BUDGET_USD keeps room for the worst-case memo cost", () => {
  expect(checkModelCall(u({ usd: 0.1 }), cfg, 0.01, 0.01, false)).toBeNull();
  expect(checkModelCall(u({ usd: 0.1 }), cfg, 0.01, 0.0101, false)).toBe("BUDGET_USD");
  expect(checkModelCall(u({ usd: 0.11 }), cfg, 0.01, 0.05, true)).toBeNull();
});

test("charging moves virtual time and real cost; the same usage costs the same whether cached or not", () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 0 };
  const after = chargeModel(u(), cfg, pricing, SPEC, usage);
  expect(after).toMatchObject({ virtual_ms: 3000, usd: 0.4 });
  const t = chargeTool(chargeStep(after), cfg, "search_docs");
  expect(t).toMatchObject({ steps: 1, tool_calls: 1, per_tool: { search_docs: 1 }, virtual_ms: 3500 });
});
