import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/evals", "/memo"];

async function cannotScrollSideways(page: Page) {
  const [content, screen] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(content).toBeLessThanOrEqual(screen);
}

for (const path of [...PAGES, "/runs/run_missing", "/no-such-page"]) {
  test(`${path} renders without sideways scroll`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await cannotScrollSideways(page);
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const path of PAGES) {
    test(`${path} has no axe violations (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    });
  }
}

test("an unknown address is a 404", async ({ page }) => {
  expect((await page.goto("/no-such-page"))?.status()).toBe(404);
});
