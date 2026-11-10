import { afterEach, expect, test } from "vitest";
import { emptyUsage } from "../../budget/runBudget";
import { loadBrief, loadCriteria } from "../../domain/criteria";
import { requiredCells } from "../../domain/schemas";
import { ok, type MockServer } from "../../llm/testing/mockServer";
import { loadPrompt, parsePrompt } from "../../prompts/load";
import { loadManifest } from "../../sources/manifest";
import { mockModelDeps } from "../testing/deps";
import { MAX_PLAN_STEPS, planNode, safePlan } from "./plan";

const dir = process.cwd();
const brief = loadBrief(dir, "three-minute");
const required = requiredCells(brief);
const input = () => ({ brief, required, criteria: loadCriteria(dir), manifest: loadManifest(dir), prompt: loadPrompt(dir, "planner.v1"), usage: emptyUsage() });
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

test("prompt files need a system and a user section", () => {
  expect(loadPrompt(dir, "planner.v1").messages.map((m) => m.role)).toEqual(["system", "user"]);
  expect(() => parsePrompt("x", "## user\nhi")).toThrow(/system/);
});

test("the planner's plan covers every required cell, even when the model forgets some", async () => {
  const step = (id: string, cells: string[]) => ({ id, task: "t", cells, expected_output: "e" });
  const m = await mockModelDeps([ok({ steps: [step("a", ["C02:vercel:pro", "C02:vercel:hobby", "C99:nope:x"]), step("b", ["C05:aws:default"])] })]);
  srv = m.srv;
  const r = await planNode(m.deps, input());
  expect(r.stop).toBeNull();
  expect(r.plan.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  expect(r.plan[0].cells).toEqual(["C02:vercel:hobby", "C02:vercel:pro"]); // unknown cell dropped, sorted
  expect(new Set(r.plan.flatMap((s) => s.cells))).toEqual(new Set(required));
  expect(r.usage.virtual_ms).toBe(3000);
  // The prompt carried the cells and the source dates.
  const sent = JSON.stringify(srv.requests[0]);
  expect(sent).toContain("C02:vercel:pro");
  expect(sent).toContain("vc-limits-2025 (vercel, archive, 2025-03-08");
});

test("more than 8 steps are cut to 8 and the remaining cells join the last step", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, task: "t", cells: [required[i]], expected_output: "e" }));
  const plan = safePlan(many, required);
  expect(plan).toHaveLength(MAX_PLAN_STEPS);
  expect(new Set(plan.flatMap((s) => s.cells))).toEqual(new Set(required));
});

test("bad model output still gives a full plan (one catch-all step) and is flagged", async () => {
  const m = await mockModelDeps([{ kind: "badJson" }]);
  srv = m.srv;
  const r = await planNode(m.deps, input());
  expect(r.invalid).toBe(true);
  expect(r.plan).toHaveLength(1);
  expect(r.plan[0].cells).toHaveLength(required.length);
});

test("no budget left for the plan: the run stops before calling the model", async () => {
  const m = await mockModelDeps([ok({ steps: [] })]);
  srv = m.srv;
  const r = await planNode(m.deps, { ...input(), usage: { ...emptyUsage(), virtual_ms: 119_000 } });
  expect(r.stop).toBe("TIMEOUT");
  expect(srv.requests).toHaveLength(0);
});
