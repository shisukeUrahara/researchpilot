export type TransportCode = "transport_timeout" | "transport_429" | "transport_5xx" | "transport_network";

/** The caller cancelled the run (user cancel, deadline). Never retried. */
export class CancelledError extends Error {
  constructor(readonly cause: unknown = undefined) {
    super("cancelled by the caller");
    this.name = "CancelledError";
  }
}

/** Retrying these may help; anything else (400, 401, 404 …) will fail the same way again. */
export const RETRYABLE: ReadonlySet<TransportCode> = new Set(["transport_timeout", "transport_429", "transport_5xx", "transport_network"]);

/** A call that never produced model output. Kept apart from schema and semantic failures. */
export class TransportError extends Error {
  constructor(
    readonly code: TransportCode | "transport_other",
    readonly cause: unknown,
  ) {
    super(`${code}: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`);
    this.name = "TransportError";
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.code as TransportCode);
  }
}

/** Replay mode asked for a call that is not in the committed cache. */
export class CacheMissError extends Error {
  constructor(readonly key: string) {
    super(`not in the response cache: ${key.slice(0, 12)}. Run live (set OPENAI_API_KEY) to fill it.`);
    this.name = "CacheMissError";
  }
}

const NETWORK = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_SOCKET"]);

/**
 * Maps a provider error by its shape (status, name, code), not its class, so
 * errors from any LangChain provider map the same way (docs/langchain_notes.md #6).
 */
export function toTransportError(e: unknown): TransportError {
  if (e instanceof TransportError) return e;
  const err = (e ?? {}) as { status?: unknown; name?: unknown };
  const status = typeof err.status === "number" ? err.status : undefined;
  if (status === 429) return new TransportError("transport_429", e);
  if (status !== undefined && status >= 500) return new TransportError("transport_5xx", e);
  if (err.name === "TimeoutError" || err.name === "AbortError") return new TransportError("transport_timeout", e);
  // Connection errors: OpenAI's SDK wraps fetch's "fetch failed" TypeError, whose cause holds ECONNREFUSED etc.
  const ctor = (e as { constructor?: { name?: string } })?.constructor?.name ?? "";
  let c: unknown = e;
  for (let depth = 0; depth < 4 && c && typeof c === "object"; depth++, c = (c as { cause?: unknown }).cause) {
    if (NETWORK.has(String((c as { code?: unknown }).code ?? ""))) return new TransportError("transport_network", e);
  }
  if (ctor === "APIConnectionError" || err.name === "APIConnectionError") return new TransportError("transport_network", e);
  return new TransportError("transport_other", e);
}
