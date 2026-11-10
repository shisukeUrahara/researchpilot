import { z } from "zod";

// ---------- Providers, plans, criteria ----------

export const PROVIDERS = ["cloudflare", "vercel", "aws"] as const;
export const Provider = z.enum(PROVIDERS);
export type Provider = z.infer<typeof Provider>;

/** Pricing tiers per provider. AWS Lambda limits do not depend on a plan, so it has one: `default`. */
export const PLANS = {
  cloudflare: ["free", "paid"],
  vercel: ["hobby", "pro", "enterprise"],
  aws: ["default"],
} as const;
export const PlanName = z.enum(["free", "paid", "hobby", "pro", "enterprise", "default"]);
export type PlanName = z.infer<typeof PlanName>;

export function isPlanOf(provider: Provider, plan: string): boolean {
  return (PLANS[provider] as readonly string[]).includes(plan);
}

export const CRITERIA = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12"] as const;
export const CriterionId = z.enum(CRITERIA);
export type CriterionId = z.infer<typeof CriterionId>;

/** One criterion for one provider and plan, written `C02:vercel:pro`. */
export const CellId = z.string().regex(/^C(0[1-9]|1[0-2]):(cloudflare|vercel|aws):(free|paid|hobby|pro|enterprise|default)$/);
export type CellId = z.infer<typeof CellId>;

export function cellId(criterion: CriterionId, provider: Provider, plan: PlanName): CellId {
  if (!isPlanOf(provider, plan)) throw new Error(`plan ${plan} does not belong to ${provider}`);
  return `${criterion}:${provider}:${plan}`;
}

export function parseCell(id: CellId): { criterion: CriterionId; provider: Provider; plan: PlanName } {
  const [criterion, provider, plan] = CellId.parse(id).split(":");
  return { criterion: criterion as CriterionId, provider: provider as Provider, plan: plan as PlanName };
}

// ---------- Brief ----------

export const Workload = z.object({
  duration_s: z.number().positive(),
  /** CPU time actually burned; most of an I/O-bound job is waiting, which does not count as CPU. */
  cpu_ms: z.number().nonnegative(),
  memory_mb: z.number().positive(),
  streaming: z.boolean(),
  streamed_response_mb: z.number().nonnegative(),
  request_body_mb: z.number().nonnegative(),
});
export type Workload = z.infer<typeof Workload>;

export const Brief = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  question: z.string().min(10),
  workload: Workload,
  /** Plans the user can choose per provider; required cells are built from these. */
  plans: z.object({
    cloudflare: z.array(z.enum(PLANS.cloudflare)).min(1),
    vercel: z.array(z.enum(PLANS.vercel)).min(1),
    aws: z.array(z.enum(PLANS.aws)).min(1),
  }),
  exclusions: z.array(CriterionId).default([]),
});
export type Brief = z.infer<typeof Brief>;

/** All cells the brief asks for: every criterion × provider × chosen plan, minus exclusions. */
export function requiredCells(brief: Brief): CellId[] {
  const out: CellId[] = [];
  for (const criterion of CRITERIA) {
    if (brief.exclusions.includes(criterion)) continue;
    for (const provider of PROVIDERS) {
      for (const plan of brief.plans[provider]) out.push(cellId(criterion, provider, plan));
    }
  }
  return out;
}

// ---------- Values and facts ----------

export const Value = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), n: z.number(), unit: z.enum(["s", "ms", "mb", "count"]) }),
  /** The source says there is no hard limit. */
  z.object({ kind: z.literal("unbounded") }),
  z.object({ kind: z.literal("unknown"), reason: z.string().min(3) }),
]);
export type Value = z.infer<typeof Value>;

export const Fact = z.object({
  provider: Provider,
  criterion: CriterionId,
  plan: PlanName,
  /** Extra conditions the value depends on, e.g. "fluid compute, beta". Null = none stated. */
  conditions: z.string().nullable(),
  value: Value,
  passage_id: z.string().min(3),
  quote: z.string().min(1),
});
export type Fact = z.infer<typeof Fact>;

export const FactRecord = Fact.extend({
  id: z.string(),
  step_no: z.number().int().nonnegative(),
  status: z.enum(["verified", "rejected"]),
  /** Why the verifier rejected it; null when verified. */
  reject_reason: z.string().nullable(),
});
export type FactRecord = z.infer<typeof FactRecord>;

export const Conflict = z.object({
  provider: Provider,
  criterion: CriterionId,
  plan: PlanName,
  conditions: z.string().nullable(),
  fact_ids: z.array(z.string()).min(2),
  /** The fact the source-order rule picked as current. */
  used: z.string(),
  rule: z.string(),
});
export type Conflict = z.infer<typeof Conflict>;

// ---------- Run lifecycle ----------

export const STOP_REASONS = ["VERIFIED", "NO_PROGRESS", "MAX_STEPS", "MAX_TOOLS", "TIMEOUT", "BUDGET_USD", "CANCELLED", "ERROR"] as const;
export const StopReason = z.enum(STOP_REASONS);
export type StopReason = z.infer<typeof StopReason>;

export const RunStatus = z.enum(["created", "running", "awaiting_approval", "completed", "stopped", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const ARMS = ["bounded", "ablation", "naive"] as const;
export const Arm = z.enum(ARMS);
export type Arm = z.infer<typeof Arm>;

export const TOOLS = ["search_docs", "read_passage", "list_sources", "price_lookup", "fetch_live", "send_email"] as const;
export const ToolName = z.enum(TOOLS);
export type ToolName = z.infer<typeof ToolName>;

// ---------- Model-facing outputs (OpenAI strict mode: every field required, nullable instead of optional) ----------

export const PlanStep = z.object({
  id: z.string(),
  task: z.string(),
  cells: z.array(z.string()),
  expected_output: z.string(),
});
export type PlanStep = z.infer<typeof PlanStep>;

export const PlanOutput = z.object({ steps: z.array(PlanStep) });
export type PlanOutput = z.infer<typeof PlanOutput>;

/** What the model returns each step. It only proposes; the executor decides whether anything runs. */
export const Proposal = z.object({
  /** The full registry, decoys included: the allowlist lives in the executor, not in this list. */
  tool: ToolName,
  /** Tool arguments as a JSON string, parsed by the tool's own schema in the executor. */
  args_json: z.string(),
  /** Cells this step is aimed at, e.g. "C02:vercel:pro". */
  cells: z.array(z.string()),
  reason: z.string(),
  /** True when the model thinks the research is complete; tool and args are then ignored. */
  done: z.boolean(),
});
export type Proposal = z.infer<typeof Proposal>;

/** Flat value shape for the model: strict mode handles this more reliably than a union. */
const FlatValue = {
  value_kind: z.enum(["number", "unbounded", "unknown"]),
  n: z.number().nullable(),
  unit: z.enum(["s", "ms", "mb", "count"]).nullable(),
  unknown_reason: z.string().nullable(),
};

export const ExtractedFact = z.object({
  provider: Provider,
  criterion: CriterionId,
  plan: PlanName,
  conditions: z.string().nullable(),
  ...FlatValue,
  passage_id: z.string(),
  quote: z.string(),
});
export type ExtractedFact = z.infer<typeof ExtractedFact>;

export const ExtractOutput = z.object({ facts: z.array(ExtractedFact) });
export type ExtractOutput = z.infer<typeof ExtractOutput>;

/** Turns the model's flat value into the internal union; returns null when the fields don't fit together. */
export function toValue(f: Pick<ExtractedFact, "value_kind" | "n" | "unit" | "unknown_reason">): Value | null {
  if (f.value_kind === "number") return f.n !== null && f.unit !== null ? { kind: "number", n: f.n, unit: f.unit } : null;
  if (f.value_kind === "unbounded") return { kind: "unbounded" };
  return f.unknown_reason ? { kind: "unknown", reason: f.unknown_reason } : null;
}

export const Verdict = z.enum(["fits", "fits_on", "does_not_fit", "unknown"]);
export type Verdict = z.infer<typeof Verdict>;

export const MemoClaim = z.object({
  provider: Provider,
  criterion: CriterionId,
  plan: PlanName,
  ...FlatValue,
  text: z.string(),
  passage_id: z.string().nullable(),
});
export type MemoClaim = z.infer<typeof MemoClaim>;

export const Memo = z.object({
  summary: z.string(),
  verdicts: z.array(
    z.object({
      provider: Provider,
      verdict: Verdict,
      /** For fits_on: the plan that is needed. */
      plan: PlanName.nullable(),
      reasons: z.string(),
    }),
  ),
  claims: z.array(MemoClaim),
  unknowns: z.array(z.object({ cell: z.string(), reason: z.string() })),
  assumptions: z.array(z.string()),
});
export type Memo = z.infer<typeof Memo>;

/** Every model-facing schema, so a test can check they all fit OpenAI strict mode. */
export const MODEL_SCHEMAS = { PlanOutput, Proposal, ExtractOutput, Memo } as const;
