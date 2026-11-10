import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { z } from "zod";
import type { Pricing } from "../cost/pricing";
import { canonicalJson, sha256Hex } from "../prompts/canonical";
import type { Budget } from "../runner/budget";
import { CACHE_V, type CacheEntry, type ResponseCache } from "./cache";
import type { ModelRole } from "./config";
import { CacheMissError } from "./errors";
import { makeModel } from "./models";
import { DEFAULT_RETRY, withRetry, type RetryPolicy } from "./retry";
import { callStructured, tapFetch, type Msg, type RawResult } from "./runner";

/** One call the app wants made. `arm` and `repeat` keep repeated or null-run calls apart in the cache. */
export interface CallRequest {
  role: ModelRole;
  messages: Msg[];
  schema: z.ZodType;
  schemaName: string;
  arm: string;
  repeat: number;
}

export interface CallResult extends RawResult {
  cached: boolean;
  attempts: number;
  cache_key: string;
}

export interface LiveAccess {
  apiKey: string;
  pricing: Pricing;
  budget: Budget;
  retry?: RetryPolicy;
  baseURL?: string;
}

/**
 * Key = everything that can change the answer: model spec, method, params, the
 * rendered messages, the output schema, plus arm and repeat.
 */
export function cacheKey(req: CallRequest): string {
  return sha256Hex(
    canonicalJson({
      cache_v: CACHE_V,
      spec: req.role.spec,
      method: req.role.method,
      params: req.role.params,
      messages: req.messages,
      schema: toJsonSchema(req.schema),
      schema_name: req.schemaName,
      arm: req.arm,
      repeat: req.repeat,
    }),
  );
}

/**
 * The one entry point the app uses for model calls. Cache first; on a miss it
 * builds the LangChain model (lazily, so replay never needs a key), checks the
 * budget, calls with retries, and appends the result to the cache.
 */
export class Gateway {
  private models = new Map<string, Promise<BaseChatModel>>();
  /** Calls in progress by cache key: two identical calls at once share one request and one cache row. */
  private inFlight = new Map<string, Promise<CallResult>>();

  constructor(
    private readonly cache: ResponseCache,
    private readonly live: LiveAccess | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isCached(req: CallRequest): boolean {
    return this.cache.get(req.role.spec, cacheKey(req)) !== undefined;
  }

  async runStructured(req: CallRequest, signal?: AbortSignal): Promise<CallResult> {
    const k = cacheKey(req);
    const hit = this.cache.get(req.role.spec, k);
    if (hit) return fromEntry(hit, true);
    if (!this.live) throw new CacheMissError(k);
    const pending = this.inFlight.get(k);
    if (pending) return pending.then((r) => ({ ...r, cached: true }));
    const p = this.callLive(req, k, this.live, signal).finally(() => this.inFlight.delete(k));
    this.inFlight.set(k, p);
    return p;
  }

  private async callLive(req: CallRequest, k: string, live: LiveAccess, signal?: AbortSignal): Promise<CallResult> {
    const modelKey = canonicalJson(req.role);
    if (!this.models.has(modelKey)) {
      this.models.set(modelKey, makeModel(req.role, live.pricing, { apiKey: live.apiKey, baseURL: live.baseURL, fetch: tapFetch }));
    }
    const model = await this.models.get(modelKey)!;
    const chars = req.messages.reduce((n, m) => n + m.content.length, 0);
    const hold = live.budget.reserve(req.role.spec, chars, req.role.params.maxTokens);
    let out: { value: RawResult; attempts: number };
    try {
      out = await withRetry((s) => callStructured(model, req.messages, req.schema, req.schemaName, s), live.retry ?? DEFAULT_RETRY, signal);
    } catch (e) {
      hold.release();
      throw e;
    }
    hold.settle(out.value.usage);
    const entry: CacheEntry = { k, ...out.value, attempts: out.attempts, created_at: this.now().toISOString() };
    this.cache.put(req.role.spec, entry);
    return fromEntry(entry, false);
  }
}

function fromEntry(e: CacheEntry, cached: boolean): CallResult {
  return { raw_text: e.raw_text, finish_reason: e.finish_reason, refusal: e.refusal, usage: e.usage, latency_ms: e.latency_ms, attempts: e.attempts, cached, cache_key: e.k };
}
