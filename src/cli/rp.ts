import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "@/core/env";
import { ResponseCache } from "@/core/llm/cache";
import { main } from "./main";

// Node built-in; does not override variables that are already set.
if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv(process.env);
// One replay cache per process, shared by every run (identical calls in flight share one request).
const cache = new ResponseCache(path.join(env.dataDir, "cache", "llm"));

main(process.argv.slice(2), {
  dataDir: env.dataDir,
  stateDir: env.stateDir,
  replay: env.mode === "replay",
  approverToken: env.approverToken,
  runner: (maxUsd, replay = false) => ({
    dataDir: env.dataDir,
    stateDir: env.stateDir,
    apiKey: replay ? null : env.apiKey,
    cache: cache,
    maxUsd,
    now: () => new Date(),
  }),
  now: () => new Date(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
