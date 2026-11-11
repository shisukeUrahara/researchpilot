"use client";
import { useState } from "react";
import type { ClaimView } from "@/core/views/memo";
import { Drawer } from "@/components/Drawer";
import { Pill } from "@/components/ui/Pill";

/** Every number of the memo; selecting one shows its quote, passage, source, page date and tool event. */
export function Claims({ claims }: { claims: ClaimView[] }) {
  const [sel, setSel] = useState(0);
  const c = claims[sel];
  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <h2 className="mb-3 font-display text-base font-medium">Numbers in the memo</h2>
        {claims.length === 0 ? (
          <p className="text-sm text-muted">The memo states no numbers: every cell is unknown or was removed by the memo check.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            {claims.map((x, i) => (
              <li key={`${x.cell}-${i}`}>
                <button type="button" aria-pressed={sel === i} onClick={() => setSel(i)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2 aria-pressed:bg-brand-bg">
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted">{x.cell}</span>
                    <span className="block truncate">{x.text}</span>
                  </span>
                  <span className="font-mono text-sm underline decoration-brand underline-offset-4">{x.value}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lg:col-span-5">
        <Drawer label="Evidence">
          {c?.evidence ? (
            <div className="space-y-3 rounded-2xl border border-line bg-surface/85 p-4 text-sm" data-testid="evidence">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Quote</p>
              <blockquote className="rounded-xl bg-surface-2 p-3">{c.evidence.quote || <span className="text-muted">(no quote recorded)</span>}</blockquote>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted">passage</dt>
                <dd className="break-all font-mono">{c.evidence.passageId}</dd>
                <dt className="text-muted">source</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{c.evidence.source}</span>
                  <Pill tone={c.evidence.kind === "docs" ? "neutral" : "warn"}>{c.evidence.kind}</Pill>
                </dd>
                <dt className="text-muted">page date</dt>
                <dd className="flex items-center gap-2 font-mono">
                  {c.evidence.pageDate} <Pill>{c.evidence.dateKind}</Pill>
                </dd>
                <dt className="text-muted">tool event</dt>
                <dd className="break-all font-mono">{c.evidence.toolEvent ?? "—"}</dd>
                {c.evidence.url && (
                  <>
                    <dt className="text-muted">page</dt>
                    <dd className="break-all">
                      <a className="underline underline-offset-2" href={c.evidence.url} rel="noreferrer" target="_blank">
                        {c.evidence.url}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              <details>
                <summary className="cursor-pointer text-xs text-muted">Whole passage</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-mono text-[11px]">{c.evidence.passageText}</pre>
              </details>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">{c ? "No evidence recorded for this number." : "Pick a number to see its evidence."}</p>
          )}
        </Drawer>
      </div>
    </div>
  );
}
