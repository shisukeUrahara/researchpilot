import { beforeEach, expect, test } from "vitest";
import { emptyUsage, loadBudgetConfig } from "../budget/runBudget";
import type { Proposal } from "../domain/schemas";
import { execute, type ExecContext } from "../exec/executor";
import { argsHash } from "../run/events";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { Store } from "../store/db";
import { DocTools } from "../tools/docs";
import { fetchLive } from "../tools/fetchLive";
import { loadPolicy } from "../tools/policy";
import { makeRegistry } from "../tools/registry";
import { approvedActions, decide, requestApproval } from "./approvals";

const dir = process.cwd();
const T0 = new Date("2026-11-11T10:00:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);
const URL_ = "https://vercel.com/docs/functions/limitations";
let store: Store;
beforeEach(() => {
  store = new Store();
  store.upsertRun({ run_id: "r1", arm: "bounded", brief_id: "b", scenario_id: null, policy: "strict", status: "running", stop_reason: null, created_at: "t", updated_at: "t" });
});
const ctx = (approved: Set<string>): ExecContext => ({
  runId: "r1",
  stepNo: 2,
  policyFile: loadPolicy(dir),
  policy: "strict",
  registry: makeRegistry([fetchLive]),
  docs: new DocTools({ manifest: loadManifest(dir), passages: [], notes: loadSynthetic(dir), scenario: null }),
  store,
  budget: loadBudgetConfig(dir),
  usage: emptyUsage(),
  approved,
});
const fetchProp = (url: string): Proposal => ({ tool: "fetch_live", args_json: JSON.stringify({ url }), cells: [], reason: "check freshness", done: false });

test("asking twice for the same action makes one request", () => {
  const a = requestApproval(store, "r1", "fetch_live", { url: URL_ }, T0);
  const b = requestApproval(store, "r1", "fetch_live", { url: URL_ }, later(1));
  expect(b.approval_id).toBe(a.approval_id);
  expect(store.approvals("r1")).toHaveLength(1);
});

test("no token or a wrong token is forbidden", () => {
  const a = requestApproval(store, "r1", "fetch_live", { url: URL_ }, T0);
  expect(() => decide(store, a.approval_id, "approved", null, "secret", T0)).toThrow(/forbidden/);
  expect(() => decide(store, a.approval_id, "approved", "wrong", "secret", T0)).toThrow(/forbidden/);
  expect(() => decide(store, a.approval_id, "approved", "secret", null, T0)).toThrow(/forbidden/); // approvals off
});

test("an expired request is denied; a decided one cannot be decided again", () => {
  const a = requestApproval(store, "r1", "fetch_live", { url: URL_ }, T0);
  expect(() => decide(store, a.approval_id, "approved", "s", "s", later(16))).toThrow(/expired/);
  expect(store.getApproval(a.approval_id)!.status).toBe("denied");
  expect(() => decide(store, a.approval_id, "approved", "s", "s", later(17))).toThrow(/already denied/);
});

test("approval covers exactly this action: other args need their own approval", () => {
  const a = requestApproval(store, "r1", "fetch_live", { url: URL_ }, T0);
  decide(store, a.approval_id, "approved", "s", "s", later(1));
  const ok = approvedActions(store, "r1", later(2));
  expect(ok.has(argsHash("fetch_live", { url: URL_ }))).toBe(true);
  expect(execute(fetchProp(URL_), ctx(ok))).toMatchObject({ outcome: "ok", executed: true, result: { source_id: "vc-limits", status: "recorded" } });
  const other = "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html";
  expect(execute(fetchProp(other), ctx(ok))).toMatchObject({ outcome: "needs_approval", executed: false });
  expect(approvedActions(store, "r1", later(20)).size).toBe(0); // expired
});

test("a host that is not an official docs site is blocked before anything else", () => {
  expect(execute(fetchProp("https://evil.example/docs"), ctx(new Set()))).toMatchObject({ outcome: "tool_args_invalid", executed: false });
  expect(execute(fetchProp("http://vercel.com/docs"), ctx(new Set()))).toMatchObject({ outcome: "tool_args_invalid" });
});
