import { parseArgs } from "node:util";
import { ApprovalError, decide } from "@/core/approvals/approvals";
import { ForbiddenError } from "@/core/auth/token";
import { openStore } from "@/core/store/db";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** rp approve <approval id> --token <approver token> [--deny] */
export const approve: Command = async (argv, deps) => {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { token: { type: "string" }, deny: { type: "boolean", default: false } } });
  const id = positionals[0];
  if (!id) {
    deps.err("usage: rp approve <approval id> --token <approver token> [--deny]");
    return EXIT.USAGE;
  }
  const store = openStore(deps.stateDir);
  try {
    const a = decide(store, id, values.deny ? "denied" : "approved", values.token ?? null, deps.approverToken, deps.now());
    deps.out(`${a.approval_id} ${a.status}: ${a.tool} ${a.args_json}`);
    return EXIT.OK;
  } catch (e) {
    if (e instanceof ForbiddenError) {
      deps.err(e.message);
      return EXIT.FORBIDDEN;
    }
    if (e instanceof ApprovalError) {
      deps.err(e.message);
      return EXIT.CHECK_FAILED;
    }
    throw e;
  } finally {
    store.close();
  }
};
