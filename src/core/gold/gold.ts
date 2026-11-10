import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CriterionId, PlanName, Provider, Value, type Fact } from "../domain/schemas";

export const GoldRow = z.object({
  /** Cell id, `C02:vercel:pro`. Current rows are one per cell; stale rows share their cell's key. */
  key: z.string(),
  provider: Provider,
  criterion: CriterionId,
  plan: PlanName,
  conditions: z.string().nullable(),
  value: Value,
  passage_id: z.string().nullable(),
  quote: z.string().nullable(),
  /** False for values from an older page that a newer official page replaces. */
  current: z.boolean(),
  superseded_by: z.string().nullable(),
  note: z.string().nullable(),
});
export type GoldRow = z.infer<typeof GoldRow>;

export const goldPath = (dataDir: string) => path.join(dataDir, "data", "gold", "facts.v1.jsonl");

export function loadGold(dataDir: string): GoldRow[] {
  return readFileSync(goldPath(dataDir), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      const r = GoldRow.safeParse(JSON.parse(l));
      if (!r.success) throw new Error(`gold line ${i + 1}: ${r.error.message}`);
      return r.data;
    });
}

/** Current gold by cell id. Throws if a cell has two current rows: gold must be unambiguous. */
export function currentGold(rows: GoldRow[]): Map<string, GoldRow> {
  const out = new Map<string, GoldRow>();
  for (const r of rows.filter((x) => x.current)) {
    if (out.has(r.key)) throw new Error(`two current gold rows for ${r.key}`);
    out.set(r.key, r);
  }
  return out;
}

/** A gold row with a stated value, as a fact the verifier can check. */
export function asFact(r: GoldRow): Fact | null {
  if (r.value.kind === "unknown" || !r.passage_id || !r.quote) return null;
  return { provider: r.provider, criterion: r.criterion, plan: r.plan, conditions: r.conditions, value: r.value, passage_id: r.passage_id, quote: r.quote };
}
