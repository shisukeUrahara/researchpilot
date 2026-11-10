import { describe, expect, test } from "vitest";
import { loadModelRoles } from "../llm/config";
import { Pricing, actualUsd, loadPricing, ratesFor, worstCaseUsd } from "./pricing";

const pricing = loadPricing("pricing.json");
const MINI = "openai:gpt-4.1-mini-2025-04-14";

describe("pricing.json", () => {
  test("matches the schema and carries a source and date", () => {
    expect(Pricing.safeParse(pricing).success).toBe(true);
    expect(pricing.source_url).toMatch(/^https:/);
  });
  test("every configured model role has a price", () => {
    for (const role of Object.values(loadModelRoles(process.cwd()))) expect(() => ratesFor(pricing, role.spec)).not.toThrow();
  });
});

describe("cost", () => {
  test("actual: 1000 in + 200 out on mini = 0.0004 + 0.00032", () => {
    expect(actualUsd(pricing, MINI, { input_tokens: 1000, output_tokens: 200 })).toBeCloseTo(0.00072, 10);
  });
  test("worst case: 4000 chars = 1000 tokens in, plus the full 200 out", () => {
    expect(worstCaseUsd(pricing, MINI, 4000, 200)).toBeCloseTo(0.00072, 10);
  });
  test("an unpriced model is refused with a clear message", () => {
    expect(() => ratesFor(pricing, "anthropic:claude-haiku")).toThrow(/no price for "anthropic:claude-haiku"/);
  });
});
