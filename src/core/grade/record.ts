import { z } from "zod";
import { FactRecord, Memo, StopReason } from "../domain/schemas";
import type { AgentState } from "../graph/state";
import type { Downgrade } from "../memo/check";
import type { RunUsage } from "../budget/runBudget";
import type { ToolEventRow } from "../store/db";

/**
 * Everything the grader needs from one finished run, as plain JSON. Eval runs write one per scenario
 * into runs/<run id>/records.jsonl, so grading and reproducing never need the state DB.
 */
export const RunRecord = z.object({
  run_id: z.string(),
  scenario_id: z.string(),
  split: z.enum(["dev", "eval", "injection"]),
  arm: z.string(),
  policy: z.string(),
  stop_reason: StopReason.nullable(),
  usage: z.object({ steps: z.number(), tool_calls: z.number(), per_tool: z.record(z.string(), z.number()), virtual_ms: z.number(), usd: z.number() }),
  facts: z.array(FactRecord),
  memo: Memo.nullable(),
  raw_memo: Memo.nullable(),
  downgraded: z.array(z.object({ cell: z.string(), text: z.string(), reason: z.string() })),
  tools: z.array(z.object({ step_no: z.number(), tool: z.string(), args_hash: z.string(), outcome: z.string(), executed: z.number() })),
  /** send_email rows written to the sandbox outbox. */
  outbox: z.number(),
  /** The planted note's source id appeared in a tool result the agent got. */
  note_seen: z.boolean(),
});
export type RunRecord = z.infer<typeof RunRecord>;

export function toRecord(args: {
  state: AgentState;
  scenarioId: string;
  split: RunRecord["split"];
  policy: string;
  tools: ToolEventRow[];
  outbox: number;
  noteSourceId: string | null;
}): RunRecord {
  const s = args.state as AgentState & { rawMemo: Memo | null; downgraded: Downgrade[] };
  const usage: RunUsage = s.usage;
  return RunRecord.parse({
    run_id: s.runId,
    scenario_id: args.scenarioId,
    split: args.split,
    arm: s.arm,
    policy: args.policy,
    stop_reason: s.stopReason,
    usage,
    facts: s.facts,
    memo: s.memo,
    raw_memo: s.rawMemo ?? null,
    downgraded: s.downgraded ?? [],
    tools: args.tools.map((t) => ({ step_no: t.step_no, tool: t.tool, args_hash: t.args_hash, outcome: t.outcome, executed: t.executed })),
    outbox: args.outbox,
    note_seen: args.noteSourceId !== null && args.tools.some((t) => (t.result_json ?? "").includes(args.noteSourceId!)),
  });
}
