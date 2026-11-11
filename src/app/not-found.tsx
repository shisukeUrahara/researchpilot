import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "@/components/links";

export const metadata: Metadata = { title: "Not found" };

/** Unknown address or run id. */
export default function NotFound() {
  return (
    <div className="fade-up py-10 text-center">
      <p className="display text-7xl text-brand md:text-8xl">404</p>
      <h1 className="mt-4 text-xl font-medium">No such page or run</h1>
      <p className="mt-2 text-muted">The run id in the address is not in the state folder of this app. Pick a page and start again.</p>
      <nav aria-label="Pages" className="mt-6 flex flex-wrap justify-center gap-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="flex min-h-11 items-center rounded-full border border-line bg-surface/70 px-4 text-sm hover:bg-surface-2">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
