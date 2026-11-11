import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3030;

// Tests run against a production build that reads a fresh copy of the committed data in e2e/.data,
// with its own empty state folder. No API key: sample runs replay the committed cache.
// Set E2E_BASE_URL to test a server that is already running.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}` },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node scripts/e2e-data.mjs && pnpm build && pnpm start`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: { RP_DATA_DIR: path.resolve("e2e/.data"), RP_STATE_DIR: path.resolve("e2e/.data/var"), OPENAI_API_KEY: "" },
      },
});
