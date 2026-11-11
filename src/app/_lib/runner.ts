import { randomBytes } from "node:crypto";
import path from "node:path";
import { Arm } from "@/core/domain/schemas";
import { continueRun, requestFor, startRun, type RunnerEnv } from "@/core/graph/runner";
import { ResponseCache } from "@/core/llm/cache";
import { recordEvent } from "@/core/run/events";
import { openStore } from "@/core/store/db";
import { env, scenarioById } from "./data";

let cache: ResponseCache | null = null;

function runnerEnv(): RunnerEnv {
  const e = env();
  cache ??= new ResponseCache(path.join(e.dataDir, "cache", "llm"));
  return { dataDir: e.dataDir, stateDir: e.stateDir, apiKey: e.apiKey, cache, maxUsd: 0.5, now: () => new Date() };
}

/** Marks a run that could not go on (no key and not in the replay cache, or an error). */
function failRun(runId: string, why: string): void {
  const store = openStore(env().stateDir);
  try {
    const row = store.getRun(runId);
    if (!row) return;
    store.upsertRun({ ...row, status: "failed", stop_reason: "ERROR", updated_at: new Date().toISOString() });
    recordEvent(store, { runId, stepNo: 999, node: "stop", seq: 0, kind: "ERROR", virtualMs: 0, detail: { reason: why } });
  } finally {
    store.close();
  }
}

const reason = (e: unknown) => ((e as Error).name === "CacheMissError" ? "live mode needs a key: this run is not in the replay cache" : (e as Error).message.slice(0, 200));

/**
 * Starts a sample run in the background and returns its id at once. The page polls the timeline.
 * With no key it replays the committed cache through the real graph; anything not cached fails cleanly.
 */
export function startSample(scenarioId: string, arm: string): string {
  const scenario = scenarioById(scenarioId);
  if (!scenario) throw new Error(`unknown sample ${scenarioId}`);
  const runId = `run_${randomBytes(8).toString("hex")}`;
  void startRun(runnerEnv(), { arm: Arm.parse(arm), scenario, approvals: "interrupt", runId }).catch((e) => failRun(runId, reason(e)));
  return runId;
}

/** Continues a paused run after the approver decided. */
export function resumeRun(runId: string): void {
  const store = openStore(env().stateDir);
  let req;
  try {
    req = requestFor(store, runId, env().dataDir);
  } finally {
    store.close();
  }
  void continueRun(runnerEnv(), req, { resume: true }).catch((e) => failRun(runId, reason(e)));
}
