import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Empty } from "@/components/StateViews";
import { evalsView } from "@/core/views/evals";
import { evalData } from "@/app/_lib/data";

export const dynamic = "force-dynamic";

const ARM_DOT: Record<string, string> = { bounded: "bg-brand", ablation: "bg-arm-m", naive: "bg-muted", "bounded-permissive": "bg-danger" };

export default function EvalsPage() {
  const { sets, gate, manifests } = evalData();
  const v = evalsView(sets, gate);
  const any = Object.values(sets).some(Boolean);
  const m = manifests["eval-bounded"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Evals</h1>
        <p className="mt-1 text-sm text-muted">
          Same model, same tools, same corpus, same budget. 40 frozen tasks per arm, 30 planted notes for the injection rows. Every number names the run set it comes from (runs/&lt;set&gt;/).
        </p>
        {m && (
          <p className="mt-2 font-mono text-xs text-muted">
            git {m.git_sha.slice(0, 7)} · prompts {m.prompt_set_sha} · {m.model_spec} · n={m.sample_count}
            {m.not_run.length ? ` · not run: ${m.not_run.join(", ")}` : ""}
          </p>
        )}
      </div>

      {!any ? (
        <Empty title="No eval run sets yet." command="pnpm rp eval --arm bounded --split eval" />
      ) : (
        <>
          {gate && (
            <Card title={`Release gate: ${gate.decision.toUpperCase()}`} hint={`${gate.rules} · applied to the bounded arm`}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {gate.checks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Pill tone={c.pass ? "success" : "danger"}>{c.pass ? "pass" : "fail"}</Pill>
                    <span className="font-mono text-xs">{c.id}</span>
                    <span className="text-muted">
                      {c.value === null ? "n/a" : c.tier === "quality" ? `${(c.value * 100).toFixed(1)}%` : c.value} ({c.limit})
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div tabIndex={0} role="region" aria-label="Evals table" className="overflow-x-auto rounded-[20px] border border-line bg-surface/85">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Measure</th>
                  {v.columns.map((c) => (
                    <th key={c} className="px-4 py-3 font-mono font-medium normal-case tracking-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={`size-2 rounded-full ${ARM_DOT[c]}`} />
                        {c}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {v.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      {r.label}
                      <span className="block text-xs text-muted">{r.hint}</span>
                    </th>
                    {v.columns.map((c) => {
                      const cell = r.cells[c];
                      return (
                        <td key={c} className="px-4 py-2.5 align-top">
                          <span className="font-mono">{cell.text}</span>
                          {cell.detail && <span className="block font-mono text-[11px] text-muted">{cell.detail}</span>}
                          {cell.set && <span className="block font-mono text-[10px] text-muted">runs/{cell.set}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Card title="Stop reasons" hint="Why each run ended, per arm (eval split; injection split for bounded-permissive)">
            <div className="grid gap-4 md:grid-cols-4">
              {v.columns.map((c) => {
                const s = v.stopReasons[c];
                const total = Object.values(s).reduce((a, b) => a + b, 0);
                return (
                  <div key={c}>
                    <p className="mb-2 font-mono text-xs">{c}</p>
                    {total === 0 ? (
                      <p className="text-xs text-muted">not run</p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {Object.entries(s)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, n]) => (
                            <li key={k} className="flex items-center gap-2">
                              <span className="w-24 font-mono">{k}</span>
                              <span className="h-1.5 rounded-full bg-brand" style={{ width: `${(n / total) * 100}%`, maxWidth: "8rem" }} />
                              <span className="font-mono text-muted">{n}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
