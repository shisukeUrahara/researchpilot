import { parseArgs } from "node:util";
import { Arm } from "@/core/domain/schemas";
import { startRun, type RunOutcome } from "@/core/graph/runner";
import { loadScenarios } from "@/core/scenarios/schema";
import { PolicyName } from "@/core/tools/policy";
import type { Command } from "../deps";
import { EXIT } from "../exit";

/** A short human summary of one run. */
export function summarize(o: RunOutcome): string[] {
  const s = o.state;
  const u = s.usage;
  const lines = [
    `run ${o.runId} · arm ${s.arm}${o.demo ? " (demo policy)" : ""} · brief ${o.brief.id}`,
    s.paused ? `PAUSED for approval: ${JSON.stringify(s.paused)}` : `stop: ${s.stopReason} (${s.status})`,
    `steps ${u.steps} · tool calls ${u.tool_calls} · virtual ${u.virtual_ms} ms · cost $${u.usd.toFixed(4)}`,
    `facts: ${s.facts.filter((f) => f.status === "verified").length} verified, ${s.facts.filter((f) => f.status === "rejected").length} rejected, ${s.facts.filter((f) => f.status === "unchecked").length} unchecked · conflicts ${s.conflicts.length}`,
  ];
  if (s.memo) {
    for (const v of s.memo.verdicts) lines.push(`  ${v.provider}: ${v.verdict}${v.plan ? ` (${v.plan})` : ""} — ${v.reasons}`);
    lines.push(`  memo claims kept ${s.memo.claims.length}, removed by check ${s.downgraded.length}, unknowns ${s.memo.unknowns.length}`);
  } else lines.push("  no memo");
  return lines;
}

/** rp run --brief <id> | --scenario <id> [--arm bounded] [--policy strict|permissive] [--max-usd 0.5] [--replay] [--approvals interrupt|deny] */
export const run: Command = async (argv, deps) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      brief: { type: "string" },
      scenario: { type: "string" },
      arm: { type: "string", default: "bounded" },
      policy: { type: "string" },
      "max-usd": { type: "string", default: "0.5" },
      replay: { type: "boolean", default: false },
      approvals: { type: "string", default: "interrupt" },
      "run-id": { type: "string" },
    },
  });
  if (!values.brief && !values.scenario) {
    deps.err("usage: rp run --brief <id> | --scenario <id> [--arm bounded|ablation|naive] [--policy strict|permissive] [--max-usd 0.5] [--replay]");
    return EXIT.USAGE;
  }
  const scenario = values.scenario ? loadScenarios(deps.dataDir).find((s) => s.id === values.scenario) : null;
  if (values.scenario && !scenario) {
    deps.err(`unknown scenario ${values.scenario}`);
    return EXIT.USAGE;
  }
  const out = await startRun(deps.runner(Number(values["max-usd"]), values.replay), {
    arm: Arm.parse(values.arm),
    briefId: values.brief,
    scenario,
    policy: values.policy ? PolicyName.parse(values.policy) : null,
    approvals: values.approvals === "deny" ? "deny" : "interrupt",
    runId: values["run-id"],
  });
  for (const l of summarize(out)) deps.out(l);
  return EXIT.OK;
};
