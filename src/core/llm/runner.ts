import { AsyncLocalStorage } from "node:async_hooks";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { z } from "zod";
import type { Usage } from "../cost/pricing";

export interface Msg {
  role: "system" | "user";
  content: string;
}

/** What one model call produced. Raw text is always kept; core zod parses it later. */
export interface RawResult {
  raw_text: string | null;
  finish_reason: string | null;
  refusal: string | null;
  usage: Usage;
  latency_ms: number;
}

/** Fills {{var}} placeholders. Mustache leaves literal JSON braces in prompts alone. */
export async function renderMessages(template: readonly Msg[], vars: Record<string, string>): Promise<Msg[]> {
  const prompt = ChatPromptTemplate.fromMessages(
    template.map((m) => [m.role, m.content] as [string, string]),
    { templateFormat: "mustache" },
  );
  const out = await prompt.formatMessages(vars);
  return out.map((m, i) => ({ role: template[i].role, content: String(m.content) }));
}

interface Tapped {
  body?: string;
  status?: number;
}
const taps = new AsyncLocalStorage<Tapped>();

/**
 * A fetch that remembers the response body of the current call. LangChain throws
 * on bad or truncated JSON and drops refusal text (docs/langchain_notes.md #1),
 * so the runner reads those from the tapped body instead.
 */
export const tapFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const store = taps.getStore();
  if (store) {
    store.status = res.status;
    store.body = await res.clone().text();
  }
  return res;
};

interface OpenAiShape {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * One structured call. Transport failures (HTTP errors, timeouts, network) are
 * thrown for errors.ts to map; anything the model actually said comes back as a
 * RawResult, even when it is not valid JSON.
 */
export async function callStructured(
  model: BaseChatModel,
  messages: readonly Msg[],
  schema: z.ZodType,
  schemaName: string,
  signal?: AbortSignal,
): Promise<RawResult> {
  const response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema: toJsonSchema(schema) } };
  const tapped: Tapped = {};
  const t0 = performance.now();
  let message: Awaited<ReturnType<BaseChatModel["invoke"]>> | undefined;
  let failure: unknown;
  await taps.run(tapped, async () => {
    try {
      message = await model.withConfig({ response_format } as never).invoke(messages.map((m) => [m.role, m.content]), { signal });
    } catch (e) {
      failure = e;
    }
  });
  const latency_ms = Math.round(performance.now() - t0);
  // No 2xx body means nothing came back from the model: a transport failure.
  if (failure !== undefined && (tapped.body === undefined || (tapped.status ?? 0) >= 400)) throw failure;

  const body = tapped.body ? (JSON.parse(tapped.body) as OpenAiShape) : {};
  const choice = body.choices?.[0];
  const content = typeof message?.content === "string" && message.content !== "" ? message.content : (choice?.message?.content ?? null);
  const meta = message?.usage_metadata;
  return {
    raw_text: content === "" ? null : content,
    finish_reason: choice?.finish_reason ?? (message?.response_metadata?.finish_reason as string | undefined) ?? null,
    refusal: choice?.message?.refusal ?? null,
    usage: meta
      ? { input_tokens: meta.input_tokens, output_tokens: meta.output_tokens }
      : { input_tokens: body.usage?.prompt_tokens ?? 0, output_tokens: body.usage?.completion_tokens ?? 0 },
    latency_ms,
  };
}
