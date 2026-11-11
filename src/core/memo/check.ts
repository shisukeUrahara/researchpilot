import { cellId, isPlanOf, toValue, type Memo, type MemoClaim } from "../domain/schemas";
import type { Ledger } from "../evidence/ledger";

/** Added by code to every memo; the model is not trusted to remember it. */
export const DISCLAIMER =
  "For this workload, per the dated official pages listed. Not a recommendation. Independent project, not affiliated with Cloudflare, Vercel or AWS.";

export interface Downgrade {
  cell: string;
  text: string;
  reason: "not_in_ledger" | "value_differs" | "superseded_value" | "bad_value" | "bad_cell";
}

export interface CheckedMemo {
  /** The memo as the writer returned it, kept for the raw claim-support metric. */
  raw: Memo;
  /** The memo after the check: unsupported claims moved to unknowns, disclaimer added. */
  memo: Memo & { disclaimer: string };
  downgraded: Downgrade[];
  /** Providers whose writer verdict differed from the fit rules and was replaced. */
  verdictsReplaced: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The code check on the writer's memo. A material claim (a number or "no limit") stays only if the
 * ledger uses exactly that value for that cell; anything else becomes an unknown with a reason. A claim
 * that repeats a value the ledger marked superseded is caught here too.
 */
export function checkMemo(raw: Memo, ledger: Ledger, computed: { provider: string; verdict: Memo["verdicts"][number]["verdict"]; plan: string | null }[] | null = null): CheckedMemo {
  const superseded = new Map<string, unknown[]>();
  for (const c of ledger.conflicts) {
    const cell = cellId(c.criterion, c.provider, c.plan);
    superseded.set(cell, c.fact_ids.filter((id) => id !== c.used));
  }
  const kept: MemoClaim[] = [];
  const downgraded: Downgrade[] = [];
  for (const claim of raw.claims) {
    // Found in dev round 2: the writer gave a Vercel claim the plan "paid" (a Cloudflare plan).
    if (!isPlanOf(claim.provider, claim.plan)) {
      downgraded.push({ cell: `${claim.criterion}:${claim.provider}:${claim.plan}`, text: claim.text, reason: "bad_cell" });
      continue;
    }
    const cell = cellId(claim.criterion, claim.provider, claim.plan);
    const v = toValue(claim);
    if (!v) {
      downgraded.push({ cell, text: claim.text, reason: "bad_value" });
      continue;
    }
    if (v.kind === "unknown") {
      kept.push(claim);
      continue;
    }
    const cur = ledger.current.get(cell);
    if (!cur) downgraded.push({ cell, text: claim.text, reason: "not_in_ledger" });
    else if (same(cur.value, v)) kept.push({ ...claim, passage_id: cur.fact.passage_id });
    else {
      const old = (superseded.get(cell) ?? []).length > 0 && !same(cur.value, v);
      downgraded.push({ cell, text: claim.text, reason: old ? "superseded_value" : "value_differs" });
    }
  }
  const unknowns = [...raw.unknowns, ...downgraded.map((d) => ({ cell: d.cell, reason: `claim removed by the memo check: ${d.reason}` }))];
  // Verdicts come from the fit rules over verified facts, not from the writer.
  let verdicts = raw.verdicts;
  const verdictsReplaced: string[] = [];
  if (computed) {
    verdicts = computed.map((c) => {
      const w = raw.verdicts.find((v) => v.provider === c.provider);
      if (!w || w.verdict !== c.verdict) verdictsReplaced.push(c.provider);
      return { provider: c.provider as Memo["verdicts"][number]["provider"], verdict: c.verdict, plan: c.plan as Memo["verdicts"][number]["plan"], reasons: w?.reasons ?? "" };
    });
  }
  return { raw, memo: { ...raw, verdicts, claims: kept, unknowns, disclaimer: DISCLAIMER }, downgraded, verdictsReplaced };
}
