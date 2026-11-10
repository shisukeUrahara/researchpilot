import { ForbiddenError, tokenOk } from "../auth/token";
import { sha256Hex } from "../prompts/canonical";
import { argsHash } from "../run/events";
import type { ApprovalRow, Store } from "../store/db";

export const APPROVAL_TTL_MS = 15 * 60 * 1000;

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/** Asks a person to approve one exact action. The id is stable, so asking twice (a node re-run) asks once. */
export function requestApproval(store: Store, runId: string, tool: string, args: unknown, now: Date): ApprovalRow {
  const actionHash = argsHash(tool, args);
  const row: ApprovalRow = {
    approval_id: "apv_" + sha256Hex(`${runId}:${actionHash}`).slice(0, 12),
    run_id: runId,
    action_hash: actionHash,
    tool,
    args_json: JSON.stringify(args),
    status: "pending",
    requested_at: now.toISOString(),
    expires_at: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    decided_at: null,
  };
  store.insertApproval(row);
  return store.getApproval(row.approval_id)!;
}

/** The approver says yes or no. Needs the token; an expired or already decided request is refused. */
export function decide(store: Store, approvalId: string, decision: "approved" | "denied", token: string | null, expectedToken: string | null, now: Date): ApprovalRow {
  if (!tokenOk(token, expectedToken)) throw new ForbiddenError();
  const a = store.getApproval(approvalId);
  if (!a) throw new ApprovalError(`no approval request ${approvalId}`);
  if (a.status !== "pending") throw new ApprovalError(`${approvalId} is already ${a.status}`);
  if (now.toISOString() > a.expires_at) {
    store.decideApproval(approvalId, "denied", now.toISOString());
    throw new ApprovalError(`${approvalId} expired at ${a.expires_at}`);
  }
  store.decideApproval(approvalId, decision, now.toISOString());
  return store.getApproval(approvalId)!;
}

/**
 * Action fingerprints approved for this run and not expired. An approval covers exactly one tool with
 * exactly these arguments: other arguments get a new fingerprint and need their own approval.
 */
export function approvedActions(store: Store, runId: string, now: Date): Set<string> {
  return new Set(
    store
      .approvals(runId)
      .filter((a) => a.status === "approved" && now.toISOString() <= a.expires_at)
      .map((a) => a.action_hash),
  );
}
