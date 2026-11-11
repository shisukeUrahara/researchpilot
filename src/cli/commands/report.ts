import { parseArgs } from "node:util";
import { gateSets, reportSet } from "@/core/grade/report";
import type { Rate } from "@/core/metrics/eval";
import type { Command } from "../deps";
import { EXIT } from "../exit";

const pct = (r: Rate) => (r.rate === null ? "n/a" : `${(r.rate * 100).toFixed(1)}% (${r.k}/${r.n}, ${(r.low * 100).toFixed(0)}–${(r.high * 100).toFixed(0)}%)`);

/** rp report --run <set>: grades a run set, writes grades.jsonl and metrics.json, prints the headline numbers. */
export const report: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { run: { type: "string" } } });
  if (!values.run) {
    deps.err("usage: rp report --run <run set>");
    return EXIT.USAGE;
  }
  const m = reportSet(deps.dataDir, values.run);
  const a = m.arm;
  deps.out(`${m.run_set}: ${a.runs} runs`);
  deps.out(`  task success      ${pct(a.task_success)}`);
  deps.out(`  coverage          ${pct(a.coverage)}`);
  deps.out(`  unknown correct   ${pct(a.unknown_correct)}`);
  deps.out(`  raw claim support ${pct(a.raw_claim_support)} · removed by memo check ${a.downgraded_by_check}`);
  deps.out(`  tool calls        median ${a.median_tool_calls} · redundant ${pct(a.redundant_call_rate)}`);
  deps.out(`  stop reasons      ${Object.entries(a.stop_reasons).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  deps.out(`  dead ends → NO_PROGRESS ${pct(a.no_progress_stops)} · stale as current ${a.stale_as_current} · invented price ${a.invented_price}`);
  deps.out(`  budget compliance ${pct(a.budget_compliance)} · cost $${a.usd_total.toFixed(4)} ($${a.usd_mean.toFixed(4)} per run)`);
  if (m.injection) {
    const i = m.injection;
    deps.out(`  injection: note seen in ${i.notes_seen}/${i.runs} · email attempts ${pct(i.email_attempt_rate)} · executions ${i.email_executions} · planted value in memo ${pct(i.injected_value_rate)}`);
  }
  for (const f of m.failures) deps.out(`  FAIL ${f.scenario_id} ${f.run_id}: ${f.reasons.join("; ")}`);
  return EXIT.OK;
};

/** rp gate --eval <set> [--injection <set>] [--strict set,set]: writes gate/gate.json; exit 1 on block. */
export const gate: Command = async (argv, deps) => {
  const { values } = parseArgs({ args: argv, options: { eval: { type: "string" }, injection: { type: "string" }, strict: { type: "string" } } });
  if (!values.eval) {
    deps.err("usage: rp gate --eval <bounded eval set> [--injection <bounded injection set>] [--strict set,set]");
    return EXIT.USAGE;
  }
  const strict = [values.eval, ...(values.injection ? [values.injection] : []), ...(values.strict ? values.strict.split(",") : [])];
  const r = gateSets(deps.dataDir, values.eval, values.injection ?? null, [...new Set(strict)]);
  for (const c of r.checks) deps.out(`${c.pass ? "PASS" : "FAIL"} ${c.tier.padEnd(8)} ${c.id.padEnd(24)} ${c.value} (${c.limit})${c.runs.length && !c.pass ? ` runs: ${c.runs.slice(0, 6).join(", ")}` : ""}`);
  deps.out(`gate: ${r.decision.toUpperCase()} (${r.rules})`);
  return r.decision === "pass" ? EXIT.OK : EXIT.CHECK_FAILED;
};
