import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rawPath, type Manifest, type Source } from "./manifest";
import { pageDate, sha256Hex, toText } from "./text";

export type Fetcher = (url: string) => Promise<{ status: number; contentType: string; body: string }>;

/** A generic client name; no personal details go to the sites we read. */
export const USER_AGENT = "ResearchPilot/0.1 (open-source research agent; reads public docs)";

export const httpFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/markdown, text/html;q=0.9, */*;q=0.5" }, redirect: "follow" });
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: await res.text() };
};

export interface FetchReport {
  id: string;
  /** new = first download; same = sha unchanged; drift = the page changed since the manifest was written. */
  status: "new" | "same" | "drift";
  page_date: string | null;
  old_sha: string | null;
  new_sha: string;
}

/**
 * Downloads every source, stores normalized text in cache/raw/, and returns an updated manifest.
 * A changed page is reported as drift and the manifest keeps the OLD sha unless `accept` is set:
 * frozen evals must never silently move to newer docs.
 */
export async function fetchSources(m: Manifest, dataDir: string, fetcher: Fetcher, now: Date, accept = false): Promise<{ manifest: Manifest; reports: FetchReport[] }> {
  const reports: FetchReport[] = [];
  const sources: Source[] = [];
  for (const s of m.sources) {
    const res = await fetcher(s.fetch_url);
    if (res.status !== 200) throw new Error(`${s.id}: HTTP ${res.status} from ${s.fetch_url}`);
    const text = toText(res.body, res.contentType);
    const sha = sha256Hex(text);
    const status: FetchReport["status"] = s.sha256 === null ? "new" : s.sha256 === sha ? "same" : "drift";
    const date = pageDate(s, text);
    reports.push({ id: s.id, status, page_date: date, old_sha: s.sha256, new_sha: sha });
    if (status === "drift" && !accept) {
      // Keep the frozen copy; save the new text next to it for a look.
      writeRaw(dataDir, `${s.id}.drift`, text);
      sources.push(s);
      continue;
    }
    writeRaw(dataDir, s.id, text);
    sources.push({
      ...s,
      page_date: date ?? now.toISOString().slice(0, 10),
      date_kind: date ? "page" : "retrieved",
      retrieved_at_utc: status === "same" && s.retrieved_at_utc ? s.retrieved_at_utc : now.toISOString(),
      sha256: sha,
      bytes: Buffer.byteLength(text),
    });
  }
  return { manifest: { ...m, sources }, reports };
}

function writeRaw(dataDir: string, id: string, text: string): void {
  const file = rawPath(dataDir, id);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** The saved text of a source, or null if cache/raw/ has not been filled on this machine. */
export function readRaw(dataDir: string, id: string): string | null {
  const file = rawPath(dataDir, id);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}
