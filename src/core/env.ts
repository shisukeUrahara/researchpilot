import path from "node:path";
import { z } from "zod";

const Raw = z.object({
  OPENAI_API_KEY: z.string().trim().optional(),
  RP_DATA_DIR: z.string().trim().optional(),
  RP_STATE_DIR: z.string().trim().optional(),
  RP_APPROVER_TOKEN: z.string().trim().optional(),
});

export interface Env {
  /** `live` may call model APIs. `replay` answers only from the committed cache. */
  mode: "live" | "replay";
  apiKey: string | null;
  /** Committed inputs and results: fixtures/, data/, config/, runs/, gate/, cache/llm/. */
  dataDir: string;
  /** Runtime state, never committed: SQLite DB, checkpoints, spend ledger. */
  stateDir: string;
  /** Shared secret the approver uses to approve an action or resolve a conflict. Null = approvals off. */
  approverToken: string | null;
}

/** Reads the variables ResearchPilot knows. A bad value throws and names it. */
export function loadEnv(source: Record<string, string | undefined>, cwd = process.cwd()): Env {
  const parsed = Raw.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`invalid environment variable: ${names}`);
  }
  const d = parsed.data;
  const apiKey = d.OPENAI_API_KEY || null;
  const dataDir = d.RP_DATA_DIR || cwd;
  return {
    mode: apiKey ? "live" : "replay",
    apiKey,
    dataDir,
    stateDir: d.RP_STATE_DIR || path.join(dataDir, "var"),
    approverToken: d.RP_APPROVER_TOKEN || null,
  };
}

/** Throws a clear message when a command needs the live API but no key is set. */
export function requireLive(env: Pick<Env, "apiKey">): string {
  if (env.apiKey === null) {
    throw new Error("OPENAI_API_KEY is not set. Put it in .env for live runs, or pass --replay to use the committed cache.");
  }
  return env.apiKey;
}
