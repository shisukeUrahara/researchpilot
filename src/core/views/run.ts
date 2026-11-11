import type { Limits, RunUsage } from "../budget/runBudget";
import type { PlanStep } from "../domain/schemas";
import type { AgentState } from "../graph/state";
import type { EventRow, RunRow, ToolEventRow } from "../store/db";

export interface Meter {
  label: string;
  used: number;
  max: number;
  /** ok < 80%, near ≥ 80%, hit at the limit. */
  tone: "ok" | "near" | "hit";
  text: string;
}

export interface PlanCard {
  id: string;
  task: string;
  open: string[];
  done: string[];
}

export interface TimelineRow {
  key: string;
  ms: number;
  step: number;
  node: string;
  kind: string;
  tool: string | null;
  /** Short, safe text: tool name, cells, counts. Never page text. */
  detail: string;
  tone: "ok" | "warn" | "danger" | "muted";
}

export interface RunView {
  runId: string;
  arm: string;
  policy: string;
  briefId: string;
  status: string;
  stopReason: string | null;
  meters: Meter[];
  plan: { planned: PlanCard[]; running: PlanCard[]; verified: PlanCard[]; blocked: PlanCard[] };
  timeline: TimelineRow[];
  counts: { verified: number; rejected: number; unchecked: number; conflicts: number };
  blockedAttempts: number;
}

function meter(label: string, used: number, max: number, text: string): Meter {
  const r = max === 0 ? 1 : used / max;
  return { label, used, max, tone: r >= 1 ? "hit" : r >= 0.8 ? "near" : "ok", text };
}

export function meters(u: RunUsage, l: Limits): Meter[] {
  return [
    meter("Steps", u.steps, l.max_steps, `${u.steps} / ${l.max_steps}`),
    meter("Tool calls", u.tool_calls, l.max_tool_calls, `${u.tool_calls} / ${l.max_tool_calls}`),
    meter("Time (virtual)", u.virtual_ms, l.deadline_ms, `${(u.virtual_ms / 1000).toFixed(1)} s / ${l.deadline_ms / 1000} s`),
    meter("Cost", u.usd, l.max_usd, `$${u.usd.toFixed(4)} / $${l.max_usd.toFixed(2)}`),
  ];
}

const TONE: Record<string, TimelineRow["tone"]> = {
  ok: "ok",
  facts: "ok",
  VERIFIED: "ok",
  memo: "ok",
  plan: "muted",
  proposal: "muted",
  continue: "muted",
  from_memory: "warn",
  needs_approval: "warn",
  tool_unavailable: "warn",
  tool_malformed: "warn",
  budget_exceeded: "warn",
  NO_PROGRESS: "warn",
  TIMEOUT: "warn",
  MAX_STEPS: "warn",
  MAX_TOOLS: "warn",
  tool_not_allowed: "danger",
  tool_args_invalid: "danger",
  CANCELLED: "danger",
  ERROR: "danger",
};

function detailOf(e: EventRow): { tool: string | null; text: string } {
  const d = JSON.parse(e.detail_json) as Record<string, unknown>;
  if (e.node === "execute") {
    const tool = String(d.tool ?? "");
    if (e.kind === "tool_not_allowed") return { tool, text: `Blocked by executor: ${tool} is not on this run's allowlist` };
    return { tool, text: d.error ? `${tool} · ${d.error}` : tool };
  }
  if (e.node === "act") return { tool: (d.tool as string) ?? null, text: d.done ? "says done" : `${d.tool ?? ""} → ${((d.cells as string[]) ?? []).slice(0, 3).join(", ")}${((d.cells as string[]) ?? []).length > 3 ? " …" : ""}` };
  if (e.node === "extract") {
    const rej = Array.isArray(d.rejected) ? d.rejected.length : Number(d.rejected ?? 0);
    return { tool: null, text: `${d.verified ?? 0} verified · ${rej} rejected${d.unchecked ? ` · ${d.unchecked} unchecked` : ""}` };
  }
  if (e.node === "assess") return { tool: null, text: `${d.resolved}/${d.required} cells resolved` };
  if (e.node === "plan") return { tool: null, text: `${d.steps} plan steps` };
  if (e.node === "stop") return { tool: null, text: `${d.steps} steps · ${d.tool_calls} tool calls · $${Number(d.usd ?? 0).toFixed(4)}` };
  if (e.node === "memo") return { tool: null, text: `${d.claims ?? 0} claims · ${d.downgraded ?? 0} removed by check` };
  return { tool: null, text: "" };
}

/** Everything the Run page shows for one run. Pure: same inputs, same view. */
export function runView(row: RunRow, state: AgentState | null, events: EventRow[], tools: ToolEventRow[], limits: Limits): RunView {
  const resolvedCells = new Set<string>();
  if (state) for (const f of state.facts) if (f.status !== "rejected") resolvedCells.add(`${f.criterion}:${f.provider}:${f.plan}`);
  const tries = state?.stepTries ?? {};
  const plan = { planned: [] as PlanCard[], running: [] as PlanCard[], verified: [] as PlanCard[], blocked: [] as PlanCard[] };
  let runningPicked = false;
  for (const s of state?.plan ?? ([] as PlanStep[])) {
    const card: PlanCard = { id: s.id, task: s.task, open: s.cells.filter((c) => !resolvedCells.has(c)), done: s.cells.filter((c) => resolvedCells.has(c)) };
    if (card.open.length === 0) plan.verified.push(card);
    else if ((tries[s.id] ?? 0) >= 3 || (state?.stopReason && (tries[s.id] ?? 0) > 0)) plan.blocked.push(card);
    else if (!runningPicked && (tries[s.id] ?? 0) > 0 && !state?.stopReason) {
      plan.running.push(card);
      runningPicked = true;
    } else plan.planned.push(card);
  }
  const timeline = events.map((e) => {
    const d = detailOf(e);
    return { key: `${e.step_no}-${e.node}-${e.seq}`, ms: e.virtual_ms, step: e.step_no, node: e.node, kind: e.kind, tool: d.tool, detail: d.text, tone: TONE[e.kind] ?? "muted" };
  });
  const facts = state?.facts ?? [];
  return {
    runId: row.run_id,
    arm: row.arm,
    policy: row.policy,
    briefId: row.brief_id,
    status: row.status,
    stopReason: row.stop_reason,
    meters: meters(state?.usage ?? { steps: 0, tool_calls: 0, per_tool: {}, virtual_ms: 0, usd: 0 }, limits),
    plan,
    timeline,
    counts: {
      verified: facts.filter((f) => f.status === "verified").length,
      rejected: facts.filter((f) => f.status === "rejected").length,
      unchecked: facts.filter((f) => f.status === "unchecked").length,
      conflicts: state?.conflicts.length ?? 0,
    },
    blockedAttempts: tools.filter((t) => t.outcome === "tool_not_allowed").length,
  };
}
