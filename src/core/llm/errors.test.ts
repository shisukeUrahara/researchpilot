import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { loadPricing } from "../cost/pricing";
import { loadModelRoles } from "./config";
import { CacheMissError, toTransportError } from "./errors";
import { makeModel } from "./models";
import { callStructured, tapFetch } from "./runner";
import { startMockServer, type MockServer, type Reply } from "./testing/mockServer";

let srv: MockServer | undefined;
afterEach(async () => srv?.close());

async function failure(reply: Reply, baseURL?: string) {
  if (!baseURL) {
    srv = await startMockServer([reply]);
    baseURL = srv.baseURL;
  }
  const model = await makeModel({ ...loadModelRoles(process.cwd()).actor }, loadPricing("pricing.json"), { apiKey: "sk-test", baseURL, fetch: tapFetch });
  try {
    await callStructured(model, [{ role: "user", content: "q" }], z.object({ a: z.string() }), "x", AbortSignal.timeout(300));
  } catch (e) {
    return toTransportError(e);
  }
  throw new Error("expected a failure");
}

test.each([
  [{ kind: "http", status: 429 } as Reply, "transport_429", true],
  [{ kind: "http", status: 500 } as Reply, "transport_5xx", true],
  [{ kind: "http", status: 503 } as Reply, "transport_5xx", true],
  [{ kind: "http", status: 400 } as Reply, "transport_other", false],
  [{ kind: "hang" } as Reply, "transport_timeout", true],
])("real LangChain error for %o maps to %s", async (reply, code, retryable) => {
  const e = await failure(reply);
  expect(e.code).toBe(code);
  expect(e.retryable).toBe(retryable);
});

test("a refused connection is a network error", async () => {
  expect((await failure({ kind: "hang" }, "http://127.0.0.1:9/v1")).code).toBe("transport_network");
});

test("cache miss names the key prefix and how to fix it", () => {
  expect(new CacheMissError("abcdef0123456789").message).toMatch(/abcdef012345.*OPENAI_API_KEY/);
});
