"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SampleView {
  id: string;
  label: string;
  question: string;
  workload: string;
  twist: string | null;
}

const ARMS = [
  { id: "bounded", hint: "stop rules, verifier, allowlist" },
  { id: "ablation", hint: "same, no-progress rule off" },
  { id: "naive", hint: "plain tool loop, nothing checked" },
] as const;

/** Pick a sample brief and an arm, then start. With no key the run replays the committed cache. */
export function StartForm({ samples, live }: { samples: SampleView[]; live: boolean }) {
  const router = useRouter();
  const [sample, setSample] = useState(samples[0].id);
  const [arm, setArm] = useState<string>("bounded");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = samples.find((s) => s.id === sample)!;

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/research-runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: sample, arm }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error?.message ?? "could not start");
    router.push(`/?run=${body.run_id}`);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">Sample briefs</legend>
        <div className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <label key={s.id} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm text-muted has-[:checked]:border-brand has-[:checked]:bg-brand-bg has-[:checked]:text-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
              <input type="radio" name="sample" value={s.id} checked={sample === s.id} onChange={() => setSample(s.id)} className="sr-only" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl bg-surface-2 p-4 text-sm">
        <p>{current.question}</p>
        <p className="mt-2 font-mono text-xs text-muted">{current.workload}</p>
        {current.twist && <p className="mt-2 text-xs text-warn">Test twist: {current.twist}</p>}
      </div>

      <fieldset>
        <legend className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">Arm</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ARMS.map((a) => (
            <label key={a.id} className="cursor-pointer rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-bg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
              <input type="radio" name="arm" value={a.id} checked={arm === a.id} onChange={() => setArm(a.id)} className="sr-only" />
              <span className="font-mono">{a.id}</span>
              <span className="mt-0.5 block text-xs text-muted">{a.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-muted">Budget per run: 16 steps · 12 tool calls · 120 s virtual · $0.12 (config/budgets.json, the same for every arm).</p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-ink disabled:opacity-60">
          {busy ? "Starting…" : "Start run"}
        </button>
        {!live && <span className="text-xs text-muted">Replay mode: sample runs come from the committed cache. Editing a brief needs live mode (OPENAI_API_KEY).</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
