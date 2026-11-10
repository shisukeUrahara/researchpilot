import type { RunUsage } from "../../budget/runBudget";
import type { CriteriaFile } from "../../domain/criteria";
import { PlanOutput, type Brief, type PlanStep, type StopReason } from "../../domain/schemas";
import type { PromptTemplate } from "../../prompts/load";
import type { Manifest } from "../../sources/manifest";
import { callModel, type ModelDeps } from "../model";

export const MAX_PLAN_STEPS = 8;

export interface PlanInput {
  brief: Brief;
  required: string[];
  criteria: CriteriaFile;
  manifest: Manifest;
  prompt: PromptTemplate;
  usage: RunUsage;
}

export type PlanResult = { plan: PlanStep[]; usage: RunUsage; stop: StopReason | null; invalid: boolean };

/**
 * Asks the planner for at most 8 steps, then makes the plan safe in code: unknown cells are dropped,
 * extra steps cut, and any required cell the model forgot goes into one last "remaining cells" step.
 * So every required cell is always in the plan, whatever the model returned.
 */
export async function planNode(d: ModelDeps, input: PlanInput): Promise<PlanResult> {
  const vars = {
    question: input.brief.question,
    workload: JSON.stringify(input.brief.workload),
    criteria: input.criteria.criteria.map((c) => `${c.id} ${c.name}: ${c.question}`).join("\n"),
    cell_count: String(input.required.length),
    cells: input.required.join("\n"),
    sources: input.manifest.sources.map((s) => `${s.id} (${s.provider}, ${s.kind}, ${s.page_date}, date ${s.date_kind})`).join("\n"),
  };
  const out = await callModel(d, "planner", input.prompt, vars, PlanOutput, input.usage);
  if (out.kind === "stop") return { plan: [], usage: out.usage, stop: out.stop, invalid: false };
  const raw = out.kind === "ok" ? out.value.steps : [];
  return { plan: safePlan(raw, input.required), usage: out.usage, stop: null, invalid: out.kind === "invalid" };
}

export function safePlan(steps: PlanStep[], required: string[]): PlanStep[] {
  const want = new Set(required);
  const plan = steps.slice(0, MAX_PLAN_STEPS).map((s, i) => ({ ...s, id: `s${i + 1}`, cells: [...new Set(s.cells.filter((c) => want.has(c)))].sort() }));
  const covered = new Set(plan.flatMap((s) => s.cells));
  const missing = required.filter((c) => !covered.has(c));
  if (missing.length > 0) {
    const extra = { id: "", task: "Resolve the remaining cells", cells: missing, expected_output: "a quoted value or an evidence-backed unknown for each cell" };
    if (plan.length < MAX_PLAN_STEPS) plan.push({ ...extra, id: `s${plan.length + 1}` });
    else plan[MAX_PLAN_STEPS - 1] = { ...plan[MAX_PLAN_STEPS - 1], cells: [...new Set([...plan[MAX_PLAN_STEPS - 1].cells, ...missing])].sort() };
  }
  return plan;
}
