import type { Passage } from "../sources/passages";
import { tokenize } from "./tokenize";

/**
 * BM25 Okapi, copied from Atlas (same formula and defaults as rank_bm25: k1 1.5, b 0.75, epsilon
 * floor for negative idf), typed for passages. Passages are sorted by id before indexing, so a tie
 * always breaks the same way.
 */
export class Bm25 {
  private readonly passages: Passage[];
  private readonly tf: Map<string, number>[];
  private readonly len: number[];
  private readonly avgLen: number;
  private readonly idf = new Map<string, number>();

  constructor(
    passages: readonly Passage[],
    private readonly k1 = 1.5,
    private readonly b = 0.75,
    epsilon = 0.25,
  ) {
    this.passages = [...passages].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const docs = this.passages.map((p) => tokenize(`${p.heading}\n${p.text}`));
    this.len = docs.map((d) => d.length);
    this.avgLen = this.len.reduce((a, n) => a + n, 0) / Math.max(1, docs.length);
    this.tf = docs.map((d) => {
      const m = new Map<string, number>();
      for (const t of d) m.set(t, (m.get(t) ?? 0) + 1);
      return m;
    });
    const df = new Map<string, number>();
    for (const m of this.tf) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    const n = docs.length;
    let sum = 0;
    const negative: string[] = [];
    for (const [t, f] of df) {
      const v = Math.log((n - f + 0.5) / (f + 0.5));
      this.idf.set(t, v);
      sum += v;
      if (v < 0) negative.push(t);
    }
    const floor = epsilon * (sum / Math.max(1, df.size));
    for (const t of negative) this.idf.set(t, floor);
  }

  /** Passages sharing a token with the query, best first; ties keep id order. */
  search(query: string, filter: (p: Passage) => boolean = () => true): Passage[] {
    const q = tokenize(query);
    return this.tf
      .map((m, i) => {
        let s = 0;
        for (const t of q) {
          const f = m.get(t);
          if (!f) continue;
          const norm = this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avgLen);
          s += (this.idf.get(t) ?? 0) * ((f * (this.k1 + 1)) / (f + norm));
        }
        return { s, i };
      })
      .filter((h) => h.s > 0 && filter(this.passages[h.i]))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((h) => this.passages[h.i]);
  }
}
