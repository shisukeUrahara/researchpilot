import { ClipboardList, FileText, Play } from "lucide-react";

/** The three tabs. Plain module so server components (not-found) can read it too. */
export const LINKS = [
  { href: "/", label: "Run", short: "Run", icon: Play },
  { href: "/memo", label: "Memo", short: "Memo", icon: FileText },
  { href: "/evals", label: "Evals", short: "Evals", icon: ClipboardList },
];

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/memo" && path.startsWith("/runs/")));
