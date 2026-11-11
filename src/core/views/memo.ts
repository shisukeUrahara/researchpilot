import { cellId, isPlanOf, toValue, type FactRecord, type Memo, type Value } from "../domain/schemas";
import { buildLedger } from "../evidence/ledger";
import type { AgentState } from "../graph/state";
import type { Manifest } from "../sources/manifest";
import type { Passage } from "../sources/passages";
import type { ToolEventRow } from "../store/db";

export const fmtValue = (v: Value) => (v.kind === "number" ? `${v.n.toLocaleString("en-US")} ${v.unit === "mb" ? "MB" : v.unit}` : v.kind === "unbounded" ? "no limit" : "unknown");

export interface ClaimView {
  cell: string;
  value: string;
  text: string;
  /** What the drawer shows: quote → passage → source + date → tool event. */
  evidence: {
    quote: string;
    passageId: string;
    passageText: string;
    source: string;
    url: string;
    pageDate: string;
    dateKind: string;
    kind: string;
    toolEvent: string | null;
  } | null;
}

export interface LedgerRow {
  id: string;
  cell: string;
  value: string;
  status: "verified" | "rejected" | "unchecked";
  reason: string | null;
  source: string;
  kind: string;
  date: string;
}

export interface ConflictView {
  cell: string;
  sides: { factId: string; value: string; source: string; kind: string; date: string; used: boolean }[];
  rule: string;
}

export interface MemoView {
  summary: string;
  verdicts: Memo["verdicts"];
  claims: ClaimView[];
  unknowns: Memo["unknowns"];
  assumptions: string[];
  disclaimer: string;
  ledger: LedgerRow[];
  conflicts: ConflictView[];
  downgraded: { cell: string; text: string; reason: string }[];
}

/**
 * The Memo page: the checked memo, and for every number the evidence behind it, one click away.
 * `passages` holds official passages and synthetic notes, so a planted note shows up as what it is.
 */
export function memoView(state: AgentState, memo: (Memo & { disclaimer?: string }) | null, manifest: Manifest, passages: ReadonlyMap<string, Passage>, tools: ToolEventRow[]): MemoView {
  const sources = new Map(manifest.sources.map((s) => [s.id, s]));
  const src = (passageId: string) => sources.get(passageId.split("@")[0].split("#")[0]);
  const ledger = buildLedger(state.facts, manifest, { archiveNeverCurrent: state.arm !== "naive" });
  const factFor = (cell: string): FactRecord | null => ledger.current.get(cell)?.fact ?? null;
  const toolFor = (f: FactRecord) => tools.find((t) => t.step_no === f.step_no && t.executed === 1) ?? tools.find((t) => t.step_no === f.step_no) ?? null;

  const claims: ClaimView[] = (memo?.claims ?? []).map((c) => {
    const cell = isPlanOf(c.provider, c.plan) ? cellId(c.criterion, c.provider, c.plan) : `${c.criterion}:${c.provider}:${c.plan}`;
    const v = toValue(c);
    const f = factFor(cell);
    const p = f ? passages.get(f.passage_id) : c.passage_id ? passages.get(c.passage_id) : undefined;
    const s = p ? src(p.id) : undefined;
    const t = f ? toolFor(f) : null;
    return {
      cell,
      value: v ? fmtValue(v) : "?",
      text: c.text,
      evidence: p
        ? {
            quote: f?.quote ?? "",
            passageId: p.id,
            passageText: p.text,
            source: s?.id ?? p.source_id,
            url: s?.url ?? "",
            pageDate: s?.page_date ?? "",
            dateKind: s?.date_kind ?? "",
            kind: s?.kind ?? "unverified",
            toolEvent: t ? `${t.request_id} · step ${t.step_no} · ${t.tool}` : null,
          }
        : null,
    };
  });

  const ledgerRows: LedgerRow[] = state.facts.map((f) => {
    const s = src(f.passage_id);
    return {
      id: f.id,
      cell: `${f.criterion}:${f.provider}:${f.plan}`,
      value: fmtValue(f.value),
      status: f.status,
      reason: f.reject_reason,
      source: s?.id ?? f.passage_id.split("#")[0],
      kind: s?.kind ?? "unverified",
      date: s?.page_date ?? "",
    };
  });

  const byId = new Map(state.facts.map((f) => [f.id, f]));
  const conflicts: ConflictView[] = ledger.conflicts.map((c) => ({
    cell: cellId(c.criterion, c.provider, c.plan),
    rule: c.rule,
    sides: c.fact_ids.map((id) => {
      const f = byId.get(id)!;
      const s = src(f.passage_id);
      return { factId: id, value: fmtValue(f.value), source: s?.id ?? "", kind: s?.kind ?? "", date: s?.page_date ?? "", used: id === c.used };
    }),
  }));

  return {
    summary: memo?.summary ?? "",
    verdicts: memo?.verdicts ?? [],
    claims,
    unknowns: memo?.unknowns ?? [],
    assumptions: memo?.assumptions ?? [],
    disclaimer: memo?.disclaimer ?? "",
    ledger: ledgerRows,
    conflicts,
    downgraded: (state as AgentState & { downgraded?: { cell: string; text: string; reason: string }[] }).downgraded ?? [],
  };
}

/** The memo as Markdown, for the export button. */
export function memoMarkdown(runId: string, v: MemoView): string {
  const lines = [`# Decision memo · ${runId}`, "", v.summary, "", "| Provider | Verdict | Reasons |", "|---|---|---|"];
  for (const x of v.verdicts) lines.push(`| ${x.provider} | ${x.verdict}${x.plan ? ` (${x.plan})` : ""} | ${x.reasons.replace(/\|/g, "/")} |`);
  lines.push("", v.disclaimer, "", "## Evidence", "", "| Cell | Value | Source | Page date | Quote |", "|---|---|---|---|---|");
  for (const c of v.claims) lines.push(`| ${c.cell} | ${c.value} | ${c.evidence?.source ?? "-"} | ${c.evidence ? `${c.evidence.pageDate} (${c.evidence.dateKind})` : "-"} | ${(c.evidence?.quote ?? "").replace(/\|/g, "/")} |`);
  lines.push("", "## Unknowns", "");
  for (const u of v.unknowns) lines.push(`- ${u.cell}: ${u.reason}`);
  if (v.conflicts.length) {
    lines.push("", "## Conflicts", "");
    for (const c of v.conflicts) lines.push(`- ${c.cell}: ${c.sides.map((s) => `${s.value} (${s.source}, ${s.kind}, ${s.date})${s.used ? " used" : " superseded"}`).join(" vs ")}`);
  }
  return lines.join("\n") + "\n";
}
