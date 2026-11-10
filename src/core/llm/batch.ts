import { RunnableLambda } from "@langchain/core/runnables";
import type { CallRequest, CallResult, Gateway } from "./gateway";

/**
 * Runs many calls through the cached, budgeted gateway, `maxConcurrency` at a
 * time. Batches the gateway function, never the raw model, so every call still
 * hits the cache and the budget. One failure does not stop the rest: its slot
 * holds the Error (returnExceptions is LangChain's 3rd batch argument,
 * docs/langchain_notes.md #3).
 */
export async function runMany(gateway: Gateway, requests: readonly CallRequest[], maxConcurrency = 4): Promise<(CallResult | Error)[]> {
  const call = RunnableLambda.from((req: CallRequest) => gateway.runStructured(req));
  return call.batch([...requests], { maxConcurrency }, { returnExceptions: true });
}
