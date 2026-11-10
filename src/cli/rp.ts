import { existsSync } from "node:fs";
import { loadEnv } from "@/core/env";
import { main } from "./main";

// Node built-in; does not override variables that are already set.
if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv(process.env);

main(process.argv.slice(2), {
  dataDir: env.dataDir,
  stateDir: env.stateDir,
  replay: env.mode === "replay",
  approverToken: env.approverToken,
  now: () => new Date(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
