/** Everything a command touches from the outside world, so tests can fake it. */
export interface Deps {
  /** Committed inputs and results. */
  dataDir: string;
  /** Runtime state (DB, checkpoints, spend ledger). */
  stateDir: string;
  /** True when there is no API key: every model call must come from the cache. */
  replay: boolean;
  approverToken: string | null;
  now: () => Date;
  out: (line: string) => void;
  err: (line: string) => void;
}

export type Command = (argv: string[], deps: Deps) => Promise<number>;
