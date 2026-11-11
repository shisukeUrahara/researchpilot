import type { BudgetConfig, RunUsage } from "../../budget/runBudget";
import { Proposal, type PlanStep, type StopReason } from "../../domain/schemas";
import type { PromptTemplate } from "../../prompts/load";
import type { ToolEventRow } from "../../store/db";
import { callModel, type ModelDeps } from "../model";

export interface ActInput {
  question: string;
  plan: PlanStep[];
  required: string[];
  resolved: ReadonlySet<string>;
  /** This run's tool events so far, oldest first. */
  history: ToolEventRow[];
  /** What each step's call led to, by step number (facts found, rejections, passage ids). */
  stepNotes: Record<number, string>;
  /** Tries per plan step so far; a step gets at most MAX_STEP_TRIES before the agent moves on. */
  stepTries: Record<string, number>;
  /** Raw text of the last tool result, for arms whose actor reads results (naive). Null = not shown. */
  lastResults: string | null;
  usage: RunUsage;
  budget: BudgetConfig;
  prompt: PromptTemplate;
}

export type ActResult =
  | { kind: "proposal"; proposal: Proposal; usage: RunUsage; stepId: string | null }
  | { kind: "invalid"; usage: RunUsage }
  | { kind: "stop"; stop: StopReason; usage: RunUsage };

const RECENT = 6;
/** Tries a plan step gets before the agent moves on (found live: one hard cell held the whole plan). */
export const MAX_STEP_TRIES = 3;

/** The first plan step with an open cell that has tries left; null when the plan is used up. */
export function currentStep(plan: PlanStep[], resolved: ReadonlySet<string>, tries: Record<string, number> = {}): PlanStep | null {
  return plan.find((s) => s.cells.some((c) => !resolved.has(c)) && (tries[s.id] ?? 0) < MAX_STEP_TRIES) ?? null;
}

/**
 * Asks the model for one proposal. It sees the plan step, the open cells, its recent calls and the budget
 * left, never the raw text of past results (the extractor reads those). Bad output is `invalid`: the step
 * counts, but no tool runs.
 */
export async function actNode(d: ModelDeps, input: ActInput): Promise<ActResult> {
  const open = input.required.filter((c) => !input.resolved.has(c));
  const step = currentStep(input.plan, input.resolved, input.stepTries);
  const l = input.budget.limits;
  const vars = {
    question: input.question,
    current_step: step
      ? `${step.id}: ${step.task} (cells: ${step.cells.filter((c) => !input.resolved.has(c)).join(", ")}). Expected: ${step.expected_output}`
      : input.plan.length === 0
        ? "(no plan) pick the next useful call for the open cells"
        : "(plan done) resolve any open cells left",
    open_count: String(open.length),
    open_cells: open.join("\n") || "(none)",
    resolved_count: String(input.required.length - open.length),
    required_count: String(input.required.length),
    recent_calls:
      input.history
        .slice(-RECENT)
        .map((e) => `step ${e.step_no}: ${e.tool} ${e.args_json} → ${e.outcome}${e.outcome === "from_memory" ? " (nothing new)" : ""}${input.stepNotes[e.step_no] ? `; ${input.stepNotes[e.step_no]}` : ""}`)
        .join("\n") || "(none yet)",
    budget_left: `${l.max_steps - input.usage.steps} steps, ${l.max_tool_calls - input.usage.tool_calls} tool calls`,
    last_results: input.lastResults ?? "(not shown: a separate extractor with no tools reads page text)",
  };
  const out = await callModel(d, "actor", input.prompt, vars, Proposal, input.usage);
  if (out.kind === "stop") return out;
  if (out.kind === "invalid") return { kind: "invalid", usage: out.usage };
  return { kind: "proposal", proposal: out.value, usage: out.usage, stepId: step?.id ?? null };
}
