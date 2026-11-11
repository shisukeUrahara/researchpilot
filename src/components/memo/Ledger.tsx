"use client";
import { useMemo, useState } from "react";
import type { ConflictView, LedgerRow } from "@/core/views/memo";
import { Pill, type Tone } from "@/components/ui/Pill";

const STATUS: Record<LedgerRow["status"], Tone> = { verified: "success", rejected: "danger", unchecked: "warn" };
const KEYS = ["cell", "value", "status", "source", "date"] as const;

/** Every fact the run found, sortable, and every conflict as a used vs superseded pair. */
export function Ledger({ rows, conflicts }: { rows: LedgerRow[]; conflicts: ConflictView[] }) {
  const [key, setKey] = useState<(typeof KEYS)[number]>("cell");
  const sorted = useMemo(() => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) || a.id.localeCompare(b.id)), [rows, key]);
  return (
    <div className="space-y-6">
      <section aria-label="Conflicts" className="space-y-3">
        <h2 className="font-display text-base font-medium">Conflicts · {conflicts.length}</h2>
        {conflicts.length === 0 && <p className="text-sm text-muted">No two sources disagreed on a cell in this run.</p>}
        {conflicts.map((c) => (
          <div key={c.cell} className="rounded-2xl border border-line bg-surface/85 p-4">
            <p className="font-mono text-xs">{c.cell}</p>
            <div className="mt-2 space-y-2">
              {c.sides.map((s) => (
                <div key={s.factId} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-mono">{s.value}</span>
                  <span className="text-muted">
                    {s.source} · {s.kind} · {s.date}
                  </span>
                  <Pill tone={s.used ? "success" : "warn"}>{s.used ? "used" : "superseded"}</Pill>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{c.rule}</p>
          </div>
        ))}
      </section>
      <section aria-label="Facts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-medium">Facts · {rows.length}</h2>
          <label className="text-xs text-muted">
            Sort by{" "}
            <select value={key} onChange={(e) => setKey(e.target.value as (typeof KEYS)[number])} className="rounded-lg border border-line bg-surface px-2 py-1 text-ink">
              {KEYS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Cell</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.cell}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{r.value}</td>
                  <td className="px-3 py-1.5">
                    <Pill tone={STATUS[r.status]}>{r.status}</Pill>
                    {r.reason && <span className="ml-2 font-mono text-[11px] text-muted">{r.reason}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">
                    {r.source} <span className="text-muted">({r.kind})</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
