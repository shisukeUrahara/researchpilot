# LangChain notes (copied from EvalForge, still true here)

What LangChain.js really does, checked by `src/core/llm/spike.test.ts` on 4 Nov 2026 with
`langchain@1.6.1`, `@langchain/core@1.3.4`, `@langchain/openai@1.8.0`. The offline tests use the
mock OpenAI server (`src/core/llm/testing/mockServer.ts`). The live tests ran once with
`EF_LIVE=1 pnpm vitest run src/core/llm/spike.test.ts -t live` and passed for both
`openai:gpt-4.1-mini-2025-04-14` and `openai:gpt-4o-mini-2024-07-18`.

| # | Question | Finding | What EvalForge does |
|---|---|---|---|
| 1 | Does `withStructuredOutput(schema, { includeRaw: true })` keep the raw text when the JSON is bad? | **No.** It throws a `SyntaxError`; the raw text is gone. A plain `response_format` call also throws (`invalid structured output JSON`, and `length limit was reached` on truncation). A refusal comes back as empty content and the refusal text is not in the message. | The runner never relies on LangChain parsing. It taps the HTTP response body, keeps the raw text, finish reason and refusal, and parses with zod itself. A bad output is scored (`schema_invalid`, `schema_truncated`, `model_refusal`), never lost. |
| 2 | Is `timeout` in seconds or milliseconds? | **Milliseconds** for OpenAI (`timeout: 200` gives up after ~200 ms with `TimeoutError`). Some doc examples say seconds. | Timeouts are set in ms and tested against a hanging mock. |
| 3 | Where does `returnExceptions` go in `batch`? | In the **third** argument: `batch(inputs, { maxConcurrency }, { returnExceptions: true })`. Inside the config it is ignored and the whole batch rejects. | The concurrent runner passes it as the third argument. |
| 4 | Do prompt templates break on JSON braces? | Not with `templateFormat: "mustache"`: `{"a": 1}` stays literal, `{{var}}` is filled. | Prompts use mustache. |
| 5 | Does creating a model need an API key? | No. Creation succeeds; only the call fails. | Models are still built lazily on a cache miss, so replay never touches a client. |
| 6 | What do provider errors look like? | 429: `status: 429`, `lc_error_code: "MODEL_RATE_LIMIT"`. 500: `status: 500`. Timeout: `name: "TimeoutError"`. | Errors are mapped by `status` / `name`, not by class, so other providers map the same way. |
| 7 | Do the real models accept a strict schema with a nullable field at temperature 0? | Yes, both. `usage_metadata` has `input_tokens` / `output_tokens`; `finish_reason` is in `response_metadata`. | Cost comes from `usage_metadata`. |

zod 4 schemas convert with `toJsonSchema` from `@langchain/core/utils/json_schema` into a strict
JSON schema (`additionalProperties: false`, every field required, nullable as `["string", "null"]`).
