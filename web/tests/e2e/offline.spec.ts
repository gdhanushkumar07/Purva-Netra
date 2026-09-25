import { test, expect } from "@playwright/test";

// Runs against the NRT stack restarted with NRT_ENABLED=false and the upstream unreachable
// (tests/e2e/run.sh). Every non-localhost request from the browser is blocked (no network).
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
});

test("offline: app loads and says NRT disabled / nothing published, without crashing", async ({ page }) => {
  await page.goto("/brief");
  await expect(page.getByTestId("mode-badge")).toHaveText("NEAR-REAL-TIME");
  await expect(page.getByTestId("stale-banner")).toContainText(/No NRT cycle has been published yet/);
  await expect(page.getByTestId("screen-error")).toHaveCount(0);
});

test("offline: /ops loads with NRT disabled and upstream unreachable / unknown", async ({ page }) => {
  await page.goto("/login?next=/ops");
  await page.getByTestId("login-user").fill("operator");
  await page.getByTestId("login-pass").fill("change-me-operator");
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => u.pathname === "/ops");
  await expect(page.getByTestId("overall")).toContainText("NRT disabled");
  await expect(page.getByTestId("controls-reason")).toContainText(/NRT disabled/);
  await expect(page.getByTestId("btn-run-latest")).toBeDisabled();
  await expect(page.getByTestId("upstream-status")).toHaveText(/Upstream unreachable|Unknown|Disabled/);
  const r = await page.request.post("/api/ops/run-latest");
  expect(r.status()).toBe(409);
});
