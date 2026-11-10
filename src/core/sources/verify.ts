import type { Manifest } from "./manifest";
import { cleanLines, loadPassageFile, passagesSha } from "./passages";
import { readRaw } from "./fetch";
import { sha256Hex } from "./text";

export interface VerifyIssue {
  source_id: string;
  passage_id: string | null;
  problem: "passages_sha" | "line_not_in_page" | "raw_sha" | "missing_date";
  detail: string;
}

/**
 * Checks the committed source evidence:
 * - every source has a page date and a sha in the manifest;
 * - each passage file's sha matches its content (a hand edit is caught, also in CI without raw pages);
 * - when cache/raw/ is present, the raw page still matches the manifest sha and every passage line is
 *   really a line of that page.
 */
export function verifySources(m: Manifest, dataDir: string): { issues: VerifyIssue[]; checkedRaw: number; passages: number } {
  const issues: VerifyIssue[] = [];
  let checkedRaw = 0;
  let passages = 0;
  for (const s of m.sources) {
    if (!s.page_date || !s.sha256) issues.push({ source_id: s.id, passage_id: null, problem: "missing_date", detail: "run pnpm rp fetch-sources" });
    const file = loadPassageFile(dataDir, s.id);
    passages += file.passages.length;
    if (passagesSha(file.passages) !== file.sha256) {
      issues.push({ source_id: s.id, passage_id: null, problem: "passages_sha", detail: "passage file was edited by hand; rebuild with pnpm rp build-passages" });
    }
    const raw = readRaw(dataDir, s.id);
    if (raw === null) continue;
    checkedRaw++;
    if (s.sha256 && sha256Hex(raw) !== s.sha256) {
      issues.push({ source_id: s.id, passage_id: null, problem: "raw_sha", detail: "cache/raw copy differs from the manifest" });
      continue;
    }
    const lines = new Set(cleanLines(raw));
    for (const p of file.passages) {
      const bad = p.text.split("\n").find((l) => !lines.has(l));
      if (bad !== undefined) issues.push({ source_id: s.id, passage_id: p.id, problem: "line_not_in_page", detail: bad.slice(0, 80) });
    }
  }
  return { issues, checkedRaw, passages };
}
