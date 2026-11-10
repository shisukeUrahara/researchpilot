import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Provider } from "../domain/schemas";

export const SourceKind = z.enum(["docs", "changelog", "archive"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Source = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  provider: Provider,
  kind: SourceKind,
  /** The page people read. */
  url: z.string().url(),
  /** What we download: a markdown variant, or a Wayback raw copy (`id_`). */
  fetch_url: z.string().url(),
  /** How to find the page's own date in its text. */
  date_rule: z.enum(["frontmatter_last_updated", "cloudflare_last_updated", "changelog_published", "wayback_timestamp", "none"]),
  license: z.string().min(10),
  /** Filled by `rp fetch-sources`. */
  page_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** `page` = the page states it; `retrieved` = the page has no date, so this is our download date. */
  date_kind: z.enum(["page", "retrieved"]).nullable(),
  retrieved_at_utc: z.string().nullable(),
  /** sha256 of the normalized text in cache/raw/<id>.txt. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  bytes: z.number().int().nonnegative().nullable(),
});
export type Source = z.infer<typeof Source>;

export const Manifest = z.object({
  note: z.string(),
  sources: z.array(Source).min(1),
});
export type Manifest = z.infer<typeof Manifest>;

export const manifestPath = (dataDir: string) => path.join(dataDir, "fixtures", "sources", "manifest.json");
export const rawPath = (dataDir: string, id: string) => path.join(dataDir, "cache", "raw", `${id}.txt`);

export function loadManifest(dataDir: string): Manifest {
  return Manifest.parse(JSON.parse(readFileSync(manifestPath(dataDir), "utf8")));
}

export function saveManifest(dataDir: string, m: Manifest): void {
  writeFileSync(manifestPath(dataDir), JSON.stringify(Manifest.parse(m), null, 2) + "\n");
}

export function sourceById(m: Manifest, id: string): Source {
  const s = m.sources.find((x) => x.id === id);
  if (!s) throw new Error(`unknown source id: ${id}`);
  return s;
}
