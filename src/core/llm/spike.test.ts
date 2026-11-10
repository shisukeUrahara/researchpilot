/**
 * Pins how LangChain 1.6 / @langchain/openai 1.8 really behave, so an upgrade
 * that changes any of this fails loudly. Findings are written up in
 * docs/langchain_notes.md. Live checks run only with RP_LIVE=1 and a key.
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { existsSync } from "node:fs";
import { initChatModel } from "langchain";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { loadModelRoles } from "./config";
import { ok, startMockServer, type MockServer, type Reply } from "./testing/mockServer";

const S = z.object({ answer: z.string(), refusal_reason: z.string().nullable() });
const SPEC = "openai:gpt-4.1-mini-2025-04-14";
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

async function modelFor(script: Reply[], timeout = 2000) {
  srv = await startMockServer(script);
  return initChatModel(SPEC, { temperature: 0, maxTokens: 50, maxRetries: 0, apiKey: "sk-test", configuration: { baseURL: srv.baseURL }, timeout });
}
const jsonFormat = { type: "json_schema", json_schema: { name: "answer", strict: true, schema: toJsonSchema(S) } };

describe("structured output loses the raw text on failure (1)", () => {
  test("withStructuredOutput(includeRaw) throws on bad JSON instead of returning raw", async () => {
    const m = await modelFor([{ kind: "badJson" }]);
    await expect(m.withStructuredOutput(S, { method: "jsonSchema", includeRaw: true }).invoke("q")).rejects.toThrow(SyntaxError);
  });
  test("a plain response_format call also throws on bad JSON and on truncation", async () => {
    const m = await modelFor([{ kind: "badJson" }, { kind: "truncated" }]);
    const bound = m.withConfig({ response_format: jsonFormat } as never);
    await expect(bound.invoke("q")).rejects.toThrow(/invalid structured output JSON/);
    await expect(bound.invoke("q")).rejects.toThrow(/length limit was reached/);
  });
  test("a refusal comes back as empty content; the refusal text is not in the message", async () => {
    const m = await modelFor([{ kind: "refusal", text: "I can't help" }]);
    const msg = await m.withConfig({ response_format: jsonFormat } as never).invoke("q");
    expect(msg.content).toBe("");
    expect(JSON.stringify(msg.additional_kwargs)).not.toContain("I can't help");
  });
  test("the zod 4 schema becomes a strict JSON schema with nullable as a type union", () => {
    expect(toJsonSchema(S)).toMatchObject({ additionalProperties: false, required: ["answer", "refusal_reason"], properties: { refusal_reason: { type: ["string", "null"] } } });
  });
});

test("timeout is in milliseconds (some docs say seconds) and raises TimeoutError (2)", async () => {
  const m = await modelFor([{ kind: "hang" }], 200);
  const t0 = Date.now();
  await expect(m.invoke("q")).rejects.toMatchObject({ name: "TimeoutError" });
  expect(Date.now() - t0).toBeLessThan(2000);
});

test("batch takes returnExceptions as a third argument, not in the config (3)", async () => {
  const f = RunnableLambda.from(async (x: number) => {
    if (x === 2) throw new Error("boom");
    return x * 10;
  });
  const out = await f.batch([1, 2, 3], { maxConcurrency: 2 }, { returnExceptions: true });
  expect(out[0]).toBe(10);
  expect(out[1]).toBeInstanceOf(Error);
  expect(out[2]).toBe(30);
  await expect(f.batch([1, 2], { maxConcurrency: 2, returnExceptions: true } as never)).rejects.toThrow("boom");
});

test("mustache templates leave literal JSON braces alone (4)", async () => {
  const p = ChatPromptTemplate.fromMessages([["system", 'Return JSON like {"a": 1}. Topic: {{topic}}'], ["user", "{{q}}"]], { templateFormat: "mustache" });
  expect((await p.formatMessages({ topic: "refunds", q: "hello {x}" })).map((m) => m.content)).toEqual(['Return JSON like {"a": 1}. Topic: refunds', "hello {x}"]);
});

test("a model can be created with no API key; it only fails when called (5)", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await expect(initChatModel(SPEC, {})).resolves.toBeDefined();
  } finally {
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  }
});

test("error shapes: 429 and 500 carry status; 429 also an lc_error_code (6)", async () => {
  const m = await modelFor([{ kind: "http", status: 429 }, { kind: "http", status: 500 }]);
  await expect(m.invoke("q")).rejects.toMatchObject({ status: 429, lc_error_code: "MODEL_RATE_LIMIT" });
  await expect(m.invoke("q")).rejects.toMatchObject({ status: 500 });
});

test("usage_metadata uses input_tokens / output_tokens", async () => {
  const m = await modelFor([ok({ answer: "x", refusal_reason: null }, { prompt_tokens: 11, completion_tokens: 7 })]);
  const msg = await m.withConfig({ response_format: jsonFormat } as never).invoke("q");
  expect(msg.usage_metadata).toMatchObject({ input_tokens: 11, output_tokens: 7 });
  expect(msg.response_metadata.finish_reason).toBe("stop");
});

// (7) Live: strict schema with a nullable field, temperature 0, usage present. ~$0.001 for both models.
const live = process.env.RP_LIVE === "1" && existsSync(".env");
describe.skipIf(!live)("live OpenAI (RP_LIVE=1)", () => {
  const roles = loadModelRoles(process.cwd());
  test.each([roles.actor.spec])("%s accepts the strict schema at temperature 0", async (spec) => {
    process.loadEnvFile(".env");
    const m = await initChatModel(spec, { temperature: 0, maxTokens: 60, maxRetries: 0 });
    const msg = await m.withConfig({ response_format: jsonFormat } as never).invoke("Reply with answer 'ok' and refusal_reason null.");
    expect(S.parse(JSON.parse(String(msg.content)))).toEqual({ answer: "ok", refusal_reason: null });
    expect(msg.usage_metadata?.input_tokens).toBeGreaterThan(0);
    expect(msg.response_metadata.finish_reason).toBe("stop");
  }, 30000);
});
