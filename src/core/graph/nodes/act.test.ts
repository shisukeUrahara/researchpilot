import { afterEach, expect, test } from "vitest";
import { emptyUsage, loadBudgetConfig } from "../../budget/runBudget";
import { ok, type MockServer } from "../../llm/testing/mockServer";
import { loadPrompt } from "../../prompts/load";
import { mockModelDeps } from "../testing/deps";
import { actNode, currentStep, type ActInput } from "./act";

const dir = process.cwd();
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

const plan = [
  { id: "s1", task: "Vercel durations", cells: ["C02:vercel:hobby", "C02:vercel:pro"], expected_output: "max duration per plan" },
  { id: "s2", task: "Lambda timeout", cells: ["C02:aws:default"], expected_output: "timeout" },
];
const input = (over: Partial<ActInput> = {}): ActInput => ({
  question: "Which fits a 3 minute job?",
  plan,
  required: ["C02:vercel:hobby", "C02:vercel:pro", "C02:aws:default"],
  resolved: new Set(),
  history: [],
  usage: emptyUsage(),
  budget: loadBudgetConfig(dir),
  prompt: loadPrompt(dir, "actor.v1"),
  ...over,
});

test("current step = first step with an open cell", () => {
  expect(currentStep(plan, new Set())?.id).toBe("s1");
  expect(currentStep(plan, new Set(["C02:vercel:hobby", "C02:vercel:pro"]))?.id).toBe("s2");
  expect(currentStep(plan, new Set(["C02:vercel:hobby", "C02:vercel:pro", "C02:aws:default"]))).toBeNull();
});

test("returns the model's proposal; the schema sent to the model lists the decoy tool", async () => {
  const p = { tool: "search_docs", args_json: '{"query":"Vercel max duration","provider":"vercel"}', cells: ["C02:vercel:pro"], reason: "step 1", done: false };
  const m = await mockModelDeps([ok(p)]);
  srv = m.srv;
  const r = await actNode(m.deps, input());
  expect(r).toMatchObject({ kind: "proposal", proposal: p });
  const body = srv.requests[0] as { response_format: { json_schema: { schema: unknown } } };
  // The allowlist is not in the prompt or the schema: the model CAN propose send_email; only the executor blocks it.
  expect(JSON.stringify(body.response_format.json_schema.schema)).toContain("send_email");
  expect(JSON.stringify(body)).toContain("s1: Vercel durations");
});

test("bad output is invalid: no proposal, the call is still charged", async () => {
  const m = await mockModelDeps([{ kind: "badJson" }]);
  srv = m.srv;
  const r = await actNode(m.deps, input());
  expect(r.kind).toBe("invalid");
  expect(r.usage.virtual_ms).toBe(3000);
});

test("recent calls are shown to the model so it can avoid repeats", async () => {
  const m = await mockModelDeps([ok({ tool: "read_passage", args_json: "{}", cells: [], reason: "r", done: false })]);
  srv = m.srv;
  const history = [{ run_id: "r", step_no: 1, args_hash: "h", tool: "search_docs", args_json: '{"query":"x"}', outcome: "ok", executed: 1, result_json: null, request_id: "q", virtual_ms: 0 }];
  await actNode(m.deps, input({ history }));
  expect(JSON.stringify(srv.requests[0])).toContain('step 1: search_docs {\\"query\\":\\"x\\"} → ok');
});
