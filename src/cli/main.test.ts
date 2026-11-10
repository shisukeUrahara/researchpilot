import { expect, test } from "vitest";
import { main } from "./main";
import { testDeps } from "./testing/deps";

test("unknown command prints usage with exit 64; help exits 0", async () => {
  const a = testDeps();
  expect(await main(["nope"], a.deps)).toBe(64);
  expect(a.err[0]).toMatch(/usage: rp <doctor/);
  expect(await main(["help"], testDeps().deps)).toBe(0);
});

test("doctor reports mode, folders and approvals", async () => {
  const live = testDeps({ replay: false, approverToken: "t" });
  await main(["doctor"], live.deps);
  expect(live.out).toEqual([
    "live mode, key found",
    "data dir: /tmp/rp-test-data",
    "state dir: /tmp/rp-test-state",
    "approvals: on (RP_APPROVER_TOKEN set)",
  ]);
  const replay = testDeps();
  await main(["doctor"], replay.deps);
  expect(replay.out[0]).toMatch(/^replay mode/);
});
