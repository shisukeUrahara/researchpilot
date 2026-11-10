import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { loadPricing } from "../cost/pricing";
import { loadModelRoles } from "./config";
import { makeModel } from "./models";
import { withRetry } from "./retry";
import { callStructured, tapFetch } from "./runner";
import { ok, startMockServer, type MockServer, type Reply } from "./testing/mockServer";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());
const waits: number[] = [];
const policy = { timeoutMs: 200, backoffMs: [10, 20], sleep: async (ms: number) => void waits.push(ms) };

async function run(script: Reply[]) {
  srv = await startMockServer(script);
  waits.length = 0;
  const model = await makeModel(loadModelRoles(process.cwd()).actor, loadPricing("pricing.json"), { apiKey: "sk-test", baseURL: srv.baseURL, fetch: tapFetch });
  return withRetry((signal) => callStructured(model, [{ role: "user", content: "q" }], z.object({ a: z.string() }), "x", signal), policy);
}

test("429 then success: two attempts, one backoff", async () => {
  const r = await run([{ kind: "http", status: 429 }, ok({ a: "x" })]);
  expect(r.attempts).toBe(2);
  expect(r.value.raw_text).toBe('{"a":"x"}');
  expect(waits).toEqual([10]);
});

test("a 400 is not retried", async () => {
  await expect(run([{ kind: "http", status: 400 }])).rejects.toMatchObject({ code: "transport_other" });
  expect(srv!.requests).toHaveLength(1);
});

test("a hang times out on every attempt and ends as transport_timeout", async () => {
  await expect(run([{ kind: "hang" }])).rejects.toMatchObject({ code: "transport_timeout" });
  expect(srv!.requests).toHaveLength(3);
  expect(waits).toEqual([10, 20]);
});

test("bad JSON is model output, not a transport failure: no retry", async () => {
  const r = await run([{ kind: "badJson" }, ok({ a: "x" })]);
  expect(r.attempts).toBe(1);
  expect(r.value.raw_text).toContain("unterminated");
});
