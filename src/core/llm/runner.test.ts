import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { loadPricing } from "../cost/pricing";
import { loadModelRoles } from "./config";
import { makeModel } from "./models";
import { callStructured, renderMessages, tapFetch } from "./runner";
import { ok, startMockServer, type MockServer, type Reply } from "./testing/mockServer";

const S = z.object({ answer: z.string(), refusal_reason: z.string().nullable() });
const role = loadModelRoles(process.cwd()).actor;
const pricing = loadPricing("pricing.json");
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

async function call(script: Reply[]) {
  srv = await startMockServer(script);
  const model = await makeModel(role, pricing, { apiKey: "sk-test", baseURL: srv.baseURL, fetch: tapFetch });
  return callStructured(model, [{ role: "user", content: "q" }], S, "answer");
}

test("renders mustache vars and keeps literal braces", async () => {
  const msgs = await renderMessages([{ role: "system", content: 'Reply as {"answer": ...}. Case {{id}}' }, { role: "user", content: "{{q}}" }], { id: "c001", q: "refund?" });
  expect(msgs).toEqual([{ role: "system", content: 'Reply as {"answer": ...}. Case c001' }, { role: "user", content: "refund?" }]);
});

test("a good reply: raw text, finish reason and usage", async () => {
  const r = await call([ok({ answer: "no", refusal_reason: null }, { prompt_tokens: 12, completion_tokens: 5 })]);
  expect(r).toMatchObject({ raw_text: '{"answer":"no","refusal_reason":null}', finish_reason: "stop", refusal: null, usage: { input_tokens: 12, output_tokens: 5 } });
  expect(r.latency_ms).toBeGreaterThanOrEqual(0);
  expect(srv!.requests[0]).toMatchObject({ temperature: 0, response_format: { type: "json_schema", json_schema: { strict: true } } });
});

test("bad JSON is kept raw instead of throwing", async () => {
  const r = await call([{ kind: "badJson" }]);
  expect(r).toMatchObject({ raw_text: '{"answer": "unterminated', finish_reason: "stop" });
});

test("a truncated reply is kept raw with finish_reason length", async () => {
  expect(await call([{ kind: "truncated" }])).toMatchObject({ raw_text: '{"answer": "cut off mid', finish_reason: "length" });
});

test("a refusal keeps its text", async () => {
  expect(await call([{ kind: "refusal", text: "I can't help with that." }])).toMatchObject({ raw_text: null, refusal: "I can't help with that." });
});

test("HTTP errors are thrown for the error mapper, not returned as output", async () => {
  await expect(call([{ kind: "http", status: 500 }])).rejects.toMatchObject({ status: 500 });
});
