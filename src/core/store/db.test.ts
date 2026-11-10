import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import { openStore, Store, type ToolEventRow } from "./db";

let s: Store;
const run = {
  run_id: "r1",
  arm: "bounded",
  brief_id: "three-minute",
  scenario_id: null,
  policy: "strict",
  status: "running",
  stop_reason: null,
  created_at: "t0",
  updated_at: "t0",
};
const ev = (over: Partial<ToolEventRow> = {}): ToolEventRow => ({
  run_id: "r1",
  step_no: 1,
  args_hash: "h1",
  tool: "search_docs",
  args_json: "{}",
  outcome: "ok",
  executed: 1,
  result_json: "[]",
  request_id: "q1",
  virtual_ms: 500,
  ...over,
});

beforeEach(() => {
  s = new Store();
  s.upsertRun(run);
});

test("run upsert updates status and stop reason", () => {
  s.upsertRun({ ...run, status: "completed", stop_reason: "VERIFIED", updated_at: "t1" });
  expect(s.getRun("r1")).toMatchObject({ status: "completed", stop_reason: "VERIFIED", created_at: "t0" });
});

test("the same tool event twice is stored once", () => {
  expect(s.insertToolEvent(ev())).toBe(true);
  expect(s.insertToolEvent(ev({ result_json: "changed" }))).toBe(false);
  expect(s.toolEvents("r1")).toHaveLength(1);
  expect(s.getToolEvent("r1", 1, "h1")?.result_json).toBe("[]");
});

test("the same event twice is stored once", () => {
  const e = { run_id: "r1", step_no: 1, node: "act", seq: 0, kind: "proposal", request_id: "q", virtual_ms: 0, detail_json: "{}" };
  expect(s.insertEvent(e)).toBe(true);
  expect(s.insertEvent(e)).toBe(false);
  expect(s.events("r1")).toHaveLength(1);
});

test("a throw inside a nested transaction rolls back the whole outer transaction", () => {
  expect(() =>
    s.tx(() => {
      s.insertToolEvent(ev({ args_hash: "a" }));
      s.tx(() => {
        s.insertToolEvent(ev({ args_hash: "b" }));
        throw new Error("boom");
      });
    }),
  ).toThrow("boom");
  expect(s.toolEvents("r1")).toHaveLength(0);
});

test("an inner throw that is caught keeps the outer writes", () => {
  s.tx(() => {
    s.insertToolEvent(ev({ args_hash: "a" }));
    try {
      s.tx(() => {
        s.insertToolEvent(ev({ args_hash: "b" }));
        throw new Error("inner");
      });
    } catch {
      // savepoint rolled back, outer continues
    }
  });
  expect(s.toolEvents("r1").map((e) => e.args_hash)).toEqual(["a"]);
});

test("outbox row and its tool event are saved together, and only once", () => {
  const mail = { to_addr: "x@example.com", subject: "memo", body: "hi" };
  expect(s.insertToolEventWithOutbox(ev({ tool: "send_email" }), mail)).toBe(true);
  expect(s.insertToolEventWithOutbox(ev({ tool: "send_email" }), mail)).toBe(false);
  expect(s.outbox("r1")).toHaveLength(1);
});

test("outbox row without its tool event is impossible (foreign key)", () => {
  expect(() =>
    s.db.prepare("INSERT INTO outbox VALUES ('r1', 9, 'zz', 'a', 'b', 'c')").run(),
  ).toThrow(/FOREIGN KEY/);
});

test("openStore creates the state dir and the DB file", () => {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "rp-")), "nested", "var");
  const store = openStore(dir);
  store.upsertRun(run);
  store.close();
  const again = openStore(dir);
  expect(again.getRun("r1")?.brief_id).toBe("three-minute");
  again.close();
});
