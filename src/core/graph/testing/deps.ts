import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadBudgetConfig } from "../../budget/runBudget";
import { loadPricing } from "../../cost/pricing";
import { ResponseCache } from "../../llm/cache";
import { loadModelRoles } from "../../llm/config";
import { Gateway } from "../../llm/gateway";
import { startMockServer, type MockServer, type Reply } from "../../llm/testing/mockServer";
import { Budget } from "../../runner/budget";
import type { ModelDeps } from "../model";

/** Model deps that talk to the local mock OpenAI server: the real Gateway and LangChain path, no network. */
export async function mockModelDeps(script: Reply[], arm = "bounded"): Promise<{ deps: ModelDeps; srv: MockServer }> {
  const srv = await startMockServer(script);
  const dir = process.cwd();
  const pricing = loadPricing(path.join(dir, "pricing.json"));
  const cache = new ResponseCache(path.join(mkdtempSync(path.join(tmpdir(), "rp-cache-")), "llm"));
  const gateway = new Gateway(cache, { apiKey: "sk-test", pricing, budget: new Budget(pricing, 5), baseURL: srv.baseURL });
  return { srv, deps: { gateway, roles: loadModelRoles(dir), pricing, budget: loadBudgetConfig(dir), arm } };
}
