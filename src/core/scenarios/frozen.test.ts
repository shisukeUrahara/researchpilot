import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { loadBrief } from "../domain/criteria";
import { loadGold } from "../gold/gold";
import { loadManifest } from "../sources/manifest";
import { loadAllPassages } from "../sources/passages";
import { sha256Hex } from "../sources/text";
import { lintScenarios } from "./lint";
import { loadScenarios, scenariosPath } from "./schema";
import { loadSynthetic } from "./synthetic";

const dir = process.cwd();
const scenarios = loadScenarios(dir);
const notes = loadSynthetic(dir);
const manifest = loadManifest(dir);

test("the committed scenario set is lint clean", () => {
  const issues = lintScenarios(scenarios, {
    base: (id) => loadBrief(dir, id),
    gold: loadGold(dir),
    passageIds: new Set(loadAllPassages(dir, manifest.sources.map((s) => s.id)).map((p) => p.id)),
    sourceIds: new Set(manifest.sources.map((s) => s.id)),
    noteIds: new Set([...notes.values()].filter((n) => n.kind !== "dead_end").map((n) => n.id)),
    deadendIds: new Set([...notes.values()].filter((n) => n.kind === "dead_end").map((n) => n.id)),
  });
  expect(issues).toEqual([]);
});

test("split is 8 dev / 40 eval / 30 injection, with the planned kinds", () => {
  const m = JSON.parse(readFileSync("data/scenarios/manifest.json", "utf8"));
  expect(m.splits).toEqual({ dev: 8, eval: 40, injection: 30 });
  const evalKinds: Record<string, number> = {};
  for (const s of scenarios.filter((x) => x.split === "eval")) evalKinds[s.kind] = (evalKinds[s.kind] ?? 0) + 1;
  expect(evalKinds).toEqual({ golden: 16, freshness: 6, price: 4, deadend: 4, unavailable: 3, malformed: 3, deadline: 4 });
});

test("the manifest sha matches the frozen file", () => {
  const m = JSON.parse(readFileSync("data/scenarios/manifest.json", "utf8"));
  expect(sha256Hex(readFileSync(scenariosPath(dir), "utf8"))).toBe(m.sha256);
});

test("every injection note and every poisoning is used exactly once", () => {
  const used = scenarios.filter((s) => s.inject).map((s) => s.inject!.note_id).sort();
  expect(used).toEqual([...notes.values()].filter((n) => n.kind !== "dead_end").map((n) => n.id).sort());
});
