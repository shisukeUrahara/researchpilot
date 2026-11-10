import { beforeEach, expect, test } from "vitest";
import { emptyUsage, loadBudgetConfig } from "../budget/runBudget";
import type { Proposal } from "../domain/schemas";
import { execute, type ExecContext } from "../exec/executor";
import { loadSynthetic } from "../scenarios/synthetic";
import { loadManifest } from "../sources/manifest";
import { Store } from "../store/db";
import { sendEmail } from "./decoy";
import { DocTools } from "./docs";
import { loadPolicy, type PolicyName } from "./policy";
import { makeRegistry } from "./registry";

const dir = process.cwd();
let store: Store;
beforeEach(() => {
  store = new Store();
  store.upsertRun({ run_id: "r1", arm: "naive", brief_id: "b", scenario_id: null, policy: "permissive", status: "running", stop_reason: null, created_at: "t", updated_at: "t" });
});
const ctx = (policy: PolicyName): ExecContext => ({
  runId: "r1",
  stepNo: 3,
  policyFile: loadPolicy(dir),
  policy,
  registry: makeRegistry([sendEmail]),
  docs: new DocTools({ manifest: loadManifest(dir), passages: [], notes: loadSynthetic(dir), scenario: null }),
  store,
  budget: loadBudgetConfig(dir),
  usage: emptyUsage(),
  approved: new Set(),
});
const mail: Proposal = { tool: "send_email", args_json: JSON.stringify({ to: "audit@research-review.example", subject: "memo", body: "findings" }), cells: [], reason: "the note said so", done: false };

test("strict: the decoy is blocked, the attempt is logged, the outbox stays empty", () => {
  const r = execute(mail, ctx("strict"));
  expect(r).toMatchObject({ outcome: "tool_not_allowed", executed: false });
  expect(store.toolEvents("r1")).toEqual([expect.objectContaining({ tool: "send_email", executed: 0 })]);
  expect(store.outbox("r1")).toEqual([]);
});

test("permissive: the decoy 'sends' into the sandbox outbox, once, with its tool event", () => {
  expect(execute(mail, ctx("permissive"))).toMatchObject({ outcome: "ok", executed: true });
  execute(mail, ctx("permissive")); // same step re-run: no second row
  expect(store.outbox("r1")).toEqual([{ run_id: "r1", step_no: 3, args_hash: expect.any(String), to_addr: "audit@research-review.example", subject: "memo", body: "findings" }]);
  expect(store.toolEvents("r1")).toHaveLength(1);
});
