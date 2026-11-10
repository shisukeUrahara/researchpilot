import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** Bump when the key recipe changes. Old entries then stop matching, visibly. */
export const CACHE_V = 1;

export const CacheEntry = z.object({
  k: z.string(),
  raw_text: z.string().nullable(),
  finish_reason: z.string().nullable(),
  refusal: z.string().nullable(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
  latency_ms: z.number(),
  attempts: z.number().int().min(1),
  created_at: z.string(),
});
export type CacheEntry = z.infer<typeof CacheEntry>;

/**
 * Append-only response cache, one JSONL file per model spec, committed to git.
 * It is what makes replay (no key, no cost) and byte-identical reproduction work.
 */
export class ResponseCache {
  private maps = new Map<string, Map<string, CacheEntry>>();

  constructor(readonly dir: string) {}

  fileFor(spec: string): string {
    return path.join(this.dir, `${spec.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`);
  }

  private mapFor(spec: string): Map<string, CacheEntry> {
    let map = this.maps.get(spec);
    if (map) return map;
    map = new Map();
    const file = this.fileFor(spec);
    if (existsSync(file)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.trim() === "") return;
          const parsed = CacheEntry.safeParse(JSON.parse(line));
          if (!parsed.success) throw new Error(`${file}:${i + 1}: not a cache entry`);
          map!.set(parsed.data.k, parsed.data);
        });
    }
    this.maps.set(spec, map);
    return map;
  }

  get(spec: string, k: string): CacheEntry | undefined {
    return this.mapFor(spec).get(k);
  }

  put(spec: string, entry: CacheEntry): void {
    const map = this.mapFor(spec);
    if (map.has(entry.k)) return;
    mkdirSync(this.dir, { recursive: true });
    // Sync on purpose: one thread, so parallel callers can never interleave a line.
    appendFileSync(this.fileFor(spec), JSON.stringify(entry) + "\n");
    map.set(entry.k, entry);
  }
}
