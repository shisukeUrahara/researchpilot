import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { initChatModel } from "langchain";
import { ratesFor, type Pricing } from "../cost/pricing";
import type { ModelRole } from "./config";

export interface ModelAccess {
  apiKey: string;
  /** Point the provider client somewhere else (tests use a local mock server). */
  baseURL?: string;
  /** fetch used by the provider client; runner.ts passes its tap so raw replies are kept. */
  fetch?: typeof fetch;
}

/**
 * Builds a LangChain chat model for one role. Any provider LangChain knows works
 * here once its package is installed; the spec string picks it.
 * LangChain's own retries are off (maxRetries 0): retry.ts owns retries, so
 * latency and retry counts stay measurable.
 */
export async function makeModel(role: ModelRole, pricing: Pricing, access: ModelAccess): Promise<BaseChatModel> {
  ratesFor(pricing, role.spec); // fail fast: no price, no live calls
  const model = await initChatModel(role.spec, {
    temperature: role.params.temperature,
    maxTokens: role.params.maxTokens,
    maxRetries: 0,
    apiKey: access.apiKey,
    configuration: { ...(access.baseURL ? { baseURL: access.baseURL } : {}), ...(access.fetch ? { fetch: access.fetch } : {}) },
  });
  return model as unknown as BaseChatModel;
}
