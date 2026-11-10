import { z } from "zod";
import type { ToolSpec } from "./registry";

/** The only hosts fetch_live may touch: the three official docs sites. */
export const OFFICIAL_HOSTS = ["developers.cloudflare.com", "vercel.com", "docs.aws.amazon.com"] as const;

export const FetchArgs = z.object({
  url: z
    .string()
    .url()
    .refine((u) => {
      const url = new URL(u);
      return url.protocol === "https:" && (OFFICIAL_HOSTS as readonly string[]).includes(url.hostname);
    }, "only https URLs on the official docs hosts are allowed"),
});
export type FetchArgs = z.infer<typeof FetchArgs>;

/**
 * Re-downloads an official page to check freshness. Needs a person's approval for this exact URL.
 * v1 has no network here: it answers with the recorded copy from the source manifest, so evals and
 * replays stay deterministic. A URL not in the manifest is `not_found`.
 */
export const fetchLive: ToolSpec = {
  name: "fetch_live",
  args: FetchArgs,
  sideEffect: false,
  needsApproval: true,
  run: (a: FetchArgs, c) => {
    const want = a.url.replace(/\/$/, "");
    const s = c.docs.world.manifest.sources.find((x) => x.url.replace(/\/$/, "") === want);
    if (!s) return JSON.stringify({ error: "not_found", url: a.url });
    return JSON.stringify({
      status: "recorded",
      url: s.url,
      source_id: s.id,
      page_date: s.page_date,
      date_kind: s.date_kind,
      sha256: s.sha256,
      note: "recorded copy from the manifest; v1 does not fetch over the network",
    });
  },
} as ToolSpec;
