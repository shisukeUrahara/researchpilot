import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { loadPricing } from "../cost/pricing";
import { Budget } from "../runner/budget";
import { ResponseCache } from "./cache";
import { loadModelRoles } from "./config";
import { cacheKey, Gateway, type CallRequest } from "./gateway";
import { CancelledError } from "./errors";
import { ok, startMockServer, type MockServer } from "./testing/mockServer";

const pricing = loadPricing("pricing.json");
const role = loadModelRoles(process.cwd()).actor;
const S = z.object({ a: z.string() });
let srv: MockServer | undefined;
afterEach(async () => srv?.close());

const req = (over: Partial<CallRequest> = {}): CallRequest => ({ role, messages: [{ role: "user", content: "q" }], schema: S, schemaName: "x", arm: "A", repeat: 0, ...over });
const tmp = () => new ResponseCache(path.join(mkdtempSync(path.join(tmpdir(), "rp-")), "responses"));

async function liveGateway(cache: ResponseCache) {
  srv = await startMockServer([ok({ a: "1" })]);
  return new Gateway(cache, { apiKey: "sk-test", pricing, budget: new Budget(pricing, 1), baseURL: srv.baseURL }, () => new Date(0));
}

test("arm and repeat give distinct keys, so null runs and repeats are real calls", () => {
  const keys = new Set(["A", "A2"].flatMap((arm) => [0, 1, 2].map((repeat) => cacheKey(req({ arm, repeat })))));
  expect(keys.size).toBe(6);
});

test("different inputs on the same case never collide (e.g. a canary vs the original)", () => {
  expect(cacheKey(req({ messages: [{ role: "user", content: "answer: 30 days" }] }))).not.toBe(cacheKey(req({ messages: [{ role: "user", content: "answer: 45 days" }] })));
  expect(cacheKey(req({ role: { ...role, params: { ...role.params, maxTokens: 401 } } }))).not.toBe(cacheKey(req()));
  expect(cacheKey(req({ role: { ...role, spec: "openai:gpt-4o-mini-2024-07-18" } }))).not.toBe(cacheKey(req()));
});

test("a live miss calls once, writes the cache, then a replay gateway with no key reads it", async () => {
  const cache = tmp();
  const g = await liveGateway(cache);
  const first = await g.runStructured(req());
  expect(first).toMatchObject({ raw_text: '{"a":"1"}', cached: false, attempts: 1 });
  expect((await g.runStructured(req())).cached).toBe(true);
  expect(srv!.requests).toHaveLength(1);

  const replay = new Gateway(new ResponseCache(cache.dir), null);
  expect(await replay.runStructured(req())).toMatchObject({ raw_text: '{"a":"1"}', cached: true });
  await expect(replay.runStructured(req({ repeat: 1 }))).rejects.toThrow(/not in the response cache/);
});

test("over budget: no call is made and nothing is cached", async () => {
  const cache = tmp();
  srv = await startMockServer([ok({ a: "1" })]);
  const g = new Gateway(cache, { apiKey: "sk-test", pricing, budget: new Budget(pricing, 0), baseURL: srv.baseURL });
  await expect(g.runStructured(req())).rejects.toThrow(/not made/);
  expect(srv.requests).toHaveLength(0);
  expect(g.isCached(req())).toBe(false);
});

test("two identical calls at the same time share one request and write one cache row", async () => {
  const cache = tmp();
  const g = await liveGateway(cache);
  const [a, b] = await Promise.all([g.runStructured(req()), g.runStructured(req())]);
  expect(a.raw_text).toBe(b.raw_text);
  expect(srv!.requests).toHaveLength(1);
  expect([a.cached, b.cached].sort()).toEqual([false, true]);
});

test("a user cancel stops the call with CancelledError and is not retried", async () => {
  srv = await startMockServer([{ kind: "hang" }, { kind: "hang" }, { kind: "hang" }]);
  const g = new Gateway(tmp(), {
    apiKey: "sk-test",
    pricing,
    budget: new Budget(pricing, 1),
    baseURL: srv.baseURL,
    retry: { timeoutMs: 5000, backoffMs: [10, 10] },
  });
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 100);
  await expect(g.runStructured(req(), ctl.signal)).rejects.toBeInstanceOf(CancelledError);
  expect(srv.requests).toHaveLength(1);
});
