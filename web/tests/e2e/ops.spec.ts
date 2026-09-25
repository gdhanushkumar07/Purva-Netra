import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Runs against scripts/nrt_demo_stack.sh (NRT mode, SYNTHETIC mock upstream, isolated ops.db).
test.describe.configure({ mode: "serial" });

async function login(page: Page, user: string, pw: string) {
  await page.goto("/login?next=/ops");
  await page.getByTestId("login-user").fill(user);
  await page.getByTestId("login-pass").fill(pw);
  await page.getByTestId("login-submit").click();
}

test("viewer cannot see Operations (nav hidden, page refused, server 403)", async ({ page }) => {
  await login(page, "viewer", "change-me-operator");
  await page.waitForURL((u) => u.pathname === "/ops");                     // honours ?next=, then refuses
  await expect(page.getByText(/operators only/i)).toBeVisible();
  await expect(page.getByTestId("user-menu")).toBeVisible();
  await expect(page.getByTestId("nav-ops")).toHaveCount(0);
  const r = await page.request.get("/api/ops/status");
  expect(r.status()).toBe(403);
});

test("anonymous: no Operations nav, /ops asks to sign in", async ({ page }) => {
  await page.goto("/brief");
  await expect(page.getByTestId("sign-in")).toBeVisible();
  await expect(page.getByTestId("nav-ops")).toHaveCount(0);
  await page.goto("/ops");
  await expect(page.getByRole("link", { name: "sign in", exact: true })).toBeVisible();
});

test("operator: login → /ops → run latest → watch stages → view logs", async ({ page }) => {
  await login(page, "operator", "change-me-operator");
  await page.waitForURL((u) => u.pathname === "/ops");
  await expect(page.getByTestId("nav-ops")).toBeVisible();
  await expect(page.getByTestId("overall-state")).toHaveText(/Healthy|Degraded|Down/);
  // unknown is never success before anything ran
  await expect(page.getByTestId("comp-Data ingestion")).toContainText(/Unknown|OK/);
  await page.getByTestId("btn-run-latest").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("discover → fetch → validate");
  await page.getByTestId("confirm-run").click();
  const drawer = page.getByTestId("logs-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("log-lines")).toContainText("stage discover", { timeout: 20_000 });
  await expect(drawer.getByTestId("log-lines")).toContainText(/stage publish done|already published/, { timeout: 60_000 });
  await drawer.getByTestId("log-search").fill("publish");
  await expect(drawer.getByTestId("log-lines")).not.toContainText("stage fetch started");
  const [dl] = await Promise.all([page.waitForEvent("download"), drawer.getByTestId("log-download").click()]);
  expect(dl.suggestedFilename()).toMatch(/purva-netra-job-\d+\.txt/);
  await page.keyboard.press("Escape");
  await page.reload();
  for (const s of ["discover", "fetch", "validate", "extract", "features", "inference", "explain", "publish"])
    await expect(page.getByTestId(`stage-${s}`)).toHaveAttribute("data-status", /done|skipped/);
  await expect(page.getByTestId("mode-badge")).toHaveText("NEAR-REAL-TIME");
  await expect(page.getByTestId("data-age")).toContainText("MOCK UPSTREAM");
  await expect(page.getByTestId("jobs-table")).toContainText("operator");
});

test("second run while one is running is refused (409) and the button disables", async ({ page }) => {
  await login(page, "operator", "change-me-operator");
  await page.waitForURL((u) => u.pathname === "/ops");
  // POST from the browser itself (same-origin, SameSite=Strict session cookie), as the UI does
  const [a, b] = await page.evaluate(async () => {
    const go = async () => { const r = await fetch("/api/ops/run-latest?force=true", { method: "POST", credentials: "same-origin" }); return { status: r.status, body: await r.json() }; };
    const first = await go();
    const second = await go();
    return [first, second];
  });
  expect(a.status).toBe(202);
  expect(b.status).toBe(409);
  expect(b.body.running_job).toBe(a.body.job_id);
  await page.reload();
  await expect(page.getByTestId("btn-run-latest")).toBeDisabled();          // disabled while the job runs
  await expect(page.getByTestId("panel-controls")).toContainText(/is running/);
});

test("axe: /ops and /login have no serious issues (dark + light)", async ({ page }) => {
  await login(page, "operator", "change-me-operator");
  await page.waitForURL((u) => u.pathname === "/ops");
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const r of ["/ops", "/brief", "/map"]) {
      await page.goto(r);
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForTimeout(800);
      const res = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${r} ${scheme} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    }
  }
});
