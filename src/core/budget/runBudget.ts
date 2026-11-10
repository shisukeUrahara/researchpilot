import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { actualUsd, worstCaseUsd, type Pricing, type Usage } from "../cost/pricing";
import { ToolName, type StopReason } from "../domain/schemas";

export const BudgetConfig = z.object({
  note: z.string(),
  clock: z.object({ model_ms: z.number().int().positive(), tool_ms: z.number().int().positive() }),
  limits: z.object({
    max_steps: z.number().int().positive(),
    max_tool_calls: z.number().int().positive(),
    deadline_ms: z.number().int().positive(),
    max_usd: z.number().positive(),
    per_tool: z.record(ToolName, z.number().int().nonnegative()),
    memo_reserve_ms: z.number().int().nonnegative(),
  }),
});
export type BudgetConfig = z.infer<typeof BudgetConfig>;
export type Limits = BudgetConfig["limits"];

export function loadBudgetConfig(dataDir: string): BudgetConfig {
  return BudgetConfig.parse(JSON.parse(readFileSync(path.join(dataDir, "config", "budgets.json"), "utf8")));
}

/**
 * What a run has used so far. Plain data, so it lives in the LangGraph checkpoint and survives a crash.
 * Time is virtual: each model call and tool call moves it a fixed amount (config/budgets.json clock),
 * so the same run hits TIMEOUT at the same step in live, replay and CI.
 */
export const RunUsageSchema = z.object({
  steps: z.number().int().nonnegative(),
  tool_calls: z.number().int().nonnegative(),
  per_tool: z.record(z.string(), z.number().int().nonnegative()),
  virtual_ms: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
});
export type RunUsage = z.infer<typeof RunUsageSchema>;

export const emptyUsage = (): RunUsage => ({ steps: 0, tool_calls: 0, per_tool: {}, virtual_ms: 0, usd: 0 });

/** A limit that blocks the next action, as a stop reason, or null if the action may go ahead. */
export type Verdict = StopReason | null;

/** May the run start another step? */
export function checkStep(u: RunUsage, l: Limits): Verdict {
  return u.steps >= l.max_steps ? "MAX_STEPS" : null;
}

/**
 * May the run make this model call? Every non-memo call keeps room for the memo (time and money), so a
 * run that stops on a budget can still write its memo without breaking the budget.
 */
export function checkModelCall(u: RunUsage, cfg: BudgetConfig, worstUsd: number, memoWorstUsd: number, isMemo: boolean): Verdict {
  const l = cfg.limits;
  const reserveMs = isMemo ? 0 : l.memo_reserve_ms;
  const reserveUsd = isMemo ? 0 : memoWorstUsd;
  if (u.virtual_ms + cfg.clock.model_ms + reserveMs > l.deadline_ms) return "TIMEOUT";
  if (u.usd + worstUsd + reserveUsd > l.max_usd) return "BUDGET_USD";
  return null;
}

/** May the run make this tool call? Answers from run memory count too. */
export function checkToolCall(u: RunUsage, cfg: BudgetConfig, tool: ToolName): Verdict | "RATE_LIMIT" {
  const l = cfg.limits;
  if (u.tool_calls >= l.max_tool_calls) return "MAX_TOOLS";
  if ((u.per_tool[tool] ?? 0) >= (l.per_tool[tool] ?? 0)) return "RATE_LIMIT";
  if (u.virtual_ms + cfg.clock.tool_ms + l.memo_reserve_ms > l.deadline_ms) return "TIMEOUT";
  return null;
}

/** Charges a model call at its real cost. Called for cached calls too, so budgets replay exactly. */
export function chargeModel(u: RunUsage, cfg: BudgetConfig, pricing: Pricing, spec: string, usage: Usage): RunUsage {
  return { ...u, virtual_ms: u.virtual_ms + cfg.clock.model_ms, usd: u.usd + actualUsd(pricing, spec, usage) };
}

export function chargeTool(u: RunUsage, cfg: BudgetConfig, tool: ToolName): RunUsage {
  return {
    ...u,
    tool_calls: u.tool_calls + 1,
    per_tool: { ...u.per_tool, [tool]: (u.per_tool[tool] ?? 0) + 1 },
    virtual_ms: u.virtual_ms + cfg.clock.tool_ms,
  };
}

export const chargeStep = (u: RunUsage): RunUsage => ({ ...u, steps: u.steps + 1 });

/** Worst-case cost of a call before it is made (full output budget). */
export const worstCallUsd = worstCaseUsd;

/**
 * Longest a run can take in virtual time: every step is one actor call, one tool call and one
 * extractor call, plus the plan and the memo. Must stay under the deadline, or golden runs could
 * hit TIMEOUT by accident.
 */
export function worstCaseRunMs(cfg: BudgetConfig): number {
  const { model_ms, tool_ms } = cfg.clock;
  return cfg.limits.max_steps * (model_ms + tool_ms + model_ms) + model_ms + model_ms;
}
