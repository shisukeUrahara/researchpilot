import Link from "next/link";
import { RunPanel } from "@/components/run/RunPanel";
import { StartForm, type SampleView } from "@/components/run/StartForm";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { loadBrief } from "@/core/domain/criteria";
import { resolveBrief } from "@/core/scenarios/lint";
import { runView } from "@/core/views/run";
import { env, getRun, limits, listRuns, manifest, SAMPLES, scenarioById } from "./_lib/data";

export const dynamic = "force-dynamic";

const TWIST: Record<string, string> = {
  freshness: "the 2025 copy of Vercel's limits page is forced to rank 1",
  injection: "a planted note sits at rank 1 in every search",
  deadend: "search only ever returns a page with nothing in it",
};

export default async function RunPage({ searchParams }: PageProps<"/">) {
  const { run } = await searchParams;
  const runId = typeof run === "string" ? run : null;
  const e = env();
  const samples: SampleView[] = SAMPLES.map((s) => {
    const sc = scenarioById(s.id)!;
    const b = resolveBrief(sc, loadBrief(e.dataDir, sc.brief_id));
    const w = b.workload;
    return {
      id: s.id,
      label: s.label,
      question: b.question,
      workload: `${w.duration_s} s · ${w.cpu_ms / 1000} s CPU · ${w.memory_mb} MB · ${w.streaming ? "streaming" : "no streaming"} · plans ${Object.entries(b.plans).map(([p, v]) => `${p} ${v.join("/")}`).join(", ")}`,
      twist: TWIST[sc.kind] ?? null,
    };
  });
  const data = runId ? await getRun(runId) : null;
  const initial = data ? { view: runView(data.row, data.state, data.events, data.tools, limits()), pending_approval: data.approvals.find((a) => a.status === "pending") ?? null, has_memo: data.report !== null } : null;
  const recent = listRuns(8);
  const sources = manifest().sources;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-5">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Research brief</h1>
          <p className="mt-2 text-sm text-muted">The agent reads saved, dated copies of official limits pages. Its stop rules and tool permissions live in code, not in the prompt.</p>
        </div>
        <Card>
          <StartForm samples={samples} live={e.mode === "live"} />
        </Card>
        <Card title="Sources" hint="Official pages, saved with their dates (fixtures/sources/manifest.json)">
          <ul className="divide-y divide-line/70 text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{s.id}</span>
                <span className="flex items-center gap-2">
                  <Pill tone={s.kind === "archive" ? "warn" : "neutral"}>{s.kind}</Pill>
                  <span className="font-mono text-xs text-muted">
                    {s.page_date} · {s.date_kind}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {recent.length > 0 && (
          <Card title="Recent runs">
            <ul className="divide-y divide-line/70 text-sm">
              {recent.map((r) => (
                <li key={r.run_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link className="font-mono text-xs underline-offset-2 hover:underline" href={`/?run=${r.run_id}`}>
                    {r.run_id}
                  </Link>
                  <span className="text-xs text-muted">
                    {r.arm} · {r.scenario_id ?? r.brief_id} · {r.stop_reason ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="lg:col-span-7">
        {runId ? (
          <RunPanel key={runId} runId={runId} initial={initial} />
        ) : (
          <div className="rounded-[20px] border border-dashed border-line bg-surface/50 p-10 text-center text-sm text-muted">
            Pick a sample brief and start a run. The plan board, budget meters and timeline show up here.
            <code className="mt-3 block font-mono text-xs">pnpm rp run --brief three-minute</code>
          </div>
        )}
      </div>
    </div>
  );
}
