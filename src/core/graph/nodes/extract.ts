import type { RunUsage } from "../../budget/runBudget";
import type { CriteriaFile } from "../../domain/criteria";
import { cellId, ExtractOutput, isPlanOf, toValue, type FactRecord, type StopReason } from "../../domain/schemas";
import { verifyFact } from "../../evidence/verify";
import type { PromptTemplate } from "../../prompts/load";
import type { Passage } from "../../sources/passages";
import { callModel, type ModelDeps } from "../model";

/** A passage as tools return it (search rows and read results have the same shape). */
export interface ResultRow {
  passage_id: string;
  source_id: string;
  source_kind: string;
  page_date: string | null;
  heading: string;
  text: string;
}

/** The passages inside a tool result, if any. */
export function rowsOf(result: unknown): ResultRow[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { results?: ResultRow[]; passage_id?: string; text?: string };
  if (Array.isArray(r.results)) return r.results;
  if (typeof r.passage_id === "string" && typeof r.text === "string") return [r as ResultRow];
  return [];
}

export interface ExtractInput {
  stepNo: number;
  rows: ResultRow[];
  cells: string[];
  criteria: CriteriaFile;
  /** Every passage a fact may cite: official passages plus the synthetic notes (which never verify). */
  passages: ReadonlyMap<string, Passage>;
  officialSourceIds: ReadonlySet<string>;
  verifier: boolean;
  prompt: PromptTemplate;
  usage: RunUsage;
}

export type ExtractResult = { facts: FactRecord[]; usage: RunUsage; stop: StopReason | null; invalid: boolean };

/**
 * The model reads the passages and lists facts; code decides which facts count. With the verifier on,
 * every fact must pass verifyFact (official source, quote in passage, value in quote, right plan);
 * rejected facts are kept with their reason. Without it (naive arm), facts are `unchecked`.
 */
export async function extractNode(d: ModelDeps, input: ExtractInput): Promise<ExtractResult> {
  if (input.rows.length === 0) return { facts: [], usage: input.usage, stop: null, invalid: false };
  const vars = {
    cells: input.cells.join("\n"),
    criteria: input.criteria.criteria
      .filter((c) => c.extracted)
      .map((c) => `${c.id} ${c.name}: ${c.question}`)
      .join("\n"),
    passages: input.rows.map((r) => `[${r.passage_id}] (${r.source_kind}, ${r.page_date ?? "no date"}) ${r.heading}\n${r.text}`).join("\n\n"),
  };
  const out = await callModel(d, "extractor", input.prompt, vars, ExtractOutput, input.usage);
  if (out.kind === "stop") return { facts: [], usage: out.usage, stop: out.stop, invalid: false };
  if (out.kind === "invalid") return { facts: [], usage: out.usage, stop: null, invalid: true };

  const want = new Set(input.cells);
  const facts: FactRecord[] = [];
  out.value.facts.forEach((f, i) => {
    const value = toValue(f);
    // Unknowns are not facts, and facts for cells nobody asked about are ignored.
    if (!value || value.kind === "unknown" || !isPlanOf(f.provider, f.plan) || !want.has(cellId(f.criterion, f.provider, f.plan))) return;
    const fact = { provider: f.provider, criterion: f.criterion, plan: f.plan, conditions: f.conditions, value, passage_id: f.passage_id, quote: f.quote };
    const why = input.verifier ? verifyFact(fact, input.passages, input.officialSourceIds) : null;
    facts.push({
      ...fact,
      id: `f${input.stepNo}_${i}`,
      step_no: input.stepNo,
      status: !input.verifier ? "unchecked" : why ? "rejected" : "verified",
      reject_reason: why,
    });
  });
  return { facts, usage: out.usage, stop: null, invalid: false };
}
