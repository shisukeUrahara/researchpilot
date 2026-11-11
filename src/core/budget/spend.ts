import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The owner's total OpenAI budget for this project. */
export const TOTAL_CAP_USD = 15;

export const SpendLedger = z.object({
  cap_usd: z.number(),
  spent_usd: z.number(),
  entries: z.array(z.object({ what: z.string(), usd: z.number(), at: z.string() })),
});
export type SpendLedger = z.infer<typeof SpendLedger>;

const file = (stateDir: string) => path.join(stateDir, "spend.json");

/** Running total of live spend across commands, kept in the state dir (var/spend.json). */
export function loadSpend(stateDir: string): SpendLedger {
  const f = file(stateDir);
  return existsSync(f) ? SpendLedger.parse(JSON.parse(readFileSync(f, "utf8"))) : { cap_usd: TOTAL_CAP_USD, spent_usd: 0, entries: [] };
}

export function addSpend(stateDir: string, what: string, usd: number, at: Date): SpendLedger {
  const l = loadSpend(stateDir);
  const next = { ...l, spent_usd: Number((l.spent_usd + usd).toFixed(6)), entries: [...l.entries, { what, usd: Number(usd.toFixed(6)), at: at.toISOString() }] };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(file(stateDir), JSON.stringify(next, null, 2) + "\n");
  return next;
}

/**
 * May one more run start? Only if every run that could be in flight can still spend its full per-run cap
 * without the total passing the owner's cap. Runs refused here are recorded as not run, never hidden.
 */
export function mayStart(spentUsd: number, perRunCapUsd: number, inFlight: number, capUsd = TOTAL_CAP_USD): boolean {
  return spentUsd + (inFlight + 1) * perRunCapUsd <= capUsd + 1e-9;
}
