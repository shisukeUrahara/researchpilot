import type { ReactNode } from "react";

/** Hairline panel, 20px radius. Grouping only: long lists inside use dividers, not nested cards. */
export function Card({
  title,
  hint,
  action,
  children,
  className = "",
  as: Tag = "section",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      aria-label={typeof title === "string" ? title : undefined}
      className={`min-w-0 rounded-[20px] border border-line bg-surface/85 p-5 shadow-card backdrop-blur-xl md:p-6 ${className}`}
    >
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-medium">{title}</h2>}
            {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
