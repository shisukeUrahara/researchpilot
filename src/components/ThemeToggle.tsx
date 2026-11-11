"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** Both icons render; CSS shows the right one, so there is no hydration flash. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="grid size-10 place-items-center rounded-full border border-line bg-surface/70 text-muted transition-colors hover:text-ink"
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}
