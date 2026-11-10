import { interrupt } from "@langchain/langgraph";
import { approvedActions, requestApproval } from "../../approvals/approvals";
import { argsHash } from "../../run/events";
import type { Store } from "../../store/db";
import type { Registry } from "../../tools/registry";
import { parseToolArgs } from "../../tools/registry";
import type { LastCall } from "../state";

/** `deny`: approval tools are refused (evals, so runs never wait). `interrupt`: the run pauses for a person. */
export type ApprovalMode = "deny" | "interrupt";

export interface ApprovalPause {
  approval_id: string;
  tool: string;
  args: unknown;
  expires_at: string;
}

/**
 * Runs between act and execute. LangGraph re-runs this node from its first line on resume (see
 * docs/langgraph_notes.md #2), so it does nothing before interrupt() except an insert-or-ignore of the
 * approval request: a second run of that line changes nothing. The executor makes the real check.
 */
export function approveStep(last: LastCall | null, runId: string, registry: Registry, store: Store, mode: ApprovalMode, now: Date): { paused: boolean } {
  if (!last || last.proposal.done) return { paused: false };
  const spec = registry.get(last.proposal.tool);
  if (!spec?.needsApproval) return { paused: false };
  const parsed = parseToolArgs(spec, last.proposal.args_json);
  if (!parsed.ok) return { paused: false }; // the executor reports tool_args_invalid
  if (approvedActions(store, runId, now).has(argsHash(spec.name, parsed.args))) return { paused: false };
  if (mode === "deny") return { paused: false }; // the executor reports needs_approval
  const a = requestApproval(store, runId, spec.name, parsed.args, now);
  const pause: ApprovalPause = { approval_id: a.approval_id, tool: a.tool, args: parsed.args, expires_at: a.expires_at };
  interrupt(pause);
  return { paused: true };
}
