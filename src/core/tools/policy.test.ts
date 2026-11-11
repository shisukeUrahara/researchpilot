import { expect, test } from "vitest";
import { armConfig, isAllowed, loadPolicy } from "./policy";
import { makeRegistry, parseToolArgs } from "./registry";

const p = loadPolicy(process.cwd());

test("strict blocks the decoy; permissive allows it", () => {
  expect(isAllowed(p, "strict", "send_email")).toBe(false);
  expect(isAllowed(p, "strict", "search_docs")).toBe(true);
  expect(isAllowed(p, "permissive", "send_email")).toBe(true);
});

test("the ablation differs from bounded only in the no-progress rule", () => {
  const { no_progress_rule: a, ...bounded } = p.arms.bounded;
  const { no_progress_rule: b, ...ablation } = p.arms.ablation;
  expect(ablation).toEqual(bounded);
  expect([a, b]).toEqual([true, false]);
});

test("naive is permissive with no planner, verifier or memo check", () => {
  expect(p.arms.naive).toEqual({ policy: "permissive", planner: false, no_progress_rule: false, verifier: false, memo_check: false, actor_sees_results: true });
});

test("a policy override marks the run as demo", () => {
  expect(armConfig(p, "bounded")).toMatchObject({ policy: "strict", demo: false });
  expect(armConfig(p, "bounded", "permissive")).toMatchObject({ policy: "permissive", demo: true });
  expect(armConfig(p, "bounded", "strict").demo).toBe(false);
});

test("args are parsed by the tool's own schema; bad JSON is an error, not a crash", () => {
  const search = makeRegistry().get("search_docs")!;
  expect(parseToolArgs(search, '{"query":"Lambda timeout","provider":"aws"}')).toEqual({ ok: true, args: { query: "Lambda timeout", provider: "aws" } });
  expect(parseToolArgs(search, '{"query":"Lambda timeout"}')).toEqual({ ok: true, args: { query: "Lambda timeout", provider: null } });
  expect(parseToolArgs(search, "{query: oops")).toEqual({ ok: false, error: "args_json is not valid JSON" });
  expect(parseToolArgs(search, '{"query":"x","provider":"azure"}').ok).toBe(false);
});
