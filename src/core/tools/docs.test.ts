import { describe, expect, test } from "vitest";
import { loadScenarios } from "../scenarios/schema";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { DocTools, type DocWorld } from "./docs";

const dir = process.cwd();
const manifest = loadManifest(dir);
const base: DocWorld = { manifest, passages: loadAllPassages(dir, manifest.sources.map((s) => s.id)), notes: loadSynthetic(dir), scenario: null };
const scenarios = new Map(loadScenarios(dir).map((s) => [s.id, s]));
const tools = (id?: string) => new DocTools({ ...base, scenario: id ? scenarios.get(id)! : null });
const ids = (raw: string) => (JSON.parse(raw).results as { passage_id: string }[]).map((r) => r.passage_id);

describe("search_docs", () => {
  test("finds current and stale Vercel duration passages, each with its page date", () => {
    const out = JSON.parse(tools().search({ query: "Vercel maximum duration Hobby Pro", provider: "vercel" }, 0));
    const got = out.results as { source_id: string; page_date: string }[];
    expect(got.length).toBeLessThanOrEqual(5);
    expect(got.some((r) => r.source_id === "vc-limits")).toBe(true);
    // Found while building: with no scenario twist at all, the 2025 archive copy ranks first for this
    // query (its heading says "Max duration"). Freshness is a problem in normal runs, not just in tests.
    expect(got[0].source_id).toBe("vc-limits-2025");
    expect(got.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.page_date))).toBe(true);
  });

  test("the provider filter keeps other providers out", () => {
    const out = JSON.parse(tools().search({ query: "memory limit", provider: "aws" }, 0));
    expect(out.results.every((r: { source_id: string }) => r.source_id === "aws-quotas")).toBe(true);
  });

  test("same query, same order (ties break by passage id)", () => {
    const q = { query: "limit", provider: null };
    expect(tools().search(q, 0)).toBe(tools().search(q, 0));
  });

  test("freshness: the stale 2025 page is forced to rank 1", () => {
    expect(ids(tools("fresh-01").search({ query: "anything about duration", provider: null }, 0))[0]).toBe("vc-limits-2025@2025-03-08#max-duration-3");
  });

  test("injection: the planted note is rank 1 with a synthetic source id", () => {
    const out = JSON.parse(tools("inj-01").search({ query: "Workers memory", provider: "cloudflare" }, 0));
    expect(out.results[0]).toMatchObject({ source_id: "synthetic:inj-01", source_kind: "unverified" });
  });

  test("dead end: only the dead-end page, whatever the query", () => {
    expect(ids(tools("deadend-01").search({ query: "Lambda timeout", provider: "aws" }, 0))).toEqual(["synthetic:deadend-01#1"]);
    expect(ids(tools("deadend-01").search({ query: "Vercel memory", provider: null }, 5))).toEqual(["synthetic:deadend-01#1"]);
  });

  test("unavailable source: its passages vanish and the result says so", () => {
    const out = JSON.parse(tools("unavail-01").search({ query: "Vercel maximum duration", provider: "vercel" }, 0));
    expect(out.unavailable_sources).toEqual(["vc-limits"]);
    expect(out.results.some((r: { source_id: string }) => r.source_id === "vc-limits")).toBe(false);
  });

  test("malformed fault: broken JSON from the step it starts", () => {
    const t = tools("malformed-02"); // cf-limits from step 1
    const q = { query: "Workers CPU time memory", provider: "cloudflare" as const };
    expect(() => JSON.parse(t.search(q, 0))).not.toThrow();
    expect(() => JSON.parse(t.search(q, 1))).toThrow();
  });
});

describe("read_passage, list_sources, price_lookup", () => {
  test("read returns the passage with its date; unknown ids say not_found", () => {
    expect(JSON.parse(tools().read({ passage_id: "cf-limits@2026-10-29#memory-1" }, 0))).toMatchObject({ page_date: "2026-10-29", text: expect.stringContaining("128 MB") });
    expect(JSON.parse(tools().read({ passage_id: "nope#1" }, 0))).toEqual({ error: "not_found", passage_id: "nope#1" });
  });

  test("read of an unavailable source fails", () => {
    expect(JSON.parse(tools("unavail-02").read({ passage_id: "cf-limits@2026-10-29#memory-1" }, 0))).toEqual({ error: "unavailable", source_id: "cf-limits" });
  });

  test("list_sources shows kinds and dates; AWS is 'retrieved'", () => {
    const out = JSON.parse(tools().listSources({ provider: "aws" }));
    expect(out.sources).toEqual([expect.objectContaining({ source_id: "aws-quotas", date_kind: "retrieved" })]);
  });

  test("price_lookup never returns a number", () => {
    expect(JSON.parse(tools().priceLookup({ provider: "vercel", plan: "pro" }))).toMatchObject({ status: "unavailable" });
  });
});
