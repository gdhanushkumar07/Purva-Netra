import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/brief", "/matrix", "/map", "/map?layer=revision&day=4&rid=8", "/map?split=1", "/region/8?day=5&tab=overview",
  "/region/8?day=5&tab=why", "/region/8?day=5&tab=evolution", "/region/8?day=5&tab=verify", "/replay", "/replay?act=2",
  "/replay?act=3&reveal=5", "/compare", "/ledger", "/watchlist", "/method", "/settings", "/ops", "/login"];

test("every screen renders content without errors, with the REPLAY badge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.getByTestId("mode-badge")).toHaveText("REPLAY");
    await expect(page.locator("main h1, main [role=alert], main .text-center").first()).toBeAttached();
    await expect(page.getByTestId("screen-error")).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /could not/i })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("verify tab shows truth and nwpeval contingency scores", async ({ page }) => {
  await page.goto("/region/8?day=5&tab=verify");
  await expect(page.getByText(/Heavy-rain contingency scores/)).toBeVisible();
  await expect(page.getByText("IMD observed")).toBeVisible();
});

test("briefing → matrix → region → why → export", async ({ page }) => {
  await page.goto("/brief");
  await expect(page.getByTestId("brief-summary")).toBeVisible();
  await page.getByRole("link", { name: /open matrix/i }).click();
  await expect(page).toHaveURL(/\/matrix/);
  const cell = page.getByTestId("cell-8-5");
  await cell.click();
  await expect(page).toHaveURL(/\/region\/8\?.*day=5/);
  await page.getByTestId("tab-why").click();
  await expect(page).toHaveURL(/tab=why/);
  await expect(page.locator("[data-tour=why]")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/purva-netra-.*\.png$/);
});

test("matrix keyboard navigation opens a cell with Enter", async ({ page }) => {
  await page.goto("/matrix");
  const first = page.locator("[data-cell='0-0']");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/region\/\d+\?.*day=3/);
});

test("view state lives in the URL (shareable link restores the view)", async ({ page }) => {
  await page.goto("/map?day=7&layer=rain&rid=8");
  await expect(page.getByTestId("day-label")).toContainText("Day 7");
  await expect(page.getByTestId("lens-rain")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("region-popover")).toContainText("Vidarbha");
});

test("full replay: advance Day 1→10 with truth reveal and score ticker", async ({ page }) => {
  await page.goto("/replay");
  const picker = page.getByTestId("event-picker");
  const opt = await picker.locator("option:not([disabled])").first().getAttribute("value");
  await picker.selectOption(opt!);
  await expect(page.getByTestId("replay-banner")).toContainText("REPLAY");
  for (let d = 1; d <= 10; d++) await page.getByTestId("advance").click();
  await expect(page).toHaveURL(/reveal=10/);
  await expect(page.getByTestId("ticker")).toContainText(/Brier/);
  await expect(page.getByTestId("advance")).toBeDisabled();
  await expect(page.getByTestId("act3")).toBeVisible();
});

for (const r of ROUTES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe: no serious/critical issues on ${r} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(r);
      await expect(page.locator("main h1, main p, main [role=alert]").first()).toBeVisible();   // never audit a blank page
      await page.waitForTimeout(800);
      const res = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
}
