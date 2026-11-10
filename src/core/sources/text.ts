import { createHash } from "node:crypto";
import type { Source } from "./manifest";

export const sha256Hex = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

function unescapeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * HTML to plain text that keeps table rows on one line ("cell | cell"), so a passage can quote a
 * whole row and the plan name stays next to its value. Good enough for docs pages; not a browser.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<\/(td|th)>\s*/gi, " | ");
  s = s.replace(/<\/tr>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(p|div|li|ul|ol|h[1-6]|table|thead|tbody|section|article|header|footer|nav|main|aside|pre|blockquote|dt|dd|dl)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  return normalizeText(unescapeEntities(s));
}

/** Collapses runs of spaces, trims lines, drops empty lines. Same input, same bytes. */
export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n")
    .concat("\n");
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function isoFromWords(month: string, day: string, year: string): string | null {
  const m = MONTHS.findIndex((x) => x.startsWith(month.toLowerCase().slice(0, 3)));
  if (m < 0) return null;
  return `${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** The page's own date, by the source's rule. Null when the page states none. */
export function pageDate(source: Pick<Source, "date_rule" | "fetch_url">, text: string): string | null {
  switch (source.date_rule) {
    case "frontmatter_last_updated": {
      const m = /^last_updated:\s*"?(\d{4}-\d{2}-\d{2})/m.exec(text);
      return m ? m[1] : null;
    }
    case "cloudflare_last_updated": {
      const m = /Last updated:?\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
      return m ? isoFromWords(m[1], m[2], m[3]) : null;
    }
    case "changelog_published": {
      const m = /\*\*Published:\*\*\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
      return m ? isoFromWords(m[1], m[2], m[3]) : null;
    }
    case "wayback_timestamp": {
      const m = /web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})/.exec(source.fetch_url);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    }
    case "none":
      return null;
  }
}

/** Markdown and plain text pass through; HTML is converted. */
export function toText(body: string, contentType: string): string {
  return /html/i.test(contentType) ? htmlToText(body) : normalizeText(body);
}
