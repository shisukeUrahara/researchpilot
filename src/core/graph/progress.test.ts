import { describe, expect, test } from "vitest";
import { emptyUsage, loadBudgetConfig } from "../budget/runBudget";
import type { FactRecord, Proposal } from "../domain/schemas";
import { buildLedger } from "../evidence/ledger";
import { execute, type ExecContext } from "../exec/executor";
import { loadScenarios } from "../scenarios/schema";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { Store } from "../store/db";
import { DocTools } from "../tools/docs";
import { loadPolicy } from "../tools/policy";
import { makeRegistry } from "../tools/registry";
import { assessStep, noteLookups, noteUnavailable, resolvedCells } from "./progress";

const dir = process.cwd();
const manifest = loadManifest(dir);
const req = ["C02:vercel:hobby", "C02:vercel:pro"];
const fact = (cell: string, status: FactRecord["status"] = "verified"): FactRecord => {
  const [criterion, provider, plan] = cell.split(":");
  return { id: cell, step_no: 1, provider, criterion, plan, conditions: null, value: { kind: "number", n: 300, unit: "s" }, passage_id: "vc-limits@2026-08-24#x", quote: "300s", status, reject_reason: null } as FactRecord;
};

describe("assessStep", () => {
  const base = { required: req, resolvedBefore: new Set<string>(), resolvedAfter: new Set<string>(), stepFacts: [], noProgress: 0, rule: true };

  test("all cells resolved → VERIFIED", () => {
    expect(assessStep({ ...base, resolvedAfter: new Set(req) }).stop).toBe("VERIFIED");
  });

  test("3 steps with no progress → NO_PROGRESS; the ablation never stops on it", () => {
    expect(assessStep({ ...base, noProgress: 1 })).toEqual({ noProgress: 2, stop: null });
    expect(assessStep({ ...base, noProgress: 2 })).toEqual({ noProgress: 3, stop: "NO_PROGRESS" });
    expect(assessStep({ ...base, noProgress: 9, rule: false })).toEqual({ noProgress: 10, stop: null });
  });

  test("a first value for a cell is progress; a rejected candidate from a new passage is progress too", () => {
    expect(assessStep({ ...base, noProgress: 2, stepFacts: [{ fact: fact(req[0]), newPassage: false }] }).noProgress).toBe(0);
    expect(assessStep({ ...base, noProgress: 2, stepFacts: [{ fact: fact(req[1], "rejected"), newPassage: true }] }).noProgress).toBe(0);
    // The same rejected fact from a passage seen before is not progress.
    expect(assessStep({ ...base, noProgress: 2, stepFacts: [{ fact: fact(req[1], "rejected"), newPassage: false }] }).stop).toBe("NO_PROGRESS");
  });
});

describe("resolved cells", () => {
  test("a ledger value resolves a cell; an unknown needs 2 distinct lookups or an unavailable source", () => {
    const ledger = buildLedger([fact(req[0])], manifest);
    expect(resolvedCells(req, ledger, { [req[1]]: ["h1"] }, [])).toEqual(new Set([req[0]]));
    expect(resolvedCells(req, ledger, { [req[1]]: ["h1", "h2"] }, [])).toEqual(new Set(req));
    expect(resolvedCells(req, buildLedger([], manifest), {}, [req[1]])).toEqual(new Set([req[1]]));
  });
});

const providerOf = (id: string) => manifest.sources.find((s) => s.id === id)?.provider ?? null;

test("a lookup is evidence for an unknown only if it returned the provider's official passages", () => {
  const p = { tool: "search_docs", cells: ["C02:vercel:pro", "C02:aws:default"] } as unknown as Proposal;
  const r = { outcome: "ok", argsHash: "h1", result: { results: [{ passage_id: "x", source_id: "vc-limits", text: "t" }] } } as never;
  expect(noteLookups({}, p, r, providerOf)).toEqual({ "C02:vercel:pro": ["h1"] });
  const planted = { outcome: "ok", argsHash: "h2", result: { results: [{ passage_id: "y", source_id: "synthetic:deadend-01", text: "t" }] } } as never;
  expect(noteLookups({}, p, planted, providerOf)).toEqual({});
});

test("the 4 dead-end pages end in NO_PROGRESS at step 3, decided by code", () => {
  const world = { manifest, passages: loadAllPassages(dir, manifest.sources.map((s) => s.id)), notes: loadSynthetic(dir) };
  const scenarios = loadScenarios(dir).filter((s) => s.kind === "deadend" && s.split === "eval");
  expect(scenarios).toHaveLength(4);
  for (const s of scenarios) {
    const store = new Store();
    store.upsertRun({ run_id: s.id, arm: "bounded", brief_id: "b", scenario_id: s.id, policy: "strict", status: "running", stop_reason: null, created_at: "t", updated_at: "t" });
    let noProgress = 0;
    let stop = null;
    let stopStep = 0;
    let cellQueries: Record<string, string[]> = {};
    let usage = emptyUsage();
    const ledger = buildLedger([], manifest);
    for (let step = 1; step <= 6 && !stop; step++) {
      const p: Proposal = { tool: "search_docs", args_json: JSON.stringify({ query: `Vercel duration try ${step}`, provider: "vercel" }), cells: req, reason: "r", done: false };
      const ctx: ExecContext = { runId: s.id, stepNo: step, policyFile: loadPolicy(dir), policy: "strict", registry: makeRegistry(), docs: new DocTools({ ...world, scenario: s }), store, budget: loadBudgetConfig(dir), usage, approved: new Set() };
      const before = resolvedCells(req, ledger, cellQueries, []);
      const r = execute(p, ctx);
      usage = r.usage;
      cellQueries = noteLookups(cellQueries, p, r, providerOf);
      // The dead-end page holds no facts, so the extractor returns none.
      ({ noProgress, stop } = assessStep({ required: req, resolvedBefore: before, resolvedAfter: resolvedCells(req, ledger, cellQueries, []), stepFacts: [], noProgress, rule: true }));
      stopStep = step;
    }
    expect([s.id, stop, stopStep]).toEqual([s.id, "NO_PROGRESS", 3]);
  }
});

test("an unavailable source marks only the aimed-at cells of its provider", () => {
  const r = { outcome: "ok", result: { results: [], unavailable_sources: ["vc-limits"] } } as never;
  const p = { tool: "search_docs", cells: ["C02:vercel:pro", "C02:aws:default"] } as never;
  expect(noteUnavailable([], p, r, providerOf)).toEqual(["C02:vercel:pro"]);
  const read = { outcome: "tool_unavailable", result: { error: "unavailable", source_id: "cf-limits" } } as never;
  expect(noteUnavailable([], { tool: "read_passage", cells: ["C05:cloudflare:paid"] } as never, read, providerOf)).toEqual(["C05:cloudflare:paid"]);
});
