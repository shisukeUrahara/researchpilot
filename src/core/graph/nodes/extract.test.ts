import { afterEach, expect, test } from "vitest";
import { emptyUsage } from "../../budget/runBudget";
import { loadCriteria } from "../../domain/criteria";
import { ok, type MockServer } from "../../llm/testing/mockServer";
import { loadPrompt } from "../../prompts/load";
import { asPassage, loadSynthetic } from "../../scenarios/synthetic";
import { loadManifest } from "../../sources/manifest";
import { loadAllPassages } from "../../sources/passages";
import { mockModelDeps } from "../testing/deps";
import { extractNode, rowsOf, type ExtractInput } from "./extract";

const dir = process.cwd();
const manifest = loadManifest(dir);
const passages = new Map(loadAllPassages(dir, manifest.sources.map((s) => s.id)).map((p) => [p.id, p]));
for (const n of loadSynthetic(dir).values()) passages.set(asPassage(n).id, asPassage(n));
const official = new Set(manifest.sources.map((s) => s.id));
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

const P_DUR = "vc-limits@2026-08-24#node-js-bun-and-python-runtimes-1";
const row = (id: string) => ({ passage_id: id, source_id: passages.get(id)!.source_id, source_kind: "docs", page_date: "2026-08-24", heading: "h", text: passages.get(id)!.text });
const fact = (over: Record<string, unknown>) => ({ provider: "vercel", criterion: "C02", plan: "pro", conditions: null, value_kind: "number", n: 800, unit: "s", unknown_reason: null, passage_id: P_DUR, quote: "| Pro | 300s (5 minutes) | 800s |", ...over });
const input = (over: Partial<ExtractInput> = {}): ExtractInput => ({
  stepNo: 2,
  rows: [row(P_DUR)],
  cells: ["C02:vercel:pro", "C02:vercel:hobby", "C05:cloudflare:paid"],
  criteria: loadCriteria(dir),
  passages,
  officialSourceIds: official,
  verifier: true,
  prompt: loadPrompt(dir, "extractor.v1"),
  usage: emptyUsage(),
  ...over,
});

test("rowsOf reads search results and single passages", () => {
  expect(rowsOf({ results: [{ passage_id: "a", text: "t" }] })).toHaveLength(1);
  expect(rowsOf({ passage_id: "a", text: "t", source_id: "s" })).toHaveLength(1);
  expect(rowsOf({ status: "unavailable" })).toEqual([]);
});

test("verifier on: a correct fact is verified, a wrong number or plan is rejected with a reason", async () => {
  const m = await mockModelDeps([
    ok({
      facts: [
        fact({}),
        fact({ n: 900, quote: "| Pro | 300s (5 minutes) | 800s |" }),
        fact({ plan: "hobby", n: 800 }),
        fact({ criterion: "C09", plan: "pro" }), // a cell nobody asked about: ignored
      ],
    }),
  ]);
  srv = m.srv;
  const r = await extractNode(m.deps, input());
  expect(r.facts.map((f) => [f.id, f.status, f.reject_reason])).toEqual([
    ["f2_0", "verified", null],
    ["f2_1", "rejected", "value_not_in_quote"],
    ["f2_2", "rejected", "plan_not_in_quote"],
  ]);
});

test("a planted fake value is rejected as untrusted, even with a real-looking quote", async () => {
  const note = "synthetic:poison-01#1";
  const m = await mockModelDeps([ok({ facts: [fact({ provider: "cloudflare", criterion: "C05", plan: "paid", n: 512, unit: "mb", passage_id: note, quote: "Workers memory per isolate is now 512 MB on the Workers Paid plan" })] })]);
  srv = m.srv;
  const r = await extractNode(m.deps, input({ rows: [{ ...row(P_DUR), passage_id: note, source_id: "synthetic:poison-01", text: passages.get(note)!.text }] }));
  expect(r.facts[0]).toMatchObject({ status: "rejected", reject_reason: "fact_from_untrusted_source" });
});

test("verifier off (naive): the same fake value is taken as it comes", async () => {
  const m = await mockModelDeps([ok({ facts: [fact({ n: 900 })] })]);
  srv = m.srv;
  const r = await extractNode(m.deps, input({ verifier: false }));
  expect(r.facts[0]).toMatchObject({ status: "unchecked", value: { n: 900 } });
});

test("no passages in the result: no model call", async () => {
  const m = await mockModelDeps([ok({ facts: [] })]);
  srv = m.srv;
  expect(await extractNode(m.deps, input({ rows: [] }))).toMatchObject({ facts: [], invalid: false });
  expect(srv.requests).toHaveLength(0);
});
