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
  usage: RunUsage;
  budget: BudgetConfig;
  prompt: PromptTemplate;
}

export type ActResult =
  | { kind: "proposal"; proposal: Proposal; usage: RunUsage }
  | { kind: "invalid"; usage: RunUsage }
  | { kind: "stop"; stop: StopReason; usage: RunUsage };

const RECENT = 6;

/** The first plan step that still has an open cell; the whole open list if the plan is used up. */
export function currentStep(plan: PlanStep[], resolved: ReadonlySet<string>): PlanStep | null {
  return plan.find((s) => s.cells.some((c) => !resolved.has(c))) ?? null;
}

/**
 * Asks the model for one proposal. It sees the plan step, the open cells, its recent calls and the budget
 * left, never the raw text of past results (the extractor reads those). Bad output is `invalid`: the step
 * counts, but no tool runs.
 */
export async function actNode(d: ModelDeps, input: ActInput): Promise<ActResult> {
  const open = input.required.filter((c) => !input.resolved.has(c));
  const step = currentStep(input.plan, input.resolved);
  const l = input.budget.limits;
  const vars = {
    question: input.question,
    current_step: step ? `${step.id}: ${step.task} (cells: ${step.cells.filter((c) => !input.resolved.has(c)).join(", ")}). Expected: ${step.expected_output}` : "(plan done) resolve any open cells left",
    open_count: String(open.length),
    open_cells: open.join("\n") || "(none)",
    resolved_count: String(input.required.length - open.length),
    required_count: String(input.required.length),
    recent_calls:
      input.history
        .slice(-RECENT)
        .map((e) => `step ${e.step_no}: ${e.tool} ${e.args_json} → ${e.outcome}`)
        .join("\n") || "(none yet)",
    budget_left: `${l.max_steps - input.usage.steps} steps, ${l.max_tool_calls - input.usage.tool_calls} tool calls`,
  };
  const out = await callModel(d, "actor", input.prompt, vars, Proposal, input.usage);
  if (out.kind === "stop") return out;
  if (out.kind === "invalid") return { kind: "invalid", usage: out.usage };
  return { kind: "proposal", proposal: out.value, usage: out.usage };
}
