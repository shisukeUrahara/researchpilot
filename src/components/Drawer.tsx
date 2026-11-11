"use client";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * A side panel on wide screens; below 1024px a button opens it as a bottom sheet.
 * Following a link inside closes the sheet.
 */
export function Drawer({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-center rounded-[10px] border border-line bg-surface/70 px-4 text-sm font-medium lg:hidden">
        {label}
      </button>
      {open && <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-canvas/70 lg:hidden" />}
      <div
        aria-label={label}
        role="region"
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        className={`${open ? "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[20px] border-t border-line bg-canvas p-4 pb-8" : "hidden"} lg:static lg:z-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 ${className}`}
      >
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <span className="font-medium">{label}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-11 place-items-center rounded-full border border-line">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
