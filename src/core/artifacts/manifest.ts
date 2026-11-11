import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { sha256Hex } from "../prompts/canonical";

/** Files whose content decides what an eval measures. Their shas are frozen before the eval runs. */
export const PREREGISTERED = [
  "data/scenarios/v1.jsonl",
  "data/gold/facts.v1.jsonl",
  "data/criteria.v1.json",
  "config/budgets.json",
  "config/policy.json",
  "config/models.json",
  "gate/rules.v1.json",
  "fixtures/sources/manifest.json",
] as const;

export const RunManifest = z.object({
  run_set: z.string(),
  kind: z.literal("eval"),
  split: z.enum(["dev", "eval", "injection"]),
  arm: z.string(),
  policy: z.string(),
  demo: z.boolean(),
  sample_count: z.number().int(),
  repetitions: z.number().int(),
  concurrency: z.number().int(),
  git_sha: z.string(),
  git_dirty: z.boolean(),
  prompt_set_sha: z.string(),
  prompts: z.record(z.string(), z.string()),
  model_spec: z.string(),
  index_version: z.string(),
  file_shas: z.record(z.string(), z.string()),
  region: z.string(),
  hardware: z.string(),
  created_at_utc: z.string(),
  live_usd: z.number(),
  not_run: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type RunManifest = z.infer<typeof RunManifest>;

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

const git = (dataDir: string, args: string[]) => execFileSync("git", args, { cwd: dataDir, encoding: "utf8" });

export function gitState(dataDir: string): { sha: string; dirty: string[] } {
  const sha = git(dataDir, ["rev-parse", "HEAD"]).trim();
  // Porcelain lines start with a 2-letter status and a space; trimming the output would eat the first one.
  const dirty = git(dataDir, ["status", "--porcelain", "--untracked-files=no"])
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3));
  return { sha, dirty };
}

export function fileShas(dataDir: string, files: readonly string[] = PREREGISTERED): Record<string, string> {
  return Object.fromEntries(files.map((f) => [f, sha256Hex(readFileSync(path.join(dataDir, f), "utf8"))]));
}

export const preregistrationPath = (dataDir: string) => path.join(dataDir, "data", "preregistration.json");

/**
 * Before an eval or injection run: the tree must be clean and every preregistered file (plus the frozen
 * prompts) must still have the sha written in data/preregistration.json. Dev runs are free.
 * Demo runs (a policy override) skip the guard: they are never published as results.
 */
export function guardRun(dataDir: string, split: string, demo: boolean, promptFiles: string[]): void {
  if (split === "dev" || demo) return;
  const g = gitState(dataDir);
  if (g.dirty.length > 0) throw new GuardError(`refusing a ${split} run: uncommitted changes in ${g.dirty.join(", ")}`);
  const file = preregistrationPath(dataDir);
  if (!existsSync(file)) throw new GuardError(`refusing a ${split} run: no data/preregistration.json yet (freeze the prompts first)`);
  const want = JSON.parse(readFileSync(file, "utf8")).files as Record<string, string>;
  const have = fileShas(dataDir, [...PREREGISTERED, ...promptFiles]);
  const changed = Object.keys(have).filter((f) => want[f] !== have[f]);
  if (changed.length > 0) throw new GuardError(`refusing a ${split} run: changed since preregistration: ${changed.join(", ")}`);
}

export function writeRunFolder(dir: string, manifest: RunManifest, records: string[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(RunManifest.parse(manifest), null, 2) + "\n");
  writeFileSync(path.join(dir, "records.jsonl"), records.map((r) => r + "\n").join(""));
}

export function machine(): { region: string; hardware: string } {
  return { region: "local", hardware: `${os.cpus()[0]?.model ?? "cpu"} × ${os.cpus().length}, ${os.platform()} ${os.arch()}, node ${process.version}` };
}
