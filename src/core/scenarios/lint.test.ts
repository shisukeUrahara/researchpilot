import { expect, test } from "vitest";
import { loadBrief } from "../domain/criteria";
import { loadGold } from "../gold/gold";
import { computeExpected, lintScenarios, resolveBrief, type LintContext } from "./lint";
import type { Scenario } from "./schema";

const dir = process.cwd();
const gold = loadGold(dir);
const base = loadBrief(dir, "three-minute");
const blank = {
  question: null,
  workload: null,
  plans: null,
  inject: null,
  rank_override: null,
  deadend: null,
  fault: null,
  deadline_ms: null,
};
function scenario(over: Partial<Scenario> & Pick<Scenario, "id" | "kind">): Scenario {
  const s = { split: "eval", brief_id: "three-minute", ...blank, ...over, expected: null } as unknown as Scenario;
  return { ...s, expected: over.expected ?? computeExpected(s, resolveBrief(s, base), gold) };
}
const ctx: LintContext = {
  base: () => base,
  gold,
  passageIds: new Set(["vc-limits-2025@2025-03-08#max-duration-3"]),
  sourceIds: new Set(["vc-limits"]),
  noteIds: new Set(["inj-01"]),
  deadendIds: new Set(["deadend-01"]),
};

test("golden expected answers come from the fit rules", () => {
  const s = scenario({ id: "golden-01", kind: "golden" });
  expect(s.expected).toMatchObject({ stop_reasons: ["VERIFIED"], grading: "exact", verdicts: { cloudflare: "does_not_fit", vercel: "fits", aws: "fits" } });
  expect(s.expected.unknown_cells).toContain("C12:aws:default");
  expect(lintScenarios([s], ctx)).toEqual([]);
});

test("freshness lists the cells that have a stale value", () => {
  const s = scenario({ id: "fresh-01", kind: "freshness", rank_override: { passage_id: "vc-limits-2025@2025-03-08#max-duration-3", rank: 1 } });
  expect(s.expected.conflict_cells).toEqual(["C01:vercel:hobby", "C01:vercel:pro", "C02:vercel:hobby", "C02:vercel:pro", "C05:vercel:hobby", "C05:vercel:pro"]);
});

test("a dead end expects NO_PROGRESS and everything unknown", () => {
  const s = scenario({ id: "deadend-01", kind: "deadend", deadend: { page_id: "deadend-01" } });
  expect(s.expected).toMatchObject({ stop_reasons: ["NO_PROGRESS"], verdicts: { cloudflare: "unknown", vercel: "unknown", aws: "unknown" } });
});

test("an unavailable source masks its cells and is graded on 'no wrong values'", () => {
  const s = scenario({ id: "unavail-01", kind: "unavailable", fault: { kind: "unavailable", source_id: "vc-limits", from_step: 0 } });
  expect(s.expected.grading).toBe("no_wrong_values");
  expect(s.expected.unknown_cells).toContain("C02:vercel:pro");
});

test("lint catches unknown ids, missing fields, hand-edited answers and duplicates", () => {
  const good = scenario({ id: "golden-01", kind: "golden" });
  const issues = lintScenarios(
    [
      good,
      scenario({ id: "golden-02", kind: "golden" }),
      scenario({ id: "inj-02", kind: "injection", split: "injection", inject: { note_id: "inj-99", rank: 1 } }),
      scenario({ id: "deadline-01", kind: "deadline" }),
      { ...scenario({ id: "golden-03", kind: "golden", workload: { memory_mb: 64 } }), expected: { ...good.expected, verdicts: { cloudflare: "does_not_fit", vercel: "fits", aws: "fits" } } },
      { ...good },
    ],
    ctx,
  );
  expect(issues).toEqual([
    "golden-02: same test as golden-01",
    "inj-02: unknown note inj-99",
    "deadline-01: kind deadline needs deadline_ms",
    "golden-03: expected answers differ from what the fit rules give (edited by hand?)",
    "golden-01: duplicate id",
    "golden-01: same test as golden-01",
  ]);
});
