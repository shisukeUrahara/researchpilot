import { parseArgs } from "node:util";
import { continueRun, rebuildRunRows, requestFor } from "@/core/graph/runner";
import { openStore } from "@/core/store/db";
import type { Command } from "../deps";
import { EXIT } from "../exit";
import { summarize } from "./run";

/** rp cancel --run <id>: the run stops with CANCELLED before its next step. */
export const cancel: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { run: { type: "string" } } });
  if (!values.run) {
    deps.err("usage: rp cancel --run <run id>");
    return EXIT.USAGE;
  }
  const store = openStore(deps.stateDir);
  try {
    if (!store.getRun(values.run)) {
      deps.err(`no run ${values.run}`);
      return EXIT.CHECK_FAILED;
    }
    store.requestCancel(values.run, deps.now().toISOString());
    deps.out(`cancel requested for ${values.run}; it stops before its next step`);
    return EXIT.OK;
  } finally {
    store.close();
  }
};

/**
 * rp resume --run <id>: continues a run from its last checkpoint. After a crash it picks up at the step
 * that was running; a run paused for approval continues once the approval is decided.
 */
export const resume: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { run: { type: "string" }, "max-usd": { type: "string", default: "0.5" }, replay: { type: "boolean", default: false } } });
  if (!values.run) {
    deps.err("usage: rp resume --run <run id>");
    return EXIT.USAGE;
  }
  const store = openStore(deps.stateDir);
  let req;
  let paused = false;
  try {
    req = requestFor(store, values.run, deps.dataDir);
    paused = store.getRun(values.run)!.status === "awaiting_approval";
  } finally {
    store.close();
  }
  const out = await continueRun(deps.runner(Number(values["max-usd"]), values.replay), req, paused ? { resume: true } : null);
  for (const l of summarize(out)) deps.out(l);
  return EXIT.OK;
};

/** rp rebuild-db: the runs table rebuilt from the checkpoints. */
export const rebuildDb: Command = async (_argv, deps) => {
  const changed = await rebuildRunRows(deps.stateDir, deps.now());
  for (const c of changed) deps.out(`${c.runId}: ${c.from} → ${c.to}`);
  deps.out(`${changed.length} run rows updated from checkpoints`);
  return EXIT.OK;
};
