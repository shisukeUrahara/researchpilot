/**
 * Compares the model reviewer's verdicts (data/labels/memo_review.jsonl) with the code grader's view of the
 * same claims (supported = equals the current gold value; stale = equals a superseded gold value), and
 * writes docs/memo_review.md. Disagreements are listed, never resolved by editing the review.
 *   pnpm tsx scripts/memo-review-compare.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadGold } from "@/core/gold/gold";

type Verdict = "supported" | "unsupported" | "stale";
const dir = process.cwd();
const gold = loadGold(dir);
const cur = new Map(gold.filter((g) => g.current).map((g) => [g.key, g]));
const stale = new Map<string, string[]>();
const fmt = (v: { kind: string; n?: number; unit?: string }) => (v.kind === "number" ? `${v.n} ${v.unit}` : v.kind === "unbounded" ? "no limit" : "unknown");
const base = (s: string) => {
  const m = /^([\d.]+) (s|ms|mb|count)$/.exec(s);
  if (!m) return s;
  const n = Number(m[1]);
  return m[2] === "ms" ? `t:${n / 1000}` : m[2] === "s" ? `t:${n}` : `${m[2]}:${n}`;
};
for (const g of gold.filter((x) => !x.current)) stale.set(g.key, [...(stale.get(g.key) ?? []), base(fmt(g.value))]);

const input = readFileSync("data/labels/memo_review_input.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const review = readFileSync("data/labels/memo_review.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as { item: string; cell: string; value: string; verdict: Verdict; note: string });
const byItem = new Map(review.map((r) => [r.item, r]));

let agree = 0;
let total = 0;
const confusion: Record<string, number> = {};
const diffs: string[] = [];
for (const memo of input) {
  memo.claims.forEach((c: { cell: string; value: string; passage_id: string | null }, i: number) => {
    const r = byItem.get(`${memo.item}#${i}`);
    if (!r) return;
    const g = cur.get(c.cell);
    const v = base(c.value);
    const grader: Verdict = g && g.value.kind !== "unknown" && base(fmt(g.value)) === v ? "supported" : (stale.get(c.cell) ?? []).includes(v) ? "stale" : "unsupported";
    total++;
    if (grader === r.verdict) agree++;
    else diffs.push(`| ${memo.item}#${i} | ${c.cell} | ${c.value} | ${grader} | ${r.verdict} | ${r.note.replace(/\|/g, "/")} |`);
    confusion[`${grader} → ${r.verdict}`] = (confusion[`${grader} → ${r.verdict}`] ?? 0) + 1;
  });
}

const md = [
  "# Memo review (model reviewer vs code grader)",
  "",
  "A model reviewer (Claude subagents, not a human) checked every material claim of 20 memos against the",
  "passage each claim cites, without seeing the arm, the grade or the gold value. Sample: 8 bounded,",
  "6 ablation, 6 naive memos, spread over scenario kinds (`scripts/memo-review-sample.ts`). Rubric:",
  "`docs/review_protocol.md`. Rows: `data/labels/memo_review.jsonl`.",
  "",
  `**Agreement with the code grader: ${agree}/${total} claims (${((agree / total) * 100).toFixed(1)}%).**`,
  "",
  "| Code grader → reviewer | Claims |",
  "|---|---|",
  ...Object.entries(confusion)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `| ${k} | ${n} |`),
  "",
  "The grader compares a claim with the gold table; the reviewer compares it with the passage the memo",
  "cites. They can disagree when the gold row is a judgment call (for example C06, default memory, which",
  "gold marks unknown for Cloudflare) or when a claim is right but cites the wrong passage.",
  "",
  "## Disagreements",
  "",
  "| Claim | Cell | Value | Grader | Reviewer | Reviewer note |",
  "|---|---|---|---|---|---|",
  ...diffs,
  "",
];
writeFileSync("docs/memo_review.md", md.join("\n"));
console.log(`agreement ${agree}/${total}; ${diffs.length} disagreements`);
