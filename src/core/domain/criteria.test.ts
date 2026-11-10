import { expect, test } from "vitest";
import { loadBrief, loadCriteria } from "./criteria";
import { requiredCells } from "./schemas";

test("the committed criteria are C01..C12; only C11 and C12 are not extracted", () => {
  const c = loadCriteria(process.cwd());
  expect(c.criteria).toHaveLength(12);
  expect(c.criteria.filter((x) => !x.extracted).map((x) => x.id)).toEqual(["C11", "C12"]);
});

test("the three-minute brief: 180 s, 256 MB, streaming, 4 provider-plan pairs, 48 required cells", () => {
  const b = loadBrief(process.cwd(), "three-minute");
  expect(b.workload).toMatchObject({ duration_s: 180, memory_mb: 256, streaming: true });
  expect(requiredCells(b)).toHaveLength(48);
});
