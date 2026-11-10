import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import type { Manifest } from "./manifest";
import { cleanLine, loadPassageFile, MAX_WORDS, passagesPath, selectPassages, splitPassages, writePassageFile } from "./passages";
import { sha256Hex } from "./text";
import { verifySources } from "./verify";

const RAW = [
  "# Limits",
  "Last updated Oct 29, 2026",
  "## Account plan limits",
  "| Feature | Workers Free | Workers Paid |",
  "| --- | --- | --- |",
  "| [CPU time](#cpu-time) | 10 ms | 5 min |",
  "| [Memory](#memory) | 128 MB | 128 MB |",
  "## Community",
  "Join our Discord to chat with other developers about anything at all here.",
  "",
].join("\n");
const src = { id: "cf-limits", page_date: "2026-10-29" };

test("cleanLine keeps link text and drops markup", () => {
  expect(cleanLine("| [CPU time](#cpu-time) | 10 ms |")).toBe("| CPU time | 10 ms |");
  expect(cleanLine("> **💡 Note:** The `800` second maximum")).toBe("Note: The 800 second maximum");
  expect(cleanLine("Outgoing<br>connections<sup>[1](#fn)</sup>")).toBe("Outgoing connections");
});

test("passages follow headings, keep table rows together and get stable ids", () => {
  const ps = splitPassages(src, RAW);
  expect(ps.map((p) => p.id)).toEqual(["cf-limits@2026-10-29#limits-1", "cf-limits@2026-10-29#account-plan-limits-1", "cf-limits@2026-10-29#community-1"]);
  expect(ps[1].text).toBe("| Feature | Workers Free | Workers Paid |\n| CPU time | 10 ms | 5 min |\n| Memory | 128 MB | 128 MB |");
});

test("a long table is split and every part repeats the header row", () => {
  const rows = Array.from({ length: 30 }, (_, i) => `| Limit ${i} | ${i} MB | ${i * 2} MB |`);
  const ps = splitPassages(src, ["## Big", "| Name | Free | Paid |", ...rows].join("\n"));
  expect(ps.length).toBeGreaterThan(1);
  for (const p of ps) {
    expect(p.text.startsWith("| Name | Free | Paid |")).toBe(true);
    expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS + 1);
  }
});

test("menu-like blocks are dropped", () => {
  const ps = splitPassages(src, ["## Nav", "Getting started", "Projects", "Deployments", "Search", "Docs"].join("\n"));
  expect(ps).toEqual([]);
});

test("selection keeps limit passages and a few distractors", () => {
  const ps = splitPassages(src, RAW);
  const kept = selectPassages(ps).map((p) => p.heading);
  expect(kept).toContain("Account plan limits");
  expect(kept).toContain("Community"); // a distractor, so search is not trivial
});

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "rp-ver-"));
  mkdirSync(path.join(dir, "fixtures", "sources", "passages"), { recursive: true });
  mkdirSync(path.join(dir, "cache", "raw"), { recursive: true });
  writeFileSync(path.join(dir, "cache", "raw", "cf-limits.txt"), RAW);
  writePassageFile(dir, "cf-limits", splitPassages(src, RAW));
  const m: Manifest = {
    note: "t",
    sources: [
      {
        id: "cf-limits",
        provider: "cloudflare",
        kind: "docs",
        url: "https://c.test/",
        fetch_url: "https://c.test/index.md",
        date_rule: "cloudflare_last_updated",
        license: "test license text",
        page_date: "2026-10-29",
        date_kind: "page",
        retrieved_at_utc: "2026-11-11T09:00:00Z",
        sha256: sha256Hex(RAW),
        bytes: RAW.length,
      },
    ],
  };
  return { dir, m };
}

test("verify passes on built passages", () => {
  const { dir, m } = repo();
  expect(verifySources(m, dir)).toMatchObject({ issues: [], checkedRaw: 1, passages: 3 });
});

test("a hand-edited passage fails verify, even without the raw page", () => {
  const { dir, m } = repo();
  const file = loadPassageFile(dir, "cf-limits");
  file.passages[1].text = file.passages[1].text.replace("128 MB | 128 MB", "512 MB | 512 MB");
  writeFileSync(passagesPath(dir, "cf-limits"), JSON.stringify(file));
  const problems = verifySources(m, dir).issues.map((i) => i.problem);
  expect(problems).toContain("passages_sha");
  expect(problems).toContain("line_not_in_page");
});

test("a passage rebuilt with a fake line fails the raw-page check", () => {
  const { dir, m } = repo();
  const ps = splitPassages(src, RAW);
  ps[1] = { ...ps[1], text: ps[1].text + "\n| Duration | none | 1 hour |" };
  writePassageFile(dir, "cf-limits", ps);
  expect(verifySources(m, dir).issues).toEqual([expect.objectContaining({ problem: "line_not_in_page", detail: "| Duration | none | 1 hour |" })]);
});
