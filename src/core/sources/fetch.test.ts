import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { fetchSources, readRaw, type Fetcher } from "./fetch";
import type { Manifest } from "./manifest";

const base = {
  provider: "vercel" as const,
  license: "test license text",
  page_date: null,
  date_kind: null,
  retrieved_at_utc: null,
  sha256: null,
  bytes: null,
};
const m: Manifest = {
  note: "t",
  sources: [
    { ...base, id: "vc-limits", kind: "docs", url: "https://v.test/a", fetch_url: "https://v.test/a.md", date_rule: "frontmatter_last_updated" },
    { ...base, id: "aws-quotas", provider: "aws", kind: "docs", url: "https://a.test/q", fetch_url: "https://a.test/q", date_rule: "none" },
  ],
};
const pages: Record<string, { contentType: string; body: string }> = {
  "https://v.test/a.md": { contentType: "text/markdown", body: "---\nlast_updated: 2026-08-24\n---\nHobby | 300s |" },
  "https://a.test/q": { contentType: "text/html", body: "<table><tr><td>Function timeout</td><td>900 seconds</td></tr></table>" },
};
const fetcher: Fetcher = async (url) => ({ status: 200, ...pages[url] });
const now = new Date("2026-11-11T09:00:00Z");

test("first fetch fills page date, date kind, sha and raw text", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-src-"));
  const { manifest, reports } = await fetchSources(m, dir, fetcher, now);
  expect(reports.map((r) => r.status)).toEqual(["new", "new"]);
  expect(manifest.sources[0]).toMatchObject({ page_date: "2026-08-24", date_kind: "page" });
  // AWS states no date: we record our download date and say so.
  expect(manifest.sources[1]).toMatchObject({ page_date: "2026-11-11", date_kind: "retrieved" });
  expect(readRaw(dir, "aws-quotas")).toBe("Function timeout | 900 seconds |\n");
});

test("re-fetch: same page → same; changed page → drift, and the frozen copy is kept", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-src-"));
  const first = (await fetchSources(m, dir, fetcher, now)).manifest;
  const changed: Fetcher = async (url) => (url === "https://a.test/q" ? { status: 200, contentType: "text/html", body: "<p>1000 seconds</p>" } : fetcher(url));
  const { manifest, reports } = await fetchSources(first, dir, changed, new Date("2026-12-01T00:00:00Z"));
  expect(reports.map((r) => r.status)).toEqual(["same", "drift"]);
  expect(manifest.sources[1].sha256).toBe(first.sources[1].sha256);
  expect(readRaw(dir, "aws-quotas")).toContain("900 seconds");
  expect(readFileSync(path.join(dir, "cache", "raw", "aws-quotas.drift.txt"), "utf8")).toContain("1000 seconds");
  // A same page keeps its first retrieval time.
  expect(manifest.sources[0].retrieved_at_utc).toBe(first.sources[0].retrieved_at_utc);
});

test("a non-200 reply stops the fetch with the source id", async () => {
  const bad: Fetcher = async () => ({ status: 503, contentType: "", body: "" });
  await expect(fetchSources(m, mkdtempSync(path.join(tmpdir(), "rp-src-")), bad, now)).rejects.toThrow(/vc-limits: HTTP 503/);
});
