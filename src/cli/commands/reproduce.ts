import { appendFileSync } from "node:fs";
import { reproduceAll } from "@/core/graph/reproduce";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/**
 * rp reproduce: every eval and injection run set replayed from the committed cache with no API key.
 * Exit 1 if any records or metrics differ. In GitHub Actions the table goes to the step summary.
 */
export const reproduce: Command = async (_argv, deps) => {
  const rows = await reproduceAll(deps.runner(0, true));
  const lines = ["| run set | runs | records | metrics | note |", "|---|---|---|---|---|", ...rows.map((r) => `| ${r.set} | ${r.runs} | ${r.records} | ${r.metrics} | ${r.note} |`)];
  for (const l of lines) deps.out(l);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## rp reproduce (no API key)\n\n${lines.join("\n")}\n`);
  const bad = rows.filter((r) => r.records === "differs" || r.metrics === "differs");
  if (bad.length > 0) {
    deps.err(`not reproduced: ${bad.map((r) => r.set).join(", ")}`);
    return EXIT.CHECK_FAILED;
  }
  deps.out(`${rows.filter((r) => r.records === "same").length} run sets reproduced byte for byte`);
  return EXIT.OK;
};
