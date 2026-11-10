import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** One scripted reply. The server pops one per request; the last one repeats. */
export type Reply =
  | { kind: "ok"; content: string; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { kind: "badJson" }
  | { kind: "truncated" }
  | { kind: "refusal"; text?: string }
  | { kind: "http"; status: number }
  | { kind: "hang" };

export const ok = (value: unknown, usage?: { prompt_tokens: number; completion_tokens: number }): Reply => ({
  kind: "ok",
  content: typeof value === "string" ? value : JSON.stringify(value),
  usage,
});

export interface MockServer {
  baseURL: string;
  /** Parsed JSON bodies of every request, in order. */
  requests: Record<string, unknown>[];
  paths: string[];
  close: () => Promise<void>;
}

function completion(body: Record<string, unknown>, message: Record<string, unknown>, finish: string, usage = { prompt_tokens: 50, completion_tokens: 20 }) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: 0,
    model: body.model ?? "mock",
    choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: finish, logprobs: null }],
    usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens },
  };
}

/**
 * A tiny local stand-in for the OpenAI chat completions API. Real LangChain
 * code talks to it through `configuration.baseURL`, so tests exercise the real
 * request/response path with no network and no cost.
 */
export async function startMockServer(script: Reply[]): Promise<MockServer> {
  const requests: Record<string, unknown>[] = [];
  const paths: string[] = [];
  const queue = [...script];
  const hanging: ServerResponse[] = [];

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      requests.push(body);
      paths.push(req.url ?? "");
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      switch (reply.kind) {
        case "ok":
          return send(200, completion(body, { content: reply.content }, "stop", reply.usage));
        case "badJson":
          return send(200, completion(body, { content: '{"answer": "unterminated' }, "stop"));
        case "truncated":
          return send(200, completion(body, { content: '{"answer": "cut off mid' }, "length"));
        case "refusal":
          return send(200, completion(body, { content: null, refusal: reply.text ?? "I can't help with that." }, "stop"));
        case "http":
          return send(reply.status, { error: { message: `mock ${reply.status}`, type: "mock_error", code: null } });
        case "hang":
          hanging.push(res); // never answered; closed on shutdown
          return;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    paths,
    close: () =>
      new Promise<void>((resolve) => {
        for (const r of hanging) r.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
