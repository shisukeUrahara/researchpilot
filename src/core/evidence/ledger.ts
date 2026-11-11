import { cellId, type Conflict, type FactRecord, type Value } from "../domain/schemas";
import type { CellValue } from "../fit/rules";
import type { Manifest, Source } from "../sources/manifest";

export const cellOf = (f: Pick<FactRecord, "criterion" | "provider" | "plan">) => cellId(f.criterion, f.provider, f.plan);
const usable = (f: FactRecord) => f.status === "verified" || f.status === "unchecked";
const sameValue = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b);
const sourceOfPassage = (passageId: string) => passageId.split("@")[0].split("#")[0];

/**
 * How much a source counts for a criterion, lower is stronger: current docs page, then a changelog
 * (only for C03, extended duration, the thing changelogs announce), then an archived copy. Within the
 * same rank the newer page date wins; a "retrieved" date (the page states none) never beats a page date.
 */
export function sourceRank(s: Source | undefined, criterion: string): [number, number, string] {
  if (!s) return [9, 1, ""];
  const kind = s.kind === "docs" ? 0 : s.kind === "changelog" ? (criterion === "C03" ? 1 : 2) : 3;
  const datePenalty = s.date_kind === "page" ? 0 : 1;
  // Negate the date by sorting it descending in compare below.
  return [kind, datePenalty, s.page_date ?? ""];
}

function compare(a: [number, number, string], b: [number, number, string]): number {
  return a[0] - b[0] || a[1] - b[1] || (a[2] > b[2] ? -1 : a[2] < b[2] ? 1 : 0);
}

/** Adds new facts, skipping exact repeats (same cell, value, passage and quote). Order is kept. */
export function addFacts(have: FactRecord[], next: FactRecord[]): FactRecord[] {
  const key = (f: FactRecord) => JSON.stringify([cellOf(f), f.value, f.passage_id, f.quote, f.status]);
  const seen = new Set(have.map(key));
  return [...have, ...next.filter((f) => !seen.has(key(f)) && seen.add(key(f)))];
}

export interface Ledger {
  /** The value each cell uses now, with the fact behind it. */
  current: Map<string, { fact: FactRecord; value: Value }>;
  conflicts: Conflict[];
}

/**
 * Builds the ledger from usable facts. Two facts for one cell with different values are a conflict:
 * both are kept, the source-order rule picks the one to use, and the conflict is always shown.
 * A person's resolution (rp resolve) overrides the rule for that cell.
 */
export interface LedgerOptions {
  /** A person's pick per cell (rp resolve): fact id to use. */
  resolutions?: ReadonlyMap<string, string>;
  /**
   * Freshness rule (arms with the verifier): an archived copy never gives a cell its current value; it
   * only appears as the superseded side of a conflict. Found live: with no newer fact for Vercel Pro
   * memory, the 2025 archive value (1769 MB) went straight into the memo.
   */
  archiveNeverCurrent?: boolean;
}

export function buildLedger(facts: FactRecord[], manifest: Manifest, opts: LedgerOptions | ReadonlyMap<string, string> = {}): Ledger {
  const o: LedgerOptions = opts instanceof Map ? { resolutions: opts } : (opts as LedgerOptions);
  const resolutions = o.resolutions ?? new Map<string, string>();
  const sources = new Map(manifest.sources.map((s) => [s.id, s]));
  const isArchive = (f: FactRecord) => sources.get(sourceOfPassage(f.passage_id))?.kind === "archive";
  const byCell = new Map<string, FactRecord[]>();
  for (const f of facts.filter(usable)) byCell.set(cellOf(f), [...(byCell.get(cellOf(f)) ?? []), f]);

  const current = new Map<string, { fact: FactRecord; value: Value }>();
  const conflicts: Conflict[] = [];
  for (const [cell, list] of [...byCell.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const ranked = [...list].sort(
      (a, b) => compare(sourceRank(sources.get(sourceOfPassage(a.passage_id)), a.criterion), sourceRank(sources.get(sourceOfPassage(b.passage_id)), b.criterion)) || (a.id < b.id ? -1 : 1),
    );
    const chosenId = resolutions.get(cell);
    const pickable = o.archiveNeverCurrent ? ranked.filter((f) => !isArchive(f)) : ranked;
    const chosen = ranked.find((f) => f.id === chosenId) ?? pickable[0];
    if (!chosen) continue; // only archive facts: the cell stays open; they show up once a current fact arrives
    current.set(cell, { fact: chosen, value: chosen.value });
    const distinct = ranked.filter((f, i) => ranked.findIndex((g) => sameValue(g.value, f.value)) === i);
    if (distinct.length > 1) {
      const s = sources.get(sourceOfPassage(chosen.passage_id));
      conflicts.push({
        provider: chosen.provider,
        criterion: chosen.criterion,
        plan: chosen.plan,
        conditions: chosen.conditions,
        fact_ids: distinct.map((f) => f.id),
        used: chosen.id,
        rule: chosenId ? "resolved by the approver" : `newest official kind wins: ${s?.kind ?? "unknown"} dated ${s?.page_date ?? "?"} (${s?.date_kind ?? "?"})`,
      });
    }
  }
  return { current, conflicts };
}

/** The ledger as the fit rules read it. */
export function ledgerLookup(l: Ledger): (cell: string) => CellValue | undefined {
  return (cell) => {
    const c = l.current.get(cell);
    return c ? { value: c.value, conditions: c.fact.conditions } : undefined;
  };
}
