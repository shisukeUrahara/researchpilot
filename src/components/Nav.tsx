"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isActive, LINKS } from "./links";
import { ThemeToggle } from "./ThemeToggle";

/** Top bar with pill tabs (desktop) and a bottom tab bar with three icons (phone). */
export function Nav({ modeChip }: { modeChip?: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:px-6">
          <Link href="/" className="shrink-0 font-display text-[19px] font-medium tracking-tight">
            ResearchPilot
          </Link>
          <nav aria-label="Main" className="mx-auto hidden rounded-full border border-line bg-surface/70 p-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(path, l.href) ? "page" : undefined}
                className="rounded-full px-4 py-1.5 text-sm text-muted transition-colors hover:text-ink aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-primary-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {modeChip}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-3">
          {LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(path, l.href) ? "page" : undefined}
                  className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted aria-[current=page]:font-medium aria-[current=page]:text-brand"
                >
                  <Icon className="size-5" aria-hidden />
                  {l.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
