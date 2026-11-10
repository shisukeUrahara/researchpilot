import { z } from "zod";
import { PlanName, Provider } from "../domain/schemas";
import type { Scenario } from "../scenarios/schema";
import { asPassage, type SyntheticNote } from "../scenarios/synthetic";
import type { Manifest, Source } from "../sources/manifest";
import type { Passage } from "../sources/passages";
import { Bm25 } from "./bm25";

export const TOP_K = 5;

/** Everything the read-only tools can see. Built once per run; the scenario adds its twist. */
export interface DocWorld {
  manifest: Manifest;
  passages: Passage[];
  notes: ReadonlyMap<string, SyntheticNote>;
  /** The scenario's injection, rank override, dead end and fault. Null for a normal run. */
  scenario: Pick<Scenario, "inject" | "rank_override" | "deadend" | "fault"> | null;
}

export class DocTools {
  private readonly bm25: Bm25;
  private readonly byId: Map<string, Passage>;
  private readonly sources: Map<string, Source>;

  constructor(readonly world: DocWorld) {
    this.bm25 = new Bm25(world.passages);
    this.byId = new Map(world.passages.map((p) => [p.id, p]));
    for (const n of world.notes.values()) this.byId.set(asPassage(n).id, asPassage(n));
    this.sources = new Map(world.manifest.sources.map((s) => [s.id, s]));
  }

  /** True when the scenario's fault hits this source at this step. */
  private faulted(sourceId: string, step: number, kind: "unavailable" | "malformed"): boolean {
    const f = this.world.scenario?.fault;
    return !!f && f.kind === kind && f.source_id === sourceId && step >= f.from_step;
  }

  /** What a result row shows: the passage plus its source's kind and date, so freshness is visible. */
  private row(p: Passage) {
    const s = this.sources.get(p.source_id);
    return {
      passage_id: p.id,
      source_id: p.source_id,
      source_kind: s?.kind ?? "unverified",
      page_date: s?.page_date ?? null,
      date_kind: s?.date_kind ?? null,
      heading: p.heading,
      text: p.text,
    };
  }

  /**
   * Raw tool output as a JSON string, like a real tool would return over the wire. A malformed fault
   * returns broken JSON, which the executor must handle.
   */
  search(args: SearchArgs, step: number): string {
    const sc = this.world.scenario;
    let hits: Passage[];
    if (sc?.deadend) {
      hits = [asPassage(this.note(sc.deadend.page_id))];
    } else {
      const provider = args.provider;
      const sourceOk = (p: Passage) => !provider || this.sources.get(p.source_id)?.provider === provider;
      hits = this.bm25.search(args.query, (p) => sourceOk(p) && !this.faulted(p.source_id, step, "unavailable"));
      if (sc?.rank_override) {
        const forced = this.byId.get(sc.rank_override.passage_id);
        if (forced && !this.faulted(forced.source_id, step, "unavailable")) {
          hits = hits.filter((p) => p.id !== forced.id);
          hits.splice(sc.rank_override.rank - 1, 0, forced);
        }
      }
      if (sc?.inject) hits = [asPassage(this.note(sc.inject.note_id)), ...hits];
    }
    const top = hits.slice(0, TOP_K);
    if (top.some((p) => this.faulted(p.source_id, step, "malformed"))) return '{"results": [{"passage_id": "' + top[0].id + '", "text": "unterminated';
    const unavailable = sc?.fault?.kind === "unavailable" && step >= sc.fault.from_step ? [sc.fault.source_id] : [];
    return JSON.stringify({ results: top.map((p) => this.row(p)), unavailable_sources: unavailable });
  }

  read(args: ReadArgs, step: number): string {
    const p = this.byId.get(args.passage_id);
    if (!p) return JSON.stringify({ error: "not_found", passage_id: args.passage_id });
    if (this.faulted(p.source_id, step, "unavailable")) return JSON.stringify({ error: "unavailable", source_id: p.source_id });
    if (this.faulted(p.source_id, step, "malformed")) return '{"passage_id": "' + p.id + '", "text": ';
    return JSON.stringify(this.row(p));
  }

  listSources(args: ListArgs): string {
    const rows = this.world.manifest.sources
      .filter((s) => !args.provider || s.provider === args.provider)
      .map((s) => ({ source_id: s.id, provider: s.provider, kind: s.kind, page_date: s.page_date, date_kind: s.date_kind, url: s.url }));
    return JSON.stringify({ sources: rows });
  }

  /** The corpus has no price pages. The tool says so instead of returning a number. */
  priceLookup(args: PriceArgs): string {
    return JSON.stringify({ status: "unavailable", provider: args.provider, plan: args.plan, reason: "no price data in the corpus" });
  }

  private note(id: string): SyntheticNote {
    const n = this.world.notes.get(id);
    if (!n) throw new Error(`unknown synthetic note ${id}`);
    return n;
  }
}

export const SearchArgs = z.object({ query: z.string().min(2).max(200), provider: Provider.nullable().default(null) });
export type SearchArgs = z.infer<typeof SearchArgs>;
export const ReadArgs = z.object({ passage_id: z.string().min(3).max(200) });
export type ReadArgs = z.infer<typeof ReadArgs>;
export const ListArgs = z.object({ provider: Provider.nullable().default(null) });
export type ListArgs = z.infer<typeof ListArgs>;
export const PriceArgs = z.object({ provider: Provider, plan: PlanName.nullable().default(null) });
export type PriceArgs = z.infer<typeof PriceArgs>;
