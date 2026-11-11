import { expect, test } from "@playwright/test";

// Records the 90-second demo (storyboard in design/stitch/README.md) on the e2e server, replay only:
//   E2E_DEMO=1 pnpm exec playwright test e2e/demo.spec.ts --project desktop && scripts/demo-mp4.sh
test.skip(!process.env.E2E_DEMO, "set E2E_DEMO=1 to record the demo video");
test.use({ viewport: { width: 1440, height: 900 }, video: { mode: "on", size: { width: 1440, height: 900 } } });

test("demo: brief, a run, the memo's evidence, an injected run, a dead end, the evals", async ({ page }) => {
  test.setTimeout(300_000);
  const scroll = async (px: number) => {
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, px / 12);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(900);
  };
  const run = async (label: string) => {
    await page.goto("/");
    await page.getByRole("radio", { name: label }).check({ force: true });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Start run" }).click();
    await expect(page.getByTestId("stop-reason")).not.toHaveText(/RUNNING/, { timeout: 90_000 });
    await page.waitForTimeout(2000);
  };
  await page.emulateMedia({ colorScheme: "dark" });
  // 0:00 brief + dated sources
  await page.goto("/");
  await page.waitForTimeout(3000);
  await scroll(500);
  await page.waitForTimeout(1500);
  await scroll(-500);
  // 0:12 a sample run: plan board, meters, timeline, stop reason
  await run("Three-minute job");
  await scroll(600);
  await page.waitForTimeout(2500);
  await scroll(-600);
  // 0:30 memo: click numbers, see quote, page date, tool event; then the ledger's conflicts
  await page.getByRole("link", { name: "Open memo" }).click();
  await page.waitForTimeout(2500);
  const nums = page.getByRole("button", { pressed: false });
  if ((await nums.count()) > 1) await nums.nth(1).click();
  await page.waitForTimeout(3000);
  await page.getByRole("link", { name: "Evidence ledger" }).click();
  await page.waitForTimeout(3500);
  // 0:48 planted instruction: the agent never proposes send_email; dead end stops on NO_PROGRESS
  await run("Planted instruction");
  await page.waitForTimeout(2000);
  await run("Dead end");
  await page.waitForTimeout(2000);
  // 1:05 evals: bounded vs ablation vs naive
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Evals" }).click();
  await page.waitForTimeout(3500);
  await scroll(500);
  await page.waitForTimeout(3000);
});
