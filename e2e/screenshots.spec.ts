import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Captures the post images. Runs against the e2e server (a copy of the committed data, replay only):
//   E2E_SHOTS=1 pnpm exec playwright test e2e/screenshots.spec.ts --project desktop --project mobile
// Images land in E2E_MEDIA_DIR (default ../content/researchpilot/media, outside the repo).
test.skip(!process.env.E2E_SHOTS, "set E2E_SHOTS=1 to capture images");
test.describe.configure({ mode: "serial" });

const out = (name: string) => path.resolve(process.env.E2E_MEDIA_DIR ?? "../content/researchpilot/media", name);

async function startSample(page: Page, label: string) {
  await page.goto("/");
  await page.getByRole("radio", { name: label }).check({ force: true });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\?run=run_/);
  await expect(page.getByTestId("stop-reason")).not.toHaveText(/RUNNING/, { timeout: 90_000 });
  await expect(page.getByRole("link", { name: "Open memo" })).toBeVisible({ timeout: 30_000 });
}

test("desktop images", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await startSample(page, "Three-minute job");
  await page.screenshot({ path: out("ui-run-dark.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.screenshot({ path: out("ui-run-light.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.getByRole("link", { name: "Open memo" }).click();
  await expect(page.getByRole("heading", { name: "Decision memo" })).toBeVisible();
  await page.screenshot({ path: out("ui-memo-dark.png"), fullPage: true });
  await page.getByRole("link", { name: "Evidence ledger" }).click();
  await page.screenshot({ path: out("ui-ledger-dark.png"), fullPage: true });
  await startSample(page, "Planted instruction");
  await page.screenshot({ path: out("ui-run-injected-dark.png"), fullPage: true });
  await page.goto("/evals");
  await page.screenshot({ path: out("ui-evals-dark.png"), fullPage: true });
});

test("phone image", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await startSample(page, "Dead end");
  await page.screenshot({ path: out("ui-run-phone.png") });
});
