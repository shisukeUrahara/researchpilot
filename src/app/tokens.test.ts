import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

/** The custom properties of one block, e.g. ":root {" or ".dark {". */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Every text colour and the backgrounds it is used on. */
const PAIRS: [string, string][] = [
  ["ink", "canvas"],
  ["ink", "surface"],
  ["ink", "surface-2"],
  ["muted", "canvas"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["primary-ink", "primary"],
  ["brand", "brand-bg"],
  ["brand", "surface"],
  ["success", "success-bg"],
  ["success", "surface"],
  ["warn", "warn-bg"],
  ["danger", "danger-bg"],
  ["danger", "surface"],
  ["warn", "surface"],
  ["warn", "surface-2"],
  ["danger", "surface-2"],
  ["success", "surface-2"],
  ["arm-m", "surface"],
];

describe.each([":root", ".dark"])("%s tokens", (selector) => {
  const t = block(selector);
  test.each(PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(t[fg], `missing --${fg}`).toBeDefined();
    expect(t[bg], `missing --${bg}`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

test("the contrast helper matches known values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
});
