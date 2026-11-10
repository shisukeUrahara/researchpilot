import { expect, test } from "vitest";
import { loadPricing } from "../cost/pricing";
import { loadModelRoles } from "./config";
import { makeModel } from "./models";

const pricing = loadPricing("pricing.json");
const roles = loadModelRoles(process.cwd());

test("builds a chat model for a configured role without calling the network", async () => {
  const model = await makeModel(roles.actor, pricing, { apiKey: "sk-test" });
  expect(typeof model.invoke).toBe("function");
});

test("refuses a model with no price row", async () => {
  await expect(makeModel({ ...roles.actor, spec: "openai:gpt-9" }, pricing, { apiKey: "sk-test" })).rejects.toThrow(/no price/);
});
