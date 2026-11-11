import { Inbox, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** One sentence on what is missing plus the exact command that fixes it. */
export function Empty({ title, command }: { title: string; command?: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-surface/50 p-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-bg">
        <Inbox aria-hidden className="size-5 text-brand" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      {command && <code className="mt-3 inline-block rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-sm text-ink">{command}</code>}
    </div>
  );
}

/** An amber note across the page, e.g. "labels changed since this gate ran". */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
