"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlanCard, RunView } from "@/core/views/run";
import { Pill, type Tone } from "@/components/ui/Pill";

interface Payload {
  view: RunView;
  pending_approval: { approval_id: string; tool: string; args_json: string; expires_at: string } | null;
  has_memo: boolean;
}

const FINAL = new Set(["completed", "stopped", "cancelled", "failed"]);
const STOP_TONE: Record<string, Tone> = { VERIFIED: "success", CANCELLED: "danger", ERROR: "danger" };
const ROW_TONE: Record<string, Tone> = { ok: "success", warn: "warn", danger: "danger", muted: "neutral" };
const METER: Record<string, string> = { ok: "bg-brand", near: "bg-warn", hit: "bg-danger" };

/** Polls the run once a second until it ends, and shows the stop banner, meters, plan board and timeline. */
export function RunPanel({ runId, initial }: { runId: string; initial: Payload | null }) {
  const [data, setData] = useState<Payload | null>(initial);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    async function tick() {
      const res = await fetch(`/api/research-runs/${runId}`, { cache: "no-store" });
      if (stop) return;
      if (res.status === 404) setMissing(true);
      else if (res.ok) {
        const body: Payload = await res.json();
        setMissing(false);
        setData(body);
        if (FINAL.has(body.view.status) && body.has_memo) return;
      }
      setTimeout(tick, 1000);
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [runId]);

  if (!data) return <p className="text-sm text-muted">{missing ? "Starting the run…" : "Loading…"}</p>;
  const v = data.view;
  const running = !FINAL.has(v.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-surface/85 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted">{running ? (v.status === "awaiting_approval" ? "Waiting for approval" : "Running") : "Stopped"}</p>
          <p className="mt-1 font-display text-3xl font-medium tracking-tight" data-testid="stop-reason">
            {v.stopReason ?? (v.status === "awaiting_approval" ? "AWAITING APPROVAL" : "RUNNING")}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {v.runId} · {v.arm} · {v.policy} · {v.briefId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {v.stopReason && <Pill tone={STOP_TONE[v.stopReason] ?? "warn"}>{v.stopReason}</Pill>}
          <Pill tone="success">{v.counts.verified} verified</Pill>
          <Pill tone="danger">{v.counts.rejected} rejected</Pill>
          {v.counts.unchecked > 0 && <Pill tone="warn">{v.counts.unchecked} unchecked</Pill>}
          {v.counts.conflicts > 0 && <Pill tone="warn">{v.counts.conflicts} conflicts</Pill>}
          {v.blockedAttempts > 0 && <Pill tone="danger">{v.blockedAttempts} blocked by executor</Pill>}
        </div>
        <div className="flex gap-2">
          {running && (
            <button type="button" onClick={() => void fetch(`/api/research-runs/${runId}/cancel`, { method: "POST" })} className="rounded-[10px] border border-line px-3 py-1.5 text-sm hover:border-danger hover:text-danger">
              Cancel
            </button>
          )}
          {data.has_memo && (
            <Link href={`/runs/${runId}`} className="rounded-[10px] bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
              Open memo
            </Link>
          )}
        </div>
      </div>

      {data.pending_approval && (
        <div role="status" className="rounded-2xl border border-warn/40 bg-warn-bg p-4 text-sm text-warn">
          <p>
            <span className="font-mono">{data.pending_approval.tool}</span> wants to run with <span className="font-mono">{data.pending_approval.args_json}</span>. It runs only after the approver says yes, before{" "}
            {new Date(data.pending_approval.expires_at).toLocaleTimeString()}.
          </p>
          <code className="mt-2 block font-mono text-xs">pnpm rp approve {data.pending_approval.approval_id} --token $RP_APPROVER_TOKEN</code>
        </div>
      )}

      <section aria-label="Budget" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {v.meters.map((m) => (
          <div key={m.label} className="rounded-2xl border border-line bg-surface/85 p-4">
            <div className="flex justify-between text-xs text-muted">
              <span>{m.label}</span>
              <span className="font-mono">{m.text}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-2" role="meter" aria-label={m.label} aria-valuemin={0} aria-valuemax={m.max} aria-valuenow={m.used}>
              <div className={`h-1.5 rounded-full ${METER[m.tone]}`} style={{ width: `${Math.min(100, (m.used / Math.max(m.max, 1e-9)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Plan board" className="grid gap-3 md:grid-cols-4">
        {(["planned", "running", "verified", "blocked"] as const).map((col) => (
          <div key={col} className="min-w-0 rounded-2xl border border-line bg-surface/60 p-3">
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">
              {col} · {v.plan[col].length}
            </h3>
            <ul className="space-y-2">
              {v.plan[col].map((c: PlanCard) => (
                <li key={c.id} className="rounded-xl bg-surface-2 p-2.5 text-xs">
                  <p className="font-medium">
                    {c.id} · {c.task}
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-muted">{[...c.done.map((x) => `✓ ${x}`), ...c.open].slice(0, 6).join("  ")}{c.done.length + c.open.length > 6 ? " …" : ""}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-label="Timeline" className="rounded-[20px] border border-line bg-surface/85 p-4">
        <h2 className="mb-3 font-display text-base font-medium">Timeline</h2>
        <ol className="divide-y divide-line/70">
          {v.timeline.map((r) => (
            <li key={r.key} className={`grid grid-cols-[4.5rem_2.5rem_5rem_1fr] items-center gap-2 py-1.5 text-xs ${r.tone === "danger" ? "border-l-2 border-danger pl-2" : ""}`}>
              <span className="font-mono text-muted">{(r.ms / 1000).toFixed(1)} s</span>
              <span className="font-mono text-muted">#{r.step}</span>
              <span className="font-mono">{r.node}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Pill tone={ROW_TONE[r.tone]}>{r.kind}</Pill>
                <span className="truncate text-muted">{r.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
