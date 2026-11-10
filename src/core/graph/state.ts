import type { RunUsage } from "../budget/runBudget";
import type { Arm, Brief, Conflict, FactRecord, Memo, PlanStep, Proposal, RunStatus, StopReason } from "../domain/schemas";

/** The last tool call, as the extractor and the progress monitor see it. */
export interface LastCall {
  stepNo: number;
  proposal: Proposal;
  outcome: string;
  executed: boolean;
  result: unknown;
}

/**
 * The agent's whole state. Plain data: it is what the LangGraph checkpoint saves after every step,
 * so a crashed run resumes from here. Lists are kept in a fixed order so prompts render the same way.
 */
export interface AgentState {
  runId: string;
  arm: Arm;
  brief: Brief;
  required: string[];
  plan: PlanStep[];
  stepNo: number;
  usage: RunUsage;
  facts: FactRecord[];
  conflicts: Conflict[];
  /** Passage ids seen in any tool result, sorted. */
  seenPassages: string[];
  /** Distinct searches or reads aimed at each cell (evidence for an "unknown"). */
  cellQueries: Record<string, string[]>;
  /** Cells whose source a tool reported as unavailable. */
  unavailableCells: string[];
  /** Steps in a row with no progress. */
  noProgress: number;
  last: LastCall | null;
  memo: Memo | null;
  status: RunStatus;
  stopReason: StopReason | null;
}
