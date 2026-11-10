import type { Command } from "../deps";
import { EXIT } from "../exit";

/** Says whether live calls are possible and where data and state live. */
export const doctor: Command = async (_argv, deps) => {
  deps.out(deps.replay ? "replay mode: no OPENAI_API_KEY, model calls come from cache/llm only" : "live mode, key found");
  deps.out(`data dir: ${deps.dataDir}`);
  deps.out(`state dir: ${deps.stateDir}`);
  deps.out(`approvals: ${deps.approverToken ? "on (RP_APPROVER_TOKEN set)" : "off (set RP_APPROVER_TOKEN)"}`);
  return EXIT.OK;
};
