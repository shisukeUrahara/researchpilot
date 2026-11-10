import { expect, test } from "vitest";
import { loadPricing } from "../cost/pricing";
import { Budget, CostGateError } from "./budget";

const pricing = loadPricing("pricing.json");
const MINI = "openai:gpt-4.1-mini-2025-04-14";
// worst case of one call: 4000 chars (1000 tokens in) + 200 out = $0.00072

test("parallel reservations cannot jointly pass the cap", () => {
  const b = new Budget(pricing, 0.002);
  const held = [b.reserve(MINI, 4000, 200), b.reserve(MINI, 4000, 200)];
  expect(() => b.reserve(MINI, 4000, 200)).toThrow(CostGateError);
  held[0].release();
  expect(() => b.reserve(MINI, 4000, 200)).not.toThrow();
});

test("settling records the real cost and frees the rest of the hold", () => {
  const b = new Budget(pricing, 1);
  const r = b.reserve(MINI, 4000, 200);
  r.settle({ input_tokens: 1000, output_tokens: 10 });
  expect(b.spentUsd).toBeCloseTo(0.000416, 10);
  r.settle({ input_tokens: 1000, output_tokens: 10 }); // second settle is ignored
  expect(b.spentUsd).toBeCloseTo(0.000416, 10);
});

test("the error says nothing was called", () => {
  expect(() => new Budget(pricing, 0).reserve(MINI, 4, 1)).toThrow(/not made/);
});
