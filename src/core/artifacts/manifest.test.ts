import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { fileShas, guardRun, PREREGISTERED, preregistrationPath } from "./manifest";

/** A throwaway git repo holding copies of the preregistered files. */
function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-guard-"));
  for (const f of PREREGISTERED) cpSync(path.join(process.cwd(), f), path.join(dir, f));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  return dir;
}
const commitAll = (dir: string) => {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "c"], { cwd: dir });
};

test("dev runs are never guarded; eval needs a preregistration file", () => {
  const dir = repo();
  expect(() => guardRun(dir, "dev", false, [])).not.toThrow();
  expect(() => guardRun(dir, "eval", false, [])).toThrow(/no data\/preregistration.json/);
});

test("with matching shas the eval may run; a changed preregistered file is refused", () => {
  const dir = repo();
  writeFileSync(preregistrationPath(dir), JSON.stringify({ files: fileShas(dir) }));
  commitAll(dir);
  expect(() => guardRun(dir, "eval", false, [])).not.toThrow();
  writeFileSync(path.join(dir, "config/budgets.json"), "{}");
  expect(() => guardRun(dir, "eval", false, [])).toThrow(/uncommitted changes/);
  commitAll(dir);
  expect(() => guardRun(dir, "eval", false, [])).toThrow(/changed since preregistration: config\/budgets.json/);
});

test("a demo run (policy override) skips the guard", () => {
  expect(() => guardRun(repo(), "injection", true, [])).not.toThrow();
});
