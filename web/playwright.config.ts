import { defineConfig } from "@playwright/test";

// Three stacks (see tests/e2e/run.sh):
//   replay  — API :8000 (REPLAY store) + web :5173
//   nrt     — scripts/nrt_demo_stack.sh: API :8001 (NRT, SYNTHETIC mock upstream) + web :5174
//   offline — same NRT stack restarted with NRT_ENABLED=false and the upstream unreachable
const channel = process.env.PW_CHANNEL ?? "chrome";
const use = { channel, viewport: { width: 1440, height: 900 }, acceptDownloads: true };
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  projects: [
    { name: "replay", testMatch: /(flows|console)\.spec\.ts/, use: { ...use, baseURL: process.env.BASE ?? "http://localhost:5173" } },
    { name: "nrt", testMatch: /ops\.spec\.ts/, use: { ...use, baseURL: "http://localhost:5174" } },
    { name: "offline", testMatch: /offline\.spec\.ts/, use: { ...use, baseURL: "http://localhost:5174" } },
  ],
});
