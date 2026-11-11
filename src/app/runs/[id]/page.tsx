import Link from "next/link";
import { notFound } from "next/navigation";
import { Claims } from "@/components/memo/Claims";
import { Ledger } from "@/components/memo/Ledger";
import { Card } from "@/components/ui/Card";
import { Pill, type Tone } from "@/components/ui/Pill";
import { memoView } from "@/core/views/memo";
import { getRun, manifest, passagesWithNotes } from "@/app/_lib/data";

export const dynamic = "force-dynamic";

const VERDICT: Record<string, Tone> = { fits: "success", fits_on: "brand", does_not_fit: "danger", unknown: "waived" };
const LABEL: Record<string, string> = { fits: "fits", fits_on: "fits on", does_not_fit: "does not fit", unknown: "unknown" };

export default async function MemoPage({ params, searchParams }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const run = await getRun(id);
  if (!run || !run.state) notFound();
  const memo = run.report ? JSON.parse(run.report.memo_json) : null;
  const v = memoView(run.state, memo, manifest(), passagesWithNotes(), run.tools);
  const ledgerTab = tab === "ledger";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Decision memo</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {id} · {run.row.arm} · {run.row.scenario_id ?? run.row.brief_id} · stop {run.row.stop_reason ?? run.row.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Memo tabs" className="flex rounded-full border border-line bg-surface/70 p-1">
            <Link href={`/runs/${id}`} aria-current={!ledgerTab ? "page" : undefined} className="rounded-full px-4 py-1.5 text-sm text-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-ink">
              Memo
            </Link>
            <Link href={`/runs/${id}?tab=ledger`} aria-current={ledgerTab ? "page" : undefined} className="rounded-full px-4 py-1.5 text-sm text-muted aria-[current=page]:bg-primary aria-[current=page]:text-primary-ink">
              Evidence ledger
            </Link>
          </nav>
          {memo && (
            <a href={`/api/research-runs/${id}/report`} className="rounded-[10px] border border-line px-3 py-1.5 text-sm hover:border-brand">
              Export memo .md
            </a>
          )}
        </div>
      </div>

      {!memo && (
        <p role="status" className="rounded-2xl border border-warn/40 bg-warn-bg p-4 text-sm text-warn">
          This run has no memo ({run.row.stop_reason ?? run.row.status}). The ledger below still shows what it found.
        </p>
      )}

      {ledgerTab ? (
        <Ledger rows={v.ledger} conflicts={v.conflicts} />
      ) : (
        <>
          {memo && (
            <Card title="Verdict" hint={v.summary}>
              <div tabIndex={0} role="region" aria-label="Verdict table" className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Provider</th>
                      <th className="py-2 pr-4 font-medium">Verdict</th>
                      <th className="py-2 font-medium">Reasons</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {v.verdicts.map((x) => (
                      <tr key={x.provider}>
                        <td className="py-2 pr-4 align-top">{x.provider}</td>
                        <td className="whitespace-nowrap py-2 pr-4 align-top">
                          <Pill tone={VERDICT[x.verdict]}>
                            {LABEL[x.verdict]}
                            {x.plan ? ` ${x.plan}` : ""}
                          </Pill>
                        </td>
                        <td className="py-2 align-top text-muted">{x.reasons}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">{v.disclaimer}</p>
            </Card>
          )}
          <Claims claims={v.claims} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={`Unknowns · ${v.unknowns.length}`}>
              <ul className="space-y-1.5 text-sm">
                {v.unknowns.map((u, i) => (
                  <li key={`${u.cell}-${i}`} className="rounded-lg border border-dashed border-line px-3 py-1.5">
                    <span className="font-mono text-xs">{u.cell}</span> <span className="text-muted">— {u.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Removed by the memo check" hint="The writer's claims that the ledger did not back">
              {v.downgraded.length === 0 ? (
                <p className="text-sm text-muted">None.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {v.downgraded.map((d, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{d.cell}</span>
                      <Pill tone="danger">{d.reason}</Pill>
                      <span className="text-muted">{d.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
