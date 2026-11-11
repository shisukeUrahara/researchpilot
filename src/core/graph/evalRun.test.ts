import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { mayStart } from "../budget/spend";
import { ResponseCache } from "../llm/cache";
import { ok, startMockServer, type MockServer } from "../llm/testing/mockServer";
import { loadScenarios } from "../scenarios/schema";
import { runEval } from "./evalRun";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());
const tmp = (p: string) => mkdtempSync(path.join(tmpdir(), p));

test("mayStart keeps room for every run in flight", () => {
  expect(mayStart(14.5, 0.12, 0)).toBe(true);
  expect(mayStart(14.8, 0.12, 2)).toBe(false); // 14.8 + 3 × 0.12 > 15
  expect(mayStart(0, 0.12, 3)).toBe(true);
});

test("eval over 2 dev scenarios writes 2 records in scenario order; a run past the cap is not run", async () => {
  srv = await startMockServer([ok({ steps: [] }), { kind: "badJson" }]);
  const env = { dataDir: process.cwd(), stateDir: tmp("rp-ev-"), apiKey: "sk-test", cache: new ResponseCache(path.join(tmp("rp-c-"), "llm")), maxUsd: 1, now: () => new Date("2026-11-11T10:00:00Z"), baseURL: srv.baseURL };
  const dev = loadScenarios(process.cwd()).filter((s) => s.split === "dev").slice(0, 2);
  const res = await runEval(env, { arm: "bounded", scenarios: dev, policy: null, concurrency: 2, spentBefore: 0, capUsd: 15, liveSpent: () => 0 }, "test");
  expect(res.records.map((r) => r.scenario_id)).toEqual(dev.map((s) => s.id));
  expect(res.records.every((r) => r.stop_reason === "NO_PROGRESS")).toBe(true);
  const capped = await runEval({ ...env, stateDir: tmp("rp-ev2-") }, { arm: "bounded", scenarios: dev, policy: null, concurrency: 1, spentBefore: 14.95, capUsd: 15, liveSpent: () => 0 }, "test2");
  expect(capped).toMatchObject({ records: [], notRun: dev.map((s) => s.id) });
}, 60_000);
