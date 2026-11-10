import type { Command, Deps } from "./deps";
import { doctor } from "./commands/doctor";
import { fetchSources } from "./commands/fetchSources";
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
    // parseArgs rejects unknown or malformed options with an ERR_PARSE_ARGS_* code.
    if (e instanceof Error && "code" in e && String(e.code).startsWith("ERR_PARSE_ARGS")) {
      deps.err(e.message);
      return EXIT.USAGE;
    }
    throw e;
  }
}
