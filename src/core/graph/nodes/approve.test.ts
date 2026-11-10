import { MemorySaver } from "@langchain/langgraph";
import { afterEach, expect, test } from "vitest";
import { decide } from "../../approvals/approvals";
import { loadBrief } from "../../domain/criteria";
import { Brief, CRITERIA } from "../../domain/schemas";
import { ok, type MockServer, type Reply } from "../../llm/testing/mockServer";
import { initialState, runBounded } from "../bounded";
import { mockAgentDeps } from "../testing/deps";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());

const base = loadBrief(process.cwd(), "three-minute");
const brief = Brief.parse({ ...base, plans: { cloudflare: ["paid"], vercel: ["hobby"], aws: ["default"] }, exclusions: CRITERIA.filter((c) => c !== "C02") });
const URL_ = "https://vercel.com/docs/functions/limitations";
const script: Reply[] = [
  ok({ steps: [{ id: "a", task: "Check freshness", cells: ["C02:vercel:hobby"], expected_output: "current page date" }] }),
  ok({ tool: "fetch_live", args_json: JSON.stringify({ url: URL_ }), cells: ["C02:vercel:hobby"], reason: "the archive copy is old", done: false }),
  { kind: "badJson" }, // later steps: nothing useful, so the run ends on NO_PROGRESS
];

test("fetch_live pauses the run; after approval it resumes and runs exactly once", async () => {
  const m = await mockAgentDeps(script, "bounded", null, "r1", "interrupt");
  srv = m.srv;
  const saver = new MemorySaver();
  const paused = await runBounded(m.deps, initialState("r1", "bounded", brief), "r1", saver);
  expect(paused.status).toBe("awaiting_approval");
  expect(paused.paused).toMatchObject({ tool: "fetch_live", args: { url: URL_ } });
  const id = (paused.paused as { approval_id: string }).approval_id;
  expect(m.store.toolEvents("r1")).toEqual([]); // nothing ran yet
  const stepsAtPause = paused.usage.steps;

  decide(m.store, id, "approved", "tok", "tok", new Date("2026-11-11T10:01:00Z"));
  const final = await runBounded(m.deps, { resume: true }, "r1", saver);
  expect(final.paused).toBeNull();
  const fetches = m.store.toolEvents("r1").filter((e) => e.tool === "fetch_live");
  expect(fetches).toEqual([expect.objectContaining({ outcome: "ok", executed: 1 })]);
  // The approve node re-ran on resume: still one approval request, and the act step was not charged twice.
  expect(m.store.approvals("r1")).toHaveLength(1);
  expect(stepsAtPause).toBe(1);
  expect(m.store.events("r1").filter((e) => e.node === "act" && e.step_no === 1)).toHaveLength(1);
});

test("deny mode (evals): no pause, the executor refuses with needs_approval", async () => {
  const m = await mockAgentDeps(script, "bounded", null, "r1", "deny");
  srv = m.srv;
  const final = await runBounded(m.deps, initialState("r1", "bounded", brief), "r1", new MemorySaver());
  expect(final.paused).toBeNull();
  expect(m.store.toolEvents("r1")[0]).toMatchObject({ tool: "fetch_live", outcome: "needs_approval", executed: 0 });
  expect(m.store.approvals("r1")).toEqual([]);
});
