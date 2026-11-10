import { expect, test } from "vitest";
import type { FactRecord, Memo, MemoClaim } from "../domain/schemas";
import { buildLedger } from "../evidence/ledger";
import { loadManifest } from "../sources/manifest";
import { checkMemo, DISCLAIMER } from "./check";

const manifest = loadManifest(process.cwd());
const fact = (id: string, passage_id: string, n: number): FactRecord => ({
  id,
  step_no: 1,
  provider: "vercel",
  criterion: "C02",
  plan: "hobby",
  conditions: null,
  value: { kind: "number", n, unit: "s" },
  passage_id,
  quote: `${n}s`,
  status: "verified",
  reject_reason: null,
});
const ledger = buildLedger([fact("old", "vc-limits-2025@2025-03-08#max-duration-3", 60), fact("new", "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1", 300)], manifest);
const claim = (over: Partial<MemoClaim>): MemoClaim => ({ provider: "vercel", criterion: "C02", plan: "hobby", value_kind: "number", n: 300, unit: "s", unknown_reason: null, text: "Hobby max 300 s", passage_id: "x", ...over });
const memo = (claims: MemoClaim[]): Memo => ({ summary: "s", verdicts: [], claims, unknowns: [], assumptions: [] });

test("a claim matching the ledger stays and gets the ledger's passage id", () => {
  const r = checkMemo(memo([claim({})]), ledger);
  expect(r.memo.claims).toEqual([expect.objectContaining({ n: 300, passage_id: "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1" })]);
  expect(r.downgraded).toEqual([]);
  expect(r.memo.disclaimer).toBe(DISCLAIMER);
});

test("the superseded 60 s value is removed and becomes an unknown; the raw memo keeps it", () => {
  const r = checkMemo(memo([claim({ n: 60, text: "Hobby max 60 s" })]), ledger);
  expect(r.downgraded).toEqual([{ cell: "C02:vercel:hobby", text: "Hobby max 60 s", reason: "superseded_value" }]);
  expect(r.memo.claims).toEqual([]);
  expect(r.memo.unknowns).toEqual([{ cell: "C02:vercel:hobby", reason: "claim removed by the memo check: superseded_value" }]);
  expect(r.raw.claims).toHaveLength(1);
});

test("a number with no ledger value and a broken value are both removed", () => {
  const r = checkMemo(memo([claim({ provider: "aws", plan: "default", n: 900 }), claim({ n: null })]), ledger);
  expect(r.downgraded.map((d) => d.reason)).toEqual(["not_in_ledger", "bad_value"]);
});
