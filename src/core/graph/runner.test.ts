import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { ResponseCache } from "../llm/cache";
import { ok, startMockServer, type MockServer, type Reply } from "../llm/testing/mockServer";
import { openStore } from "../store/db";
import { rebuildRunRows, startRun, type RunnerEnv } from "./runner";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());

const tmp = (p: string) => mkdtempSync(path.join(tmpdir(), p));
async function env(script: Reply[]): Promise<RunnerEnv> {
  srv = await startMockServer(script);
  return { dataDir: process.cwd(), stateDir: tmp("rp-state-"), apiKey: "sk-test", cache: new ResponseCache(path.join(tmp("rp-cache-"), "llm")), maxUsd: 1, now: () => new Date("2026-11-11T10:00:00Z"), baseURL: srv.baseURL };
}
const plan = ok({ steps: [{ id: "a", task: "t", cells: ["C02:vercel:hobby"], expected_output: "e" }] });
const emptySearch = (i: number) => ok({ tool: "search_docs", args_json: JSON.stringify({ query: `zzqq${i}`, provider: "vercel" }), cells: ["C02:vercel:hobby"], reason: "r", done: false });

test("a cancel requested during the run stops it with CANCELLED before the next step", async () => {
  const e = await env([plan, emptySearch(1), emptySearch(2), emptySearch(3), emptySearch(4), { kind: "badJson" }]);
  const out = await startRun(e, {
    arm: "ablation",
    briefId: "three-minute",
    approvals: "deny",
    runId: "run_cancel_test",
    // As if `rp cancel` ran in another process while step 3 was about to start.
    onStep: (n) => {
      if (n !== 3) return;
      const s = openStore(e.stateDir);
      s.requestCancel("run_cancel_test", "t");
      s.close();
    },
  });
  expect(out.state).toMatchObject({ stopReason: "CANCELLED", status: "cancelled", stepNo: 2 });
  const s = openStore(e.stateDir);
  expect(s.getRun("run_cancel_test")).toMatchObject({ status: "cancelled", stop_reason: "CANCELLED" });
  s.close();
});

test("rebuild-db restores a run row from its checkpoint", async () => {
  const e = await env([plan, emptySearch(1), emptySearch(2), emptySearch(3), { kind: "badJson" }]);
  await startRun(e, { arm: "bounded", briefId: "three-minute", approvals: "deny", runId: "run_rebuild_test" });
  const s = openStore(e.stateDir);
  const row = s.getRun("run_rebuild_test")!;
  expect(row.stop_reason).toBe("NO_PROGRESS");
  s.upsertRun({ ...row, status: "running", stop_reason: null }); // a projection that lost its last write
  s.close();
  expect(await rebuildRunRows(e.stateDir, new Date())).toEqual([{ runId: "run_rebuild_test", from: "running/-", to: "stopped/NO_PROGRESS" }]);
});
