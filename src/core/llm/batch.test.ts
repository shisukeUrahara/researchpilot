import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { loadPricing } from "../cost/pricing";
import { Budget } from "../runner/budget";
import { runMany } from "./batch";
import { ResponseCache } from "./cache";
import { loadModelRoles } from "./config";
import { Gateway, type CallRequest } from "./gateway";
import { ok, startMockServer, type MockServer } from "./testing/mockServer";

const pricing = loadPricing("pricing.json");
const role = loadModelRoles(process.cwd()).actor;
let srv: MockServer | undefined;
afterEach(async () => srv?.close());
const req = (repeat: number): CallRequest => ({ role, messages: [{ role: "user", content: "q" }], schema: z.object({ a: z.string() }), schemaName: "x", arm: "A", repeat });

test("all calls run; a failing one keeps its slot as an Error; results are cached", async () => {
  srv = await startMockServer([ok({ a: "1" }), { kind: "http", status: 400 }, ok({ a: "1" })]);
  const cache = new ResponseCache(path.join(mkdtempSync(path.join(tmpdir(), "rp-")), "r"));
  const g = new Gateway(cache, { apiKey: "sk-test", pricing, budget: new Budget(pricing, 1), baseURL: srv.baseURL, retry: { timeoutMs: 2000, backoffMs: [] } });
  const out = await runMany(g, [req(0), req(1), req(2)], 1);
  expect(out.filter((x) => x instanceof Error)).toHaveLength(1);
  expect(out.filter((x) => !(x instanceof Error))).toHaveLength(2);
  const again = await runMany(g, [req(0), req(2)], 2);
  expect(again.every((x) => !(x instanceof Error) && x.cached)).toBe(true);
  expect(srv.requests).toHaveLength(3);
});
