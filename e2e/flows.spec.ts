import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("a sample run replays through the real graph, then its memo opens with evidence", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one replay run is enough");
  await page.goto("/");
  await page.getByRole("radio", { name: "Three-minute job" }).check({ force: true });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\?run=run_/);
  await expect(page.getByTestId("stop-reason")).not.toHaveText(/RUNNING/, { timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Plan board" })).toBeVisible();
  await page.getByRole("link", { name: "Open memo" }).click({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Decision memo" })).toBeVisible();
  await expect(page.getByText(/Not a recommendation/)).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("link", { name: "Evidence ledger" }).click();
  await expect(page.getByRole("region", { name: "Facts", exact: true })).toBeVisible();
});

test("evals page shows the bounded arm with its run set", async ({ page }) => {
  await page.goto("/evals");
  await expect(page.getByRole("heading", { name: "Evals" })).toBeVisible();
  await expect(page.getByText("runs/eval-bounded").first()).toBeVisible();
});
