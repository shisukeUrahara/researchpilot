import { Annotation, END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import { approvedActions } from "../approvals/approvals";
import { chargeStep, checkStep, emptyUsage, type BudgetConfig, type RunUsage } from "../budget/runBudget";
import type { CriteriaFile } from "../domain/criteria";
import { requiredCells, type Arm, type Brief, type Conflict, type FactRecord, type Memo, type PlanStep, type RunStatus, type StopReason } from "../domain/schemas";
import { addFacts, buildLedger } from "../evidence/ledger";
import { execute } from "../exec/executor";
import type { PromptTemplate } from "../prompts/load";
import { recordEvent } from "../run/events";
import { statusFor } from "../run/status";
import type { Manifest } from "../sources/manifest";
import type { Passage } from "../sources/passages";
import type { Store } from "../store/db";
import type { DocTools } from "../tools/docs";
import type { ArmConfig, PolicyFile } from "../tools/policy";
import type { Registry } from "../tools/registry";
import type { ModelDeps } from "./model";
import { actNode } from "./nodes/act";
import { extractNode, rowsOf } from "./nodes/extract";
import { planNode } from "./nodes/plan";
import { assessStep, noteLookups, noteUnavailable, resolvedCells } from "./progress";
import type { AgentState, LastCall } from "./state";

/** Everything a run needs from outside. Built once per run. */
export interface AgentDeps {
  model: ModelDeps;
  store: Store;
  docs: DocTools;
  registry: Registry;
  policyFile: PolicyFile;
  arm: ArmConfig;
  budget: BudgetConfig;
  criteria: CriteriaFile;
  manifest: Manifest;
  passages: ReadonlyMap<string, Passage>;
  prompts: { planner: PromptTemplate; actor: PromptTemplate; extractor: PromptTemplate };
  now: () => Date;
}

const keep = <T>(fallback: () => T) => Annotation<T>({ reducer: (_a, b) => b, default: fallback });

/** The agent state as LangGraph channels: every field is replaced by the node that returns it. */
export const AgentAnnotation = Annotation.Root({
  runId: keep<string>(() => ""),
  arm: keep<Arm>(() => "bounded"),
  brief: keep<Brief>(() => null as unknown as Brief),
  required: keep<string[]>(() => []),
  plan: keep<PlanStep[]>(() => []),
  stepNo: keep<number>(() => 0),
  usage: keep<RunUsage>(emptyUsage),
  facts: keep<FactRecord[]>(() => []),
  conflicts: keep<Conflict[]>(() => []),
  seenPassages: keep<string[]>(() => []),
  cellQueries: keep<Record<string, string[]>>(() => ({})),
  unavailableCells: keep<string[]>(() => []),
  noProgress: keep<number>(() => 0),
  last: keep<LastCall | null>(() => null),
  memo: keep<Memo | null>(() => null),
  status: keep<RunStatus>(() => "running"),
  stopReason: keep<StopReason | null>(() => null),
});
type S = typeof AgentAnnotation.State;

export function initialState(runId: string, arm: Arm, brief: Brief): AgentState {
  return {
    runId,
    arm,
    brief,
    required: requiredCells(brief),
    plan: [],
    stepNo: 0,
    usage: emptyUsage(),
    facts: [],
    conflicts: [],
    seenPassages: [],
    cellQueries: {},
    unavailableCells: [],
    noProgress: 0,
    last: null,
    memo: null,
    status: "running",
    stopReason: null,
  };
}

/**
 * The bounded research agent: planner → [act → execute → extract (+ assess)] → stop.
 * Every limit is checked in code: steps in `act`, tool calls and rate limits in the executor, time and
 * money before every model call. The model only proposes; it cannot skip a check or pick a stop reason.
 */
export function buildBoundedGraph(d: AgentDeps) {
  const providerOf = (sourceId: string) => d.manifest.sources.find((s) => s.id === sourceId)?.provider ?? null;
  const official = new Set(d.manifest.sources.map((s) => s.id));
  const ledgerOf = (facts: FactRecord[]) => buildLedger(facts, d.manifest);
  const event = (s: S, node: string, kind: string, detail: Record<string, unknown>, usage = s.usage, seq = 0) =>
    recordEvent(d.store, { runId: s.runId, stepNo: s.stepNo, node, seq, kind, virtualMs: usage.virtual_ms, detail });
  const stop = (s: S, reason: StopReason, usage: RunUsage = s.usage): Partial<S> => {
    event(s, "stop", reason, { steps: usage.steps, tool_calls: usage.tool_calls, usd: Number(usage.usd.toFixed(6)) }, usage);
    return { usage, stopReason: reason, status: statusFor(reason) };
  };

  const plan = async (s: S): Promise<Partial<S>> => {
    if (!d.arm.planner) return {};
    const r = await planNode(d.model, { brief: s.brief, required: s.required, criteria: d.criteria, manifest: d.manifest, prompt: d.prompts.planner, usage: s.usage });
    event(s, "plan", r.invalid ? "plan_invalid" : "plan", { steps: r.plan.length }, r.usage);
    return r.stop ? { plan: r.plan, ...stop(s, r.stop, r.usage) } : { plan: r.plan, usage: r.usage };
  };

  const act = async (s: S): Promise<Partial<S>> => {
    const limit = checkStep(s.usage, d.budget.limits);
    if (limit) return stop(s, limit);
    const next = { ...s, stepNo: s.stepNo + 1, usage: chargeStep(s.usage) };
    const resolved = resolvedCells(s.required, ledgerOf(s.facts), s.cellQueries, s.unavailableCells);
    const r = await actNode(d.model, { question: s.brief.question, plan: s.plan, required: s.required, resolved, history: d.store.toolEvents(s.runId), usage: next.usage, budget: d.budget, prompt: d.prompts.actor });
    if (r.kind === "stop") return { stepNo: next.stepNo, ...stop(next, r.stop, r.usage) };
    if (r.kind === "invalid") {
      event(next, "act", "proposal_invalid", {}, r.usage);
      return { stepNo: next.stepNo, usage: r.usage, last: null };
    }
    event(next, "act", r.proposal.done ? "done" : "proposal", { tool: r.proposal.tool, cells: r.proposal.cells, done: r.proposal.done }, r.usage);
    const last: LastCall = { stepNo: next.stepNo, proposal: r.proposal, outcome: "proposed", executed: false, result: null };
    return { stepNo: next.stepNo, usage: r.usage, last };
  };

  const exec = async (s: S): Promise<Partial<S>> => {
    if (!s.last || s.last.proposal.done) return {};
    const r = execute(s.last.proposal, {
      runId: s.runId,
      stepNo: s.stepNo,
      policyFile: d.policyFile,
      policy: d.arm.policy,
      registry: d.registry,
      docs: d.docs,
      store: d.store,
      budget: d.budget,
      usage: s.usage,
      approved: approvedActions(d.store, s.runId, d.now()),
    });
    const out: Partial<S> = {
      usage: r.usage,
      cellQueries: noteLookups(s.cellQueries, s.last.proposal, r, providerOf),
      unavailableCells: noteUnavailable(s.unavailableCells, s.last.proposal, r, providerOf),
      last: { ...s.last, outcome: r.outcome, executed: r.executed, result: r.result },
    };
    return r.stop ? { ...out, ...stop(s, r.stop, r.usage) } : out;
  };

  const extract = async (s: S): Promise<Partial<S>> => {
    const rows = s.last ? rowsOf(s.last.result) : [];
    const before = resolvedCells(s.required, ledgerOf(s.facts), s.cellQueries, s.unavailableCells);
    const seen = new Set(s.seenPassages);
    let facts = s.facts;
    let usage = s.usage;
    let stepFacts: { fact: FactRecord; newPassage: boolean }[] = [];
    if (rows.length > 0) {
      const open = s.required.filter((c) => !before.has(c));
      const r = await extractNode(d.model, { stepNo: s.stepNo, rows, cells: open, criteria: d.criteria, passages: d.passages, officialSourceIds: official, verifier: d.arm.verifier, prompt: d.prompts.extractor, usage });
      usage = r.usage;
      if (r.stop) return { ...stop(s, r.stop, usage) };
      stepFacts = r.facts.map((fact) => ({ fact, newPassage: !seen.has(fact.passage_id) }));
      facts = addFacts(s.facts, r.facts);
      event({ ...s, usage }, "extract", r.invalid ? "extract_invalid" : "facts", { verified: r.facts.filter((f) => f.status === "verified").length, rejected: r.facts.filter((f) => f.status === "rejected").length, unchecked: r.facts.filter((f) => f.status === "unchecked").length }, usage);
    }
    const ledger = ledgerOf(facts);
    const after = resolvedCells(s.required, ledger, s.cellQueries, s.unavailableCells);
    const a = assessStep({ required: s.required, resolvedBefore: before, resolvedAfter: after, stepFacts, noProgress: s.noProgress, rule: d.arm.no_progress_rule });
    const out: Partial<S> = {
      facts,
      usage,
      conflicts: ledger.conflicts,
      seenPassages: [...new Set([...s.seenPassages, ...rows.map((r) => r.passage_id)])].sort(),
      noProgress: a.noProgress,
    };
    event({ ...s, usage }, "assess", a.stop ?? "continue", { resolved: after.size, required: s.required.length, no_progress: a.noProgress }, usage);
    return a.stop ? { ...out, ...stop(s, a.stop, usage) } : out;
  };

  const finished = (s: S) => (s.stopReason ? "done" : "go");

  return new StateGraph(AgentAnnotation)
    // Node names may not equal state field names (LangGraph rule), hence "planner" for the plan field.
    .addNode("planner", plan)
    .addNode("act", act)
    .addNode("execute", exec)
    .addNode("extract", extract)
    .addEdge(START, "planner")
    .addConditionalEdges("planner", finished, { go: "act", done: END })
    .addConditionalEdges("act", finished, { go: "execute", done: END })
    .addConditionalEdges("execute", finished, { go: "extract", done: END })
    .addConditionalEdges("extract", finished, { go: "act", done: END });
}

/** Recursion backstop only: 4 graph steps per agent step, plus slack. Our budgets stop runs long before. */
export const recursionLimit = (b: BudgetConfig) => b.limits.max_steps * 4 + 10;

/** Runs (or resumes) one research run on a checkpointer, saving after every node. */
export async function runBounded(d: AgentDeps, init: AgentState | null, threadId: string, saver: BaseCheckpointSaver, signal?: AbortSignal): Promise<AgentState> {
  const graph = buildBoundedGraph(d).compile({ checkpointer: saver });
  const config = { configurable: { thread_id: threadId }, durability: "sync" as const, recursionLimit: recursionLimit(d.budget), signal };
  return (await graph.invoke(init, config)) as AgentState;
}
