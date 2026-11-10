import { CancelledError, toTransportError } from "./errors";

export interface RetryPolicy {
  /** Per attempt, in milliseconds (LangChain/OpenAI timeouts are ms: docs/langchain_notes.md #2). */
  timeoutMs: number;
  /** Wait before attempt 2, 3, …; its length is the number of retries. */
  backoffMs: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY: RetryPolicy = { timeoutMs: 30_000, backoffMs: [1_000, 4_000] };

/**
 * Runs one call with a fresh timeout per attempt and retries only retryable
 * transport failures. The result is the last attempt's, so its latency is not
 * inflated by earlier failures; `attempts` says how many it took.
 */
export async function withRetry<T>(
  call: (signal: AbortSignal) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY,
  /** The caller's signal (user cancel). Its abort is a CancelledError, never a retryable timeout. */
  parent?: AbortSignal,
): Promise<{ value: T; attempts: number }> {
  const sleep = policy.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    if (parent?.aborted) throw new CancelledError(parent.reason);
    const timeout = AbortSignal.timeout(policy.timeoutMs);
    try {
      return { value: await call(parent ? AbortSignal.any([timeout, parent]) : timeout), attempts: attempt };
    } catch (e) {
      if (parent?.aborted) throw new CancelledError(e);
      const err = toTransportError(e);
      if (!err.retryable || attempt > policy.backoffMs.length) throw err;
      await sleep(policy.backoffMs[attempt - 1]);
    }
  }
}
