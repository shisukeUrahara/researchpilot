import { parseArgs } from "node:util";
import { openStore } from "@/core/store/db";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** rp timeline --run <id>: every event of a run, in virtual-time order, with its request id. */
export const timeline: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { run: { type: "string" } } });
  if (!values.run) {
    deps.err("usage: rp timeline --run <run id>");
    return EXIT.USAGE;
  }
  const store = openStore(deps.stateDir);
  try {
    const run = store.getRun(values.run);
    if (!run) {
      deps.err(`no run ${values.run} in ${deps.stateDir}`);
      return EXIT.CHECK_FAILED;
    }
    deps.out(`run ${run.run_id} · ${run.arm} · ${run.policy} · ${run.status} · stop ${run.stop_reason ?? "-"}`);
    for (const e of store.events(values.run)) {
      const d = JSON.parse(e.detail_json) as Record<string, unknown>;
      const short = Object.entries(d)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
      deps.out(`${String(e.virtual_ms).padStart(7)} ms  step ${String(e.step_no).padStart(2)}  ${e.node.padEnd(8)} ${e.kind.padEnd(18)} ${e.request_id}  ${short}`.slice(0, 220));
    }
    return EXIT.OK;
  } finally {
    store.close();
  }
};
