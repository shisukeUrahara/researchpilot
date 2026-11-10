import { expect, test } from "vitest";
import { htmlToText, normalizeText, pageDate, toText } from "./text";

test("table rows stay on one line, so a plan stays next to its value", () => {
  const html = "<table><tr><th>Plan</th><th>Max</th></tr><tr><td>Hobby</td><td>60s</td></tr></table><script>x()</script>";
  expect(htmlToText(html)).toBe("Plan | Max |\nHobby | 60s |\n");
});

test("entities are decoded and whitespace normalized", () => {
  expect(htmlToText("<p>128&nbsp;MB &amp; 10&#44;240&nbsp;MB</p>")).toBe("128 MB & 10,240 MB\n");
  expect(normalizeText("  a \t b \r\n\r\n c ")).toBe("a b\nc\n");
});

test("markdown passes through, html is converted", () => {
  expect(toText("# T\n\nbody", "text/markdown")).toBe("# T\nbody\n");
  expect(toText("<h1>T</h1>", "text/html; charset=utf-8")).toBe("T\n");
});

test("page dates by rule", () => {
  const f = (date_rule: Parameters<typeof pageDate>[0]["date_rule"], text: string, fetch_url = "https://x.test") => pageDate({ date_rule, fetch_url }, text);
  expect(f("frontmatter_last_updated", "---\nlast_updated: 2026-08-24\n---")).toBe("2026-08-24");
  expect(f("cloudflare_last_updated", "Last updated Oct 29, 2026")).toBe("2026-10-29");
  expect(f("changelog_published", "**Published:** June 15, 2026 | **Authors:**")).toBe("2026-06-15");
  expect(f("wayback_timestamp", "", "https://web.archive.org/web/20250308002203id_/https://vercel.com/x")).toBe("2025-03-08");
  expect(f("none", "Last updated Oct 29, 2026")).toBeNull();
  expect(f("frontmatter_last_updated", "no date here")).toBeNull();
});
