import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GoldRow } from "./gold";

export const GoldReview = z.object({
  /** `<key>|<current|stale>|<passage_id or null>`, matching the gold row in file order. */
  item: z.string(),
  verdict: z.enum(["ok", "fix", "drop", "stale"]),
  fix: GoldRow.nullable(),
  note: z.string(),
  reviewer: z.literal("model"),
});
export type GoldReview = z.infer<typeof GoldReview>;

export const goldReviewPath = (dataDir: string) => path.join(dataDir, "data", "labels", "gold_review.jsonl");

export function loadGoldReview(dataDir: string): GoldReview[] {
  return readFileSync(goldReviewPath(dataDir), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => GoldReview.parse(JSON.parse(l)));
}

export const itemOf = (r: GoldRow) => `${r.key}|${r.current ? "current" : "stale"}|${r.passage_id ?? "null"}`;

/**
 * Applies a model review to the gold rows: one review line per row, in order. `fix` replaces the row,
 * `drop` removes it, `stale` marks it not current. Returns the new rows and a count per verdict.
 */
export function applyGoldReview(rows: GoldRow[], reviews: GoldReview[]): { rows: GoldRow[]; counts: Record<string, number> } {
  if (reviews.length !== rows.length) throw new Error(`review has ${reviews.length} lines for ${rows.length} gold rows`);
  const counts: Record<string, number> = { ok: 0, fix: 0, drop: 0, stale: 0 };
  const out: GoldRow[] = [];
  rows.forEach((row, i) => {
    const rv = reviews[i];
    if (rv.item !== itemOf(row)) throw new Error(`review line ${i + 1} is for ${rv.item}, gold row is ${itemOf(row)}`);
    counts[rv.verdict]++;
    if (rv.verdict === "ok") out.push(row);
    else if (rv.verdict === "fix") {
      if (!rv.fix || rv.fix.key !== row.key) throw new Error(`review line ${i + 1}: a fix must keep the cell key ${row.key}`);
      out.push(rv.fix);
    } else if (rv.verdict === "stale") out.push({ ...row, current: false });
    // drop: nothing
  });
  return { rows: out, counts };
}
