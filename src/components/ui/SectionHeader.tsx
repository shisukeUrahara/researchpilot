import type { ReactNode } from "react";

export function SectionHeader({ title, hint, action, id }: { title: string; hint?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
