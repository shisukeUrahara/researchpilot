"use client";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

/** Error boundary for every page. Server errors arrive without their message; the digest matches the server log. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-[20px] border border-danger/30 bg-surface/85 p-8 text-center shadow-card">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-danger-bg">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
      </span>
      <h1 className="display mt-4 text-3xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">This page could not read its runs or the state folder. Trying again often helps; `pnpm rp verify` checks the sources and `pnpm rp rebuild-db` repairs run rows.</p>
      {digest && <p className="mt-3 font-mono text-xs text-muted">error id {digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={() => retry()} className="min-h-11 rounded-[10px] bg-primary px-5 text-sm font-medium text-primary-ink">
          Try again
        </button>
        <Link href="/" className="flex min-h-11 items-center rounded-[10px] border border-line px-5 text-sm hover:bg-surface-2">
          Go to Run
        </Link>
      </div>
    </div>
  );
}
