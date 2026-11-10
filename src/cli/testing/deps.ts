import type { Deps } from "../deps";

/** Deps for CLI tests: captured output, fixed clock, replay mode unless a key is given. */
export function testDeps(over: Partial<Deps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: Deps = {
    dataDir: "/tmp/rp-test-data",
    stateDir: "/tmp/rp-test-state",
    replay: true,
    approverToken: null,
    now: () => new Date("2026-11-11T09:00:00Z"),
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    ...over,
  };
  return { deps, out, err };
}
