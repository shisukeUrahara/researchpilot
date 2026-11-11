import type { RunUsage } from "../../budget/runBudget";
import { Memo, type Brief, type StopReason } from "../../domain/schemas";
import type { Ledger } from "../../evidence/ledger";
import type { PromptTemplate } from "../../prompts/load";
import type { Manifest } from "../../sources/manifest";
import { callModel, type ModelDeps } from "../model";

export interface MemoInput {
  brief: Brief;
  ledger: Ledger;
  required: string[];
  resolved: ReadonlySet<string>;
  /** Why each open cell is open, for the unknowns list. */
  unknownReasons: Record<string, string>;
  manifest: Manifest;
  prompt: PromptTemplate;
  usage: RunUsage;
  /** Verdicts the fit rules computed from the ledger (arms with the memo check); null = the writer decides. */
  computed: { provider: string; verdict: string; plan: string | null; reasons: string[] }[] | null;
}

export type MemoResult = { memo: Memo | null; usage: RunUsage; stop: StopReason | null };

/**
 * The writer sees only the ledger: values with their passage, source kind and date, the conflicts and
 * the open cells. It runs after every stop reason (a TIMEOUT run still gets a partial memo), using the
 * time and money the budget kept back for it.
 */
export async function memoNode(d: ModelDeps, input: MemoInput): Promise<MemoResult> {
  const sources = new Map(input.manifest.sources.map((s) => [s.id, s]));
  const srcOf = (passageId: string) => sources.get(passageId.split("@")[0]);
  const fmt = (v: { kind: string; n?: number; unit?: string }) => (v.kind === "number" ? `${v.n} ${v.unit}` : v.kind);
  const ledgerLines = [...input.ledger.current.entries()].map(([cell, { fact, value }]) => {
    const s = srcOf(fact.passage_id);
    return `${cell} = ${fmt(value)} · ${fact.passage_id} · ${s?.kind ?? "?"} ${s?.page_date ?? "?"} (${s?.date_kind ?? "?"}) · ${fact.conditions ?? "no conditions"}`;
  });
  const conflictLines = input.ledger.conflicts.map((c) => `${c.criterion}:${c.provider}:${c.plan}: facts ${c.fact_ids.join(", ")}; used ${c.used} (${c.rule})`);
  const open = input.required.filter((c) => !input.ledger.current.has(c));
  const vars = {
    question: input.brief.question,
    workload: JSON.stringify(input.brief.workload),
    plans: JSON.stringify(input.brief.plans),
    ledger: ledgerLines.join("\n") || "(empty)",
    conflicts: conflictLines.join("\n") || "(none)",
    unknowns: open.map((c) => `${c}: ${input.unknownReasons[c] ?? "not found in the corpus"}`).join("\n") || "(none)",
    computed_verdicts: input.computed
      ? "Verdicts computed from the ledger (copy these):\n" + input.computed.map((v) => `${v.provider}: ${v.verdict}${v.plan ? ` (${v.plan})` : ""} — ${v.reasons.join("; ")}`).join("\n")
      : "",
  };
  const out = await callModel(d, "writer", input.prompt, vars, Memo, input.usage, true);
  if (out.kind === "stop") return { memo: null, usage: out.usage, stop: out.stop };
  return { memo: out.kind === "ok" ? out.value : null, usage: out.usage, stop: null };
}
