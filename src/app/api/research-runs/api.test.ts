import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { requestApproval } from "@/core/approvals/approvals";
import { openStore } from "@/core/store/db";

beforeAll(() => {
  process.env.RP_STATE_DIR = mkdtempSync(path.join(tmpdir(), "rp-api-"));
  process.env.RP_APPROVER_TOKEN = "tok";
  delete process.env.OPENAI_API_KEY;
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

test("POST /api/research-runs validates input and answers with a normalized error", async () => {
  const { POST } = await import("./route");
  const bad = await POST(post("{nope"));
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toMatchObject({ code: "bad_json", request_id: expect.stringMatching(/^req_/) });
  const unknown = await POST(post({ scenario_id: "golden-99" }));
  expect(unknown.status).toBe(400);
  expect((await unknown.json()).error.code).toBe("bad_request");
});

test("unknown run ids are 404 on every route", async () => {
  const one = await import("./[id]/route");
  const cancel = await import("./[id]/cancel/route");
  const report = await import("./[id]/report/route");
  expect((await one.GET(new Request("http://x"), ctx("run_missing"))).status).toBe(404);
  expect((await cancel.POST(new Request("http://x", { method: "POST" }), ctx("run_missing"))).status).toBe(404);
  expect((await report.GET(new Request("http://x"), ctx("run_missing"))).status).toBe(404);
});

test("approve needs the approver token: none → 403; cancel of a real run → 202", async () => {
  const store = openStore(process.env.RP_STATE_DIR!);
  store.upsertRun({ run_id: "run_api", arm: "bounded", brief_id: "three-minute", scenario_id: null, policy: "strict", status: "awaiting_approval", stop_reason: null, created_at: "t", updated_at: "t" });
  const a = requestApproval(store, "run_api", "fetch_live", { url: "https://vercel.com/docs/functions/limitations" }, new Date());
  store.close();
  const approve = await import("./[id]/approve/route");
  const noToken = await approve.POST(post({ approval_id: a.approval_id, decision: "approved" }), ctx("run_api"));
  expect(noToken.status).toBe(403);
  const cancel = await import("./[id]/cancel/route");
  expect((await cancel.POST(new Request("http://x", { method: "POST" }), ctx("run_api"))).status).toBe(202);
});
