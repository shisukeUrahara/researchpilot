import { expect, test } from "vitest";
import { CRITERIA, PLANS, PROVIDERS, cellId } from "../domain/schemas";
import { verifyFact } from "../evidence/verify";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { asFact, currentGold, loadGold } from "./gold";

const dir = process.cwd();
const rows = loadGold(dir);
const manifest = loadManifest(dir);
const passages = new Map(loadAllPassages(dir, manifest.sources.map((s) => s.id)).map((p) => [p.id, p]));
const official = new Set(manifest.sources.map((s) => s.id));

test("one current row per cell: 11 criteria (all but derived C11) × 6 provider-plan pairs", () => {
  const cur = currentGold(rows);
  const expected = CRITERIA.filter((c) => c !== "C11").flatMap((c) => PROVIDERS.flatMap((p) => PLANS[p].map((plan) => cellId(c, p, plan))));
  expect([...cur.keys()].sort()).toEqual(expected.sort());
});

test("every gold row with a value passes the same verifier the agent uses", () => {
  const failures = rows.flatMap((r) => {
    const f = asFact(r);
    const why = f && verifyFact(f, passages, official);
    return why ? [`${r.key} (${r.current ? "current" : "stale"}): ${why}`] : [];
  });
  expect(failures).toEqual([]);
});

test("stale rows come from the archive copy and point at an existing current cell", () => {
  const cur = currentGold(rows);
  for (const r of rows.filter((x) => !x.current)) {
    expect(r.passage_id).toMatch(/^vc-limits-2025@/);
    expect(cur.has(r.superseded_by!)).toBe(true);
    expect(r.value).not.toEqual(cur.get(r.superseded_by!)!.value);
  }
});

test("price is unknown everywhere", () => {
  expect(rows.filter((r) => r.criterion === "C12").every((r) => r.value.kind === "unknown")).toBe(true);
});

test("the facts behind the headline: Cloudflare 128 MB per isolate, Vercel Hobby 300 s now vs 60 s in 2025, Lambda 900 s", () => {
  const cur = currentGold(rows);
  expect(cur.get("C05:cloudflare:paid")!.value).toEqual({ kind: "number", n: 128, unit: "mb" });
  expect(cur.get("C02:vercel:hobby")!.value).toEqual({ kind: "number", n: 300, unit: "s" });
  expect(rows.find((r) => r.key === "C02:vercel:hobby" && !r.current)!.value).toEqual({ kind: "number", n: 60, unit: "s" });
  expect(cur.get("C02:aws:default")!.value).toEqual({ kind: "number", n: 900, unit: "s" });
});
