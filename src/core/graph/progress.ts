import type { FactRecord, Proposal, StopReason } from "../domain/schemas";
import type { Ledger } from "../evidence/ledger";
import { cellOf } from "../evidence/ledger";
import type { ExecResult } from "../exec/executor";
import { rowsOf } from "./nodes/extract";

/** Steps in a row with no progress before the run stops with NO_PROGRESS. */
export const NO_PROGRESS_STEPS = 3;
/** Distinct searches or reads aimed at a cell before "not in the corpus" counts as evidence. */
export const UNKNOWN_EVIDENCE = 2;

const LOOKUPS = new Set(["search_docs", "read_passage"]);

/**
 * Records which cells this call was aimed at, so an "unknown" can be backed by evidence. Only distinct,
 * successful lookups that returned official passages of the cell's provider count: "I searched that
 * provider's official pages and the value is not there". A dead-end page or a planted note is no evidence.
 */
export function noteLookups(cellQueries: Record<string, string[]>, p: Proposal, r: ExecResult, providerOfSource: (sourceId: string) => string | null): Record<string, string[]> {
  if (!LOOKUPS.has(p.tool) || !r.argsHash || r.outcome !== "ok") return cellQueries;
  const providers = new Set(rowsOf(r.result).map((row) => providerOfSource(row.source_id)).filter((x): x is string => x !== null));
  const out = { ...cellQueries };
  for (const c of p.cells) {
    if (!providers.has(c.split(":")[1])) continue;
    out[c] = [...new Set([...(out[c] ?? []), r.argsHash])].sort();
  }
  return out;
}

/** Cells a tool reported as unavailable: aimed-at cells whose provider's source was unavailable. */
export function noteUnavailable(cells: string[], p: Proposal, r: ExecResult, providerOfSource: (sourceId: string) => string | null): string[] {
  const res = r.result as { unavailable_sources?: string[]; source_id?: string } | null;
  const down = [...(res?.unavailable_sources ?? []), ...(r.outcome === "tool_unavailable" && res?.source_id ? [res.source_id] : [])];
  const providers = new Set(down.map(providerOfSource).filter((x): x is string => x !== null));
  const hit = p.cells.filter((c) => providers.has(c.split(":")[1]));
  return hit.length ? [...new Set([...cells, ...hit])].sort() : cells;
}

/**
 * A cell is resolved when the ledger has a value for it, or when it is "unknown with evidence": at least
 * 2 distinct lookups aimed at it found nothing, its source was reported unavailable, or (price) the
 * price tool said there is no price data. A bare "unknown" from the model never resolves a cell.
 */
export function resolvedCells(required: string[], ledger: Ledger, cellQueries: Record<string, string[]>, unavailable: string[], priceChecked: string[] = []): Set<string> {
  const down = new Set(unavailable);
  const priced = new Set(priceChecked);
  const priceDone = (c: string) => c.startsWith("C12:") && priced.has(c.split(":")[1]);
  return new Set(required.filter((c) => ledger.current.has(c) || (cellQueries[c]?.length ?? 0) >= UNKNOWN_EVIDENCE || down.has(c) || priceDone(c)));
}

/** A price_lookup that answered "no price data" settles that provider's price cells as unknown. */
export function notePrice(priceChecked: string[], p: Proposal, r: ExecResult): string[] {
  const res = r.result as { status?: string; provider?: string } | null;
  if (p.tool !== "price_lookup" || r.outcome !== "ok" || res?.status !== "unavailable" || !res.provider) return priceChecked;
  return [...new Set([...priceChecked, res.provider])].sort();
}

export interface AssessInput {
  required: string[];
  resolvedBefore: ReadonlySet<string>;
  resolvedAfter: ReadonlySet<string>;
  /** Facts the extractor returned this step, any status, with whether their passage was new to the run. */
  stepFacts: { fact: FactRecord; newPassage: boolean }[];
  noProgress: number;
  /** The ablation arm turns the NO_PROGRESS rule off; everything else stays. */
  rule: boolean;
}

/**
 * Progress = a cell got its first value this step, or a newly seen passage gave a candidate fact (even a
 * rejected one) for a cell that is still open. A distractor passage with nothing in it is not progress.
 */
export function assessStep(a: AssessInput): { noProgress: number; stop: StopReason | null } {
  if (a.required.every((c) => a.resolvedAfter.has(c))) return { noProgress: 0, stop: "VERIFIED" };
  const newlyValued = a.stepFacts.some(({ fact }) => fact.status !== "rejected" && !a.resolvedBefore.has(cellOf(fact)));
  const candidate = a.stepFacts.some(({ fact, newPassage }) => newPassage && !a.resolvedAfter.has(cellOf(fact)));
  const progressed = newlyValued || candidate;
  const streak = progressed ? 0 : a.noProgress + 1;
  return { noProgress: streak, stop: a.rule && streak >= NO_PROGRESS_STEPS ? "NO_PROGRESS" : null };
}
