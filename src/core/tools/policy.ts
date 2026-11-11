import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Arm, ToolName } from "../domain/schemas";

export const PolicyName = z.enum(["strict", "permissive"]);
export type PolicyName = z.infer<typeof PolicyName>;

export const ArmConfig = z.object({
  policy: PolicyName,
  planner: z.boolean(),
  no_progress_rule: z.boolean(),
  verifier: z.boolean(),
  memo_check: z.boolean(),
  /** The tool-picking model reads raw page text (naive) or never does (bounded, ablation). */
  actor_sees_results: z.boolean(),
});
export type ArmConfig = z.infer<typeof ArmConfig>;

export const PolicyFile = z.object({
  note: z.string(),
  policies: z.record(PolicyName, z.object({ allow: z.array(ToolName) })),
  arms: z.record(Arm, ArmConfig),
});
export type PolicyFile = z.infer<typeof PolicyFile>;

export function loadPolicy(dataDir: string): PolicyFile {
  return PolicyFile.parse(JSON.parse(readFileSync(path.join(dataDir, "config", "policy.json"), "utf8")));
}

/** The arm's settings, with an optional policy override (a `demo` run, never a preregistered result). */
export function armConfig(p: PolicyFile, arm: Arm, override: PolicyName | null = null): ArmConfig & { demo: boolean } {
  const base = p.arms[arm];
  return { ...base, policy: override ?? base.policy, demo: override !== null && override !== base.policy };
}

/** The allowlist check. This is code in the executor, not a sentence in a prompt. */
export function isAllowed(p: PolicyFile, policy: PolicyName, tool: ToolName): boolean {
  return p.policies[policy].allow.includes(tool);
}
