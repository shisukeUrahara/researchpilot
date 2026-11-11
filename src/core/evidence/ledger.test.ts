import { expect, test } from "vitest";
import type { FactRecord } from "../domain/schemas";
import { loadManifest } from "../sources/manifest";
import { addFacts, buildLedger, ledgerLookup } from "./ledger";

const manifest = loadManifest(process.cwd());
const f = (id: string, passage_id: string, n: number, over: Partial<FactRecord> = {}): FactRecord => ({
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
  ...over,
});
const OLD = "vc-limits-2025@2025-03-08#max-duration-3";
const NEW = "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1";

test("old vs new Vercel page: a conflict, the current docs page wins, both facts kept", () => {
  const l = buildLedger([f("a", OLD, 60), f("b", NEW, 300)], manifest);
  expect(l.current.get("C02:vercel:hobby")!.value).toEqual({ kind: "number", n: 300, unit: "s" });
  expect(l.conflicts).toEqual([
    expect.objectContaining({ fact_ids: ["b", "a"], used: "b", rule: expect.stringContaining("docs dated 2026-08-24 (page)") }),
  ]);
});

test("the order facts arrive in does not matter", () => {
  expect(buildLedger([f("b", NEW, 300), f("a", OLD, 60)], manifest).current.get("C02:vercel:hobby")!.fact.id).toBe("b");
});

test("a changelog beats the archive only for C03; for other criteria docs still win", () => {
  const CL = "vc-cl-30min@2026-06-15#vercel-functions-can-now-run-up-to-30-mi-1";
  const c03 = buildLedger([f("a", OLD, 900, { criterion: "C03", plan: "pro" }), f("c", CL, 1800, { criterion: "C03", plan: "pro" })], manifest);
  expect(c03.current.get("C03:vercel:pro")!.fact.id).toBe("c");
  const c02 = buildLedger([f("c", CL, 800, { plan: "pro" }), f("b", NEW, 300, { plan: "pro" })], manifest);
  expect(c02.current.get("C02:vercel:pro")!.fact.id).toBe("b");
});

test("rejected facts never enter the ledger; agreeing facts are not a conflict", () => {
  const l = buildLedger([f("a", NEW, 300), f("b", OLD, 300), f("x", NEW, 999, { status: "rejected", reject_reason: "value_not_in_quote" })], manifest);
  expect(l.conflicts).toEqual([]);
  expect(l.current.get("C02:vercel:hobby")!.value).toMatchObject({ n: 300 });
});

test("an approver's resolution overrides the rule for that cell", () => {
  const l = buildLedger([f("a", OLD, 60), f("b", NEW, 300)], manifest, new Map([["C02:vercel:hobby", "a"]]));
  expect(l.current.get("C02:vercel:hobby")!.fact.id).toBe("a");
  expect(l.conflicts[0].rule).toBe("resolved by the approver");
});

test("addFacts skips exact repeats; the fit rules can read the ledger", () => {
  const facts = addFacts([f("a", NEW, 300)], [f("a2", NEW, 300, { id: "a" }), f("c", NEW, 300, { plan: "pro", quote: "x" })]);
  expect(facts.map((x) => x.id)).toEqual(["a", "c"]);
  expect(ledgerLookup(buildLedger(facts, manifest))("C02:vercel:pro")).toEqual({ value: { kind: "number", n: 300, unit: "s" }, conditions: null });
});

test("freshness rule: archive-only facts never become current; with a newer fact they show as superseded", () => {
  const only = buildLedger([f("a", OLD, 60)], manifest, { archiveNeverCurrent: true });
  expect(only.current.has("C02:vercel:hobby")).toBe(false);
  const both = buildLedger([f("a", OLD, 60), f("b", NEW, 300)], manifest, { archiveNeverCurrent: true });
  expect(both.current.get("C02:vercel:hobby")!.fact.id).toBe("b");
  expect(both.conflicts[0].fact_ids).toEqual(["b", "a"]);
  // Without the rule (naive arm) the archive value is used when it is the only one.
  expect(buildLedger([f("a", OLD, 60)], manifest).current.get("C02:vercel:hobby")!.value).toMatchObject({ n: 60 });
});
