import { expect, test } from "vitest";
import type { GoldRow } from "./gold";
import { applyGoldReview, itemOf, type GoldReview } from "./review";

const row = (key: string, n: number): GoldRow => ({
  key,
  provider: "aws",
  criterion: "C02",
  plan: "default",
  conditions: null,
  value: { kind: "number", n, unit: "s" },
  passage_id: "p",
  quote: `${n} seconds`,
  current: true,
  superseded_by: null,
  note: null,
});
const rv = (r: GoldRow, verdict: GoldReview["verdict"], fix: GoldRow | null = null): GoldReview => ({ item: itemOf(r), verdict, fix, note: "n", reviewer: "model" });

test("ok keeps, fix replaces, drop removes, stale marks not current", () => {
  const a = row("C02:aws:default", 900);
  const b = row("C01:aws:default", 3);
  const c = row("C03:aws:default", 5400);
  const d = row("C04:aws:default", 1);
  const { rows, counts } = applyGoldReview([a, b, c, d], [rv(a, "ok"), rv(b, "fix", { ...b, conditions: "x" }), rv(c, "drop"), rv(d, "stale")]);
  expect(rows.map((r) => [r.key, r.conditions, r.current])).toEqual([
    ["C02:aws:default", null, true],
    ["C01:aws:default", "x", true],
    ["C04:aws:default", null, false],
  ]);
  expect(counts).toEqual({ ok: 1, fix: 1, drop: 1, stale: 1 });
});

test("a review out of order or a fix that moves the cell is refused", () => {
  const a = row("C02:aws:default", 900);
  const b = row("C01:aws:default", 3);
  expect(() => applyGoldReview([a, b], [rv(b, "ok"), rv(a, "ok")])).toThrow(/is for/);
  expect(() => applyGoldReview([a], [rv(a, "fix", { ...a, key: "C09:aws:default" })])).toThrow(/keep the cell key/);
  expect(() => applyGoldReview([a, b], [rv(a, "ok")])).toThrow(/1 lines for 2/);
});
