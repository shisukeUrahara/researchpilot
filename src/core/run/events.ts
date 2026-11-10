import { canonicalJson, sha256Hex } from "../prompts/canonical";
import type { Store } from "../store/db";

/** Deterministic id for one call: same run, step, node and call number → same id, in live, replay and CI. */
export function requestId(runId: string, stepNo: number, node: string, seq: number): string {
  return "req_" + sha256Hex(canonicalJson([runId, stepNo, node, seq])).slice(0, 16);
}

/** Fingerprint of a tool call: tool name + canonical arguments. */
export function argsHash(tool: string, args: unknown): string {
  return sha256Hex(canonicalJson({ tool, args })).slice(0, 24);
}

export interface EventInput {
  runId: string;
  stepNo: number;
  node: string;
  seq: number;
  kind: string;
  virtualMs: number;
  detail: Record<string, unknown>;
}

/** Writes one timeline event. A node that re-runs after a crash writes the same key, which is ignored. */
export function recordEvent(store: Store, e: EventInput): string {
  const rid = requestId(e.runId, e.stepNo, e.node, e.seq);
  store.insertEvent({
    run_id: e.runId,
    step_no: e.stepNo,
    node: e.node,
    seq: e.seq,
    kind: e.kind,
    request_id: rid,
    virtual_ms: e.virtualMs,
    detail_json: canonicalJson(e.detail),
  });
  return rid;
}
