import { afterEach, expect, test } from "vitest";
import { ok, startMockServer, type MockServer } from "./mockServer";

let server: MockServer | undefined;
afterEach(async () => server?.close());

async function post(s: MockServer, signal?: AbortSignal) {
  const res = await fetch(`${s.baseURL}/chat/completions`, { method: "POST", body: JSON.stringify({ model: "m" }), signal });
  return { status: res.status, body: (await res.json()) as { choices?: { message: { content: string | null; refusal?: string }; finish_reason: string }[] } };
}

test("replies follow the script, the last one repeats, requests are recorded", async () => {
  server = await startMockServer([ok({ a: 1 }), { kind: "http", status: 429 }]);
  expect((await post(server)).body.choices![0].message.content).toBe('{"a":1}');
  expect((await post(server)).status).toBe(429);
  expect((await post(server)).status).toBe(429);
  expect(server.requests).toHaveLength(3);
  expect(server.paths[0]).toBe("/v1/chat/completions");
});

test("truncated and refusal replies look like the real API", async () => {
  server = await startMockServer([{ kind: "truncated" }, { kind: "refusal", text: "no" }]);
  expect((await post(server)).body.choices![0].finish_reason).toBe("length");
  const r = (await post(server)).body.choices![0].message;
  expect([r.content, r.refusal]).toEqual([null, "no"]);
});

test("hang never answers until the caller gives up", async () => {
  server = await startMockServer([{ kind: "hang" }]);
  await expect(post(server, AbortSignal.timeout(100))).rejects.toThrow();
});
