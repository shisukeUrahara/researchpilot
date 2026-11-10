import type { z } from "zod";
import { chargeModel, checkModelCall, type BudgetConfig, type RunUsage } from "../budget/runBudget";
import { worstCaseUsd, type Pricing } from "../cost/pricing";
import type { StopReason } from "../domain/schemas";
import type { ModelRoles, RoleName } from "../llm/config";
import type { Gateway } from "../llm/gateway";
import { renderMessages } from "../llm/runner";
import type { PromptTemplate } from "../prompts/load";

/** What model calls need. One per run. */
export interface ModelDeps {
  gateway: Gateway;
  roles: ModelRoles;
  pricing: Pricing;
  budget: BudgetConfig;
  /** Keeps arms apart in the replay cache (same prompt in two arms = two cache rows). */
  arm: string;
  signal?: AbortSignal;
}

/** Input size we hold back for the memo call before it is rendered (it is the biggest prompt). */
const MEMO_INPUT_CHARS = 24_000;

export function memoWorstUsd(d: ModelDeps): number {
  const w = d.roles.writer;
  return worstCaseUsd(d.pricing, w.spec, MEMO_INPUT_CHARS, w.params.maxTokens);
}

export type ModelOutcome<T> =
  | { kind: "ok"; value: T; usage: RunUsage; cacheKey: string; cached: boolean }
  | { kind: "invalid"; raw: string | null; usage: RunUsage; cacheKey: string }
  | { kind: "stop"; stop: StopReason; usage: RunUsage };

/**
 * One model call under the run's budget. The budget is checked BEFORE the call (worst case, keeping room
 * for the memo), and charged AFTER at the real cost from `usage` — for cached replies too, so a replay
 * stops at the same step as the live run. Output is parsed by our zod schema; bad output is `invalid`.
 */
export async function callModel<T>(
  d: ModelDeps,
  role: RoleName,
  prompt: PromptTemplate,
  vars: Record<string, string>,
  schema: z.ZodType<T>,
  usage: RunUsage,
  isMemo = false,
): Promise<ModelOutcome<T>> {
  const r = d.roles[role];
  const messages = await renderMessages(prompt.messages, vars);
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  const stop = checkModelCall(usage, d.budget, worstCaseUsd(d.pricing, r.spec, chars, r.params.maxTokens), isMemo ? 0 : memoWorstUsd(d), isMemo);
  if (stop) return { kind: "stop", stop, usage };
  const res = await d.gateway.runStructured({ role: r, messages, schema, schemaName: prompt.name.replace(/\W/g, "_"), arm: d.arm, repeat: 0 }, d.signal);
  const after = chargeModel(usage, d.budget, d.pricing, r.spec, res.usage);
  if (res.raw_text === null) return { kind: "invalid", raw: null, usage: after, cacheKey: res.cache_key };
  let json: unknown;
  try {
    json = JSON.parse(res.raw_text);
  } catch {
    return { kind: "invalid", raw: res.raw_text, usage: after, cacheKey: res.cache_key };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { kind: "ok", value: parsed.data, usage: after, cacheKey: res.cache_key, cached: res.cached }
    : { kind: "invalid", raw: res.raw_text, usage: after, cacheKey: res.cache_key };
}
