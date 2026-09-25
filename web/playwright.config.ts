import { defineConfig } from "@playwright/test";

// Expects the API on :8000 and the built app on :5173 (`npm run preview` or docker compose up).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE ?? "http://localhost:5173",
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  reporter: [["list"]],
});
