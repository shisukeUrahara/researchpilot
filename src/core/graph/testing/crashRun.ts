/**
 * Child process for the crash test: replays a run from the shared cache (no key) and SIGKILLs itself
 * at the start of step 4, after step 3 is checkpointed. The parent then resumes the run.
 * Usage: node --import tsx crashRun.ts <state dir> <cache dir> <run id>
 */
import path from "node:path";
import { ResponseCache } from "../../llm/cache";
import { startRun } from "../runner";

const [stateDir, cacheDir, runId] = process.argv.slice(2);
void startRun(
  { dataDir: process.cwd(), stateDir, apiKey: null, cache: new ResponseCache(path.resolve(cacheDir)), maxUsd: 0, now: () => new Date("2026-11-11T10:00:00Z") },
  { arm: "bounded", briefId: "duration-only", approvals: "deny", runId, onStep: (n) => n === 4 && process.kill(process.pid, "SIGKILL") },
);
