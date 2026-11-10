import { expect, test } from "vitest";
import { loadEnv, requireLive } from "./env";

test("no key means replay mode; state dir defaults to var/ under the data dir", () => {
  const env = loadEnv({}, "/repo");
  expect(env).toEqual({ mode: "replay", apiKey: null, dataDir: "/repo", stateDir: "/repo/var", approverToken: null });
});

test("key, data dir, state dir and approver token are read", () => {
  const env = loadEnv({ OPENAI_API_KEY: " sk-x ", RP_DATA_DIR: "/d", RP_STATE_DIR: "/s", RP_APPROVER_TOKEN: "t" });
  expect(env).toMatchObject({ mode: "live", apiKey: "sk-x", dataDir: "/d", stateDir: "/s", approverToken: "t" });
});

test("empty key counts as no key", () => {
  expect(loadEnv({ OPENAI_API_KEY: "" }).mode).toBe("replay");
});

test("requireLive explains how to fix a missing key", () => {
  expect(() => requireLive({ apiKey: null })).toThrow(/OPENAI_API_KEY is not set.*--replay/);
});
