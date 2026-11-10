import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sha256Hex } from "./text";
import type { Source } from "./manifest";

export const Passage = z.object({
  /** `<source id>@<page date>#<heading slug>-<n>`, e.g. `vc-limits@2026-08-24#max-duration-1`. */
  id: z.string(),
  source_id: z.string(),
  heading: z.string(),
  text: z.string().min(1),
});
export type Passage = z.infer<typeof Passage>;

export const PassageFile = z.object({
  source_id: z.string(),
  /** sha256 of the canonical passages JSON; `rp verify` recomputes it, so a hand edit is caught. */
  sha256: z.string(),
  passages: z.array(Passage),
});
export type PassageFile = z.infer<typeof PassageFile>;

export const MAX_WORDS = 80;
const MAX_DISTRACTORS = 4;

/**
 * A passage is "relevant" when it states a limit: a number with a unit, or a no-limit phrase.
 * Everything else is a distractor candidate. Keeping only these also keeps the quoted share of each
 * page small.
 */
const RELEVANT =
  /(\b\d[\d,.]*\s?(ms|s|sec|seconds?|min|minutes?|mb|gb|mib|kb|kib)\b)|no (hard|enforced) limit|unlimited|does not count/i;

/**
 * Makes one raw line readable and stable: markdown links keep their text, HTML tags, bold and code
 * marks go, quote markers go. The same function runs in `rp verify`, so passages stay checkable.
 */
export function cleanLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<sup>.*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*|`/g, "")
    .replace(/^>\s?/, "")
    .replace(/[↗︎💡]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const isTableRow = (l: string) => l.includes("|");
const isSeparator = (l: string) => /^\|?[\s:|-]+\|?$/.test(l) && l.includes("-");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "top";

/** The set of cleaned lines of a raw page: what a passage line must be found in. */
export function cleanLines(raw: string): string[] {
  return raw
    .split("\n")
    .map(cleanLine)
    .filter((l) => l !== "" && !isSeparator(l));
}

/**
 * Cuts a page into passages of at most 80 words under their heading. A long table is split by rows,
 * and each part repeats the header row, so a value is never quoted without its column names.
 */
export function splitPassages(source: Pick<Source, "id" | "page_date">, raw: string): Passage[] {
  const out: Passage[] = [];
  const counts = new Map<string, number>();
  let heading = "top";
  let lines: string[] = [];
  let tableHeader: string | null = null;

  const flush = () => {
    if (lines.length === 0) return;
    const text = lines.join("\n");
    // Menus and link lists (many 1-3 word lines) are page chrome, not content.
    const menuLike = lines.length >= 4 && words(text) / lines.length < 3;
    if (words(text) >= 4 && !menuLike) {
      const n = (counts.get(heading) ?? 0) + 1;
      counts.set(heading, n);
      out.push({ id: `${source.id}@${source.page_date}#${slug(heading)}-${n}`, source_id: source.id, heading, text });
    }
    lines = [];
  };

  for (const line of cleanLines(raw)) {
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = line.replace(/^#+\s*/, "");
      tableHeader = null;
      continue;
    }
    const inTable = isTableRow(line);
    if (!inTable) tableHeader = null;
    else if (tableHeader === null && (lines.length === 0 || !isTableRow(lines[lines.length - 1]))) {
      flush();
      tableHeader = line;
    }
    if (words([...lines, line].join(" ")) > MAX_WORDS) {
      flush();
      if (inTable && tableHeader !== null && line !== tableHeader) lines.push(tableHeader);
    }
    lines.push(line);
  }
  flush();
  return out;
}

/** Keeps every limit-related passage plus a few evenly spread distractors, so search is not trivial. */
export function selectPassages(all: Passage[]): Passage[] {
  const relevant = all.filter((p) => RELEVANT.test(p.text));
  const others = all.filter((p) => !RELEVANT.test(p.text));
  const step = Math.max(1, Math.floor(others.length / MAX_DISTRACTORS));
  const distractors = others.filter((_, i) => i % step === 0).slice(0, MAX_DISTRACTORS);
  const keep = new Set([...relevant, ...distractors].map((p) => p.id));
  return all.filter((p) => keep.has(p.id));
}

export const passagesPath = (dataDir: string, sourceId: string) => path.join(dataDir, "fixtures", "sources", "passages", `${sourceId}.json`);

export const passagesSha = (passages: Passage[]) => sha256Hex(JSON.stringify(passages));

export function writePassageFile(dataDir: string, sourceId: string, passages: Passage[]): void {
  const file: PassageFile = { source_id: sourceId, sha256: passagesSha(passages), passages };
  writeFileSync(passagesPath(dataDir, sourceId), JSON.stringify(file, null, 2) + "\n");
}

export function loadPassageFile(dataDir: string, sourceId: string): PassageFile {
  const file = passagesPath(dataDir, sourceId);
  if (!existsSync(file)) throw new Error(`no passages for ${sourceId}: run pnpm rp build-passages`);
  return PassageFile.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** All committed passages of all sources, sorted by id (stable order for search and tie-breaks). */
export function loadAllPassages(dataDir: string, sourceIds: string[]): Passage[] {
  return sourceIds.flatMap((id) => loadPassageFile(dataDir, id).passages).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
