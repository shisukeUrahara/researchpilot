import type { RunStatus, StopReason } from "../domain/schemas";

/** Allowed status changes. Anything else is a bug and throws. */
const NEXT: Record<RunStatus, readonly RunStatus[]> = {
  created: ["running", "cancelled", "failed"],
  running: ["awaiting_approval", "completed", "stopped", "cancelled", "failed"],
  awaiting_approval: ["running", "cancelled", "failed"],
  completed: [],
  stopped: [],
  cancelled: [],
  failed: [],
};

export const FINAL: ReadonlySet<RunStatus> = new Set(["completed", "stopped", "cancelled", "failed"]);

export function transition(from: RunStatus, to: RunStatus): RunStatus {
  if (!NEXT[from].includes(to)) throw new Error(`illegal run status change: ${from} → ${to}`);
  return to;
}

/** The final status a stop reason leads to. */
export function statusFor(reason: StopReason): RunStatus {
  if (reason === "VERIFIED") return "completed";
  if (reason === "CANCELLED") return "cancelled";
  if (reason === "ERROR") return "failed";
  return "stopped";
}

/** A finished run has exactly one stop reason; an unfinished one has none. */
export function assertOutcome(status: RunStatus, stopReason: StopReason | null): void {
  const final = FINAL.has(status);
  if (final && stopReason === null) throw new Error(`run is ${status} but has no stop reason`);
  if (!final && stopReason !== null) throw new Error(`run is ${status} but already has stop reason ${stopReason}`);
  if (final && statusFor(stopReason!) !== status) throw new Error(`stop reason ${stopReason} does not lead to status ${status}`);
}
