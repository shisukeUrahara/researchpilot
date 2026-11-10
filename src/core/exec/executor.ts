import { chargeTool, checkToolCall, type BudgetConfig, type RunUsage } from "../budget/runBudget";
import type { Proposal, StopReason } from "../domain/schemas";
import { canonicalJson } from "../prompts/canonical";
import { argsHash, recordEvent, requestId } from "../run/events";
import type { Store, ToolEventRow } from "../store/db";
import type { DocTools } from "../tools/docs";
import { isAllowed, type PolicyFile, type PolicyName } from "../tools/policy";
import { parseToolArgs, type Registry } from "../tools/registry";

export type Outcome =
  | "ok"
  | "from_memory"
  | "tool_args_invalid"
  | "tool_not_allowed"
  | "tool_unavailable"
  | "tool_malformed"
  | "budget_exceeded"
  | "needs_approval";

export interface ExecContext {
  runId: string;
  stepNo: number;
  policyFile: PolicyFile;
  policy: PolicyName;
  registry: Registry;
  docs: DocTools;
  store: Store;
  budget: BudgetConfig;
  usage: RunUsage;
  /** Action fingerprints a person approved for this run (fetch_live). */
  approved: ReadonlySet<string>;
}

export interface ExecResult {
  outcome: Outcome;
  /** True only when the tool really ran now. */
  executed: boolean;
  tool: Proposal["tool"];
  argsHash: string | null;
  /** Parsed tool output, or null when there is none (blocked, malformed, invalid args). */
  result: unknown;
  error: string | null;
  usage: RunUsage;
  /** Set when a budget ends the run. */
  stop: StopReason | null;
}

/**
 * The only way a tool runs. Order matters and every check is code, not prompt:
 * 1 parse args with the tool's schema · 2 allowlist · 3 approval · 4 budget · 5 idempotency (same step,
 * same args → the stored result, so a node re-run after a crash runs nothing twice) · 6 run memory
 * (same args earlier in the run → the stored result, counted as a redundant call) · 7 run · 8 normalize
 * the output · 9 record. Blocked attempts are recorded too: attempts ≠ executions.
 */
export function execute(p: Proposal, ctx: ExecContext): ExecResult {
  const spec = ctx.registry.get(p.tool);
  const base = { tool: p.tool, usage: ctx.usage, stop: null as StopReason | null };
  if (!spec) return finish(ctx, { ...base, outcome: "tool_not_allowed", executed: false, argsHash: null, result: null, error: `${p.tool} is not registered` }, p, null);

  const parsed = parseToolArgs(spec, p.args_json);
  if (!parsed.ok) return finish(ctx, { ...base, outcome: "tool_args_invalid", executed: false, argsHash: null, result: null, error: parsed.error }, p, null);
  const hash = argsHash(p.tool, parsed.args);

  if (!isAllowed(ctx.policyFile, ctx.policy, p.tool)) {
    return finish(ctx, { ...base, outcome: "tool_not_allowed", executed: false, argsHash: hash, result: null, error: `${p.tool} is not on this run's allowlist (${ctx.policy})` }, p, parsed.args);
  }
  if (spec.needsApproval && !ctx.approved.has(hash)) {
    return finish(ctx, { ...base, outcome: "needs_approval", executed: false, argsHash: hash, result: null, error: "this exact action needs approval" }, p, parsed.args);
  }

  // Idempotency: this step already ran this call (the node is re-running after a crash or resume).
  const same = ctx.store.getToolEvent(ctx.runId, ctx.stepNo, hash);
  if (same) return replayStored(same, ctx, base, hash);

  const limit = checkToolCall(ctx.usage, ctx.budget, p.tool);
  if (limit) {
    const stop = limit === "RATE_LIMIT" ? null : limit;
    return finish(ctx, { ...base, outcome: "budget_exceeded", executed: false, argsHash: hash, result: null, error: limit, stop }, p, parsed.args);
  }
  const usage = chargeTool(ctx.usage, ctx.budget, p.tool);

  // Run memory: the same call earlier in this run is answered from what it returned then.
  const earlier = ctx.store.toolEvents(ctx.runId).find((e) => e.args_hash === hash && e.executed === 1);
  if (earlier) {
    return finish(ctx, { ...base, usage, outcome: "from_memory", executed: false, argsHash: hash, result: earlier.result_json ? JSON.parse(earlier.result_json) : null, error: null }, p, parsed.args, earlier.result_json);
  }

  const raw = spec.run(parsed.args as never, { docs: ctx.docs, step: ctx.stepNo });
  let result: unknown;
  try {
    result = JSON.parse(raw);
  } catch {
    return finish(ctx, { ...base, usage, outcome: "tool_malformed", executed: true, argsHash: hash, result: null, error: "tool returned invalid JSON" }, p, parsed.args, null);
  }
  const err = (result as { error?: string }).error;
  if (err === "unavailable" || err === "not_found") {
    return finish(ctx, { ...base, usage, outcome: "tool_unavailable", executed: true, argsHash: hash, result, error: err }, p, parsed.args, raw);
  }
  return finish(ctx, { ...base, usage, outcome: "ok", executed: true, argsHash: hash, result, error: null }, p, parsed.args, raw);
}

/** Outcomes that used a tool call when they first happened. */
const CHARGED = new Set(["ok", "from_memory", "tool_unavailable", "tool_malformed"]);

/**
 * A re-run of the same step: return what the first run stored and charge the same budget again, because
 * the checkpoint the node re-runs from holds the usage from before this step.
 */
function replayStored(e: ToolEventRow, ctx: ExecContext, base: { tool: Proposal["tool"]; usage: RunUsage; stop: StopReason | null }, hash: string): ExecResult {
  return {
    ...base,
    usage: CHARGED.has(e.outcome) ? chargeTool(ctx.usage, ctx.budget, base.tool) : ctx.usage,
    outcome: e.outcome as Outcome,
    executed: false,
    argsHash: hash,
    result: e.result_json ? JSON.parse(e.result_json) : null,
    error: e.outcome === "ok" || e.outcome === "from_memory" ? null : e.outcome,
  };
}

/** Records the tool event and its timeline event. Blocked and invalid calls get a row too. */
function finish(ctx: ExecContext, r: ExecResult, p: Proposal, args: unknown, raw: string | null = null): ExecResult {
  const hash = r.argsHash ?? "invalid:" + canonicalJson(p.args_json).slice(0, 40);
  ctx.store.insertToolEvent({
    run_id: ctx.runId,
    step_no: ctx.stepNo,
    args_hash: hash,
    tool: p.tool,
    args_json: args === null ? p.args_json : canonicalJson(args),
    outcome: r.outcome,
    executed: r.executed ? 1 : 0,
    result_json: raw,
    request_id: requestId(ctx.runId, ctx.stepNo, "execute", 0),
    virtual_ms: r.usage.virtual_ms,
  });
  recordEvent(ctx.store, {
    runId: ctx.runId,
    stepNo: ctx.stepNo,
    node: "execute",
    seq: 0,
    kind: r.outcome,
    virtualMs: r.usage.virtual_ms,
    detail: { tool: p.tool, args_hash: hash, executed: r.executed, error: r.error },
  });
  return r;
}
