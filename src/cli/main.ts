import { CacheMissError } from "@/core/llm/errors";
import { CostGateError } from "@/core/runner/budget";
import type { Command, Deps } from "./deps";
import { approve } from "./commands/approve";
import { evalCmd } from "./commands/eval";
import { gate, report } from "./commands/report";
import { reproduce } from "./commands/reproduce";
import { cancel, rebuildDb, resume } from "./commands/control";
import { doctor } from "./commands/doctor";
import { fetchSources } from "./commands/fetchSources";
import { run } from "./commands/run";
import { timeline } from "./commands/timeline";
import { applyGoldReviewCmd } from "./commands/goldReview";
import { buildPassages, verify } from "./commands/verify";
import { EXIT } from "./exit";

/** Commands are added one per commit as the agent grows. */
export const COMMANDS: Record<string, Command> = {
  doctor,
  "fetch-sources": fetchSources,
  "build-passages": buildPassages,
  verify,
  "apply-gold-review": applyGoldReviewCmd,
  approve,
  run,
  timeline,
  cancel,
  resume,
  "rebuild-db": rebuildDb,
  eval: evalCmd,
  report,
  gate,
  reproduce,
};

export async function main(argv: string[], deps: Deps, commands = COMMANDS): Promise<number> {
  const [name, ...rest] = argv;
  const command = name === undefined || name === "help" ? undefined : commands[name];
  if (!command) {
    deps.err(`usage: rp <${Object.keys(commands).join("|")}> [options]`);
    return name === "help" ? EXIT.OK : EXIT.USAGE;
  }
  try {
    return await command(rest, deps);
  } catch (e) {
    if (e instanceof CacheMissError) {
      deps.err(e.message);
      return EXIT.CACHE_MISS;
    }
    if (e instanceof CostGateError) {
      deps.err(e.message);
      return EXIT.BUDGET;
    }
    // parseArgs rejects unknown or malformed options with an ERR_PARSE_ARGS_* code.
    if (e instanceof Error && "code" in e && String(e.code).startsWith("ERR_PARSE_ARGS")) {
      deps.err(e.message);
      return EXIT.USAGE;
    }
    throw e;
  }
}
