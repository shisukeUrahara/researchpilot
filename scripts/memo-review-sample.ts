/**
 * Picks 20 memos for the model review, spread over arms and scenario kinds, and writes what a reviewer
 * may see: the memo's material claims and the full text of each cited passage. The reviewer does NOT see
 * the arm, the grade or the gold value. Output: data/labels/memo_review_input.jsonl
 *   pnpm tsx scripts/memo-review-sample.ts
 */
import { writeFileSync } from "node:fs";
import { loadRecords } from "@/core/grade/report";
import { loadScenarios } from "@/core/scenarios/schema";
import { asPassage, loadSynthetic } from "@/core/scenarios/synthetic";
import { loadManifest } from "@/core/sources/manifest";
import { loadAllPassages } from "@/core/sources/passages";

const dir = process.cwd();
const m = loadManifest(dir);
const passages = new Map(loadAllPassages(dir, m.sources.map((s) => s.id)).map((p) => [p.id, p]));
for (const n of loadSynthetic(dir).values()) passages.set(asPassage(n).id, asPassage(n));
const kinds = new Map(loadScenarios(dir).map((s) => [s.id, s.kind]));
const PLAN: [string, number][] = [
  ["eval-bounded", 8],
  ["eval-ablation", 6],
  ["eval-naive", 6],
];

const out: string[] = [];
let n = 0;
for (const [set, want] of PLAN) {
  const recs = loadRecords(dir, set).filter((r) => r.memo && (r.raw_memo ?? r.memo)!.claims.some((c) => c.value_kind !== "unknown"));
  // Every k-th record, so the sample spreads over the scenario kinds in file order.
  const step = Math.max(1, Math.floor(recs.length / want));
  for (const r of recs.filter((_, i) => i % step === 0).slice(0, want)) {
    const memo = r.raw_memo ?? r.memo!;
    const claims = memo.claims
      .filter((c) => c.value_kind !== "unknown")
      .map((c) => {
        const f = r.facts.find((x) => x.criterion === c.criterion && x.provider === c.provider && x.plan === c.plan && x.status !== "rejected");
        const pid = c.passage_id ?? f?.passage_id ?? null;
        return { cell: `${c.criterion}:${c.provider}:${c.plan}`, value: c.value_kind === "number" ? `${c.n} ${c.unit}` : "no limit", text: c.text, passage_id: pid, passage_text: pid ? (passages.get(pid)?.text ?? "(passage not found)") : "(no passage cited)" };
      });
    out.push(JSON.stringify({ item: `memo-${String(++n).padStart(2, "0")}`, run_id: r.run_id, scenario_kind: kinds.get(r.scenario_id), claims }));
  }
}
writeFileSync("data/labels/memo_review_input.jsonl", out.join("\n") + "\n");
console.log(`wrote ${out.length} memos`);
