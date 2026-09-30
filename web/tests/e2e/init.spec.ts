import { test, expect, type Page } from "@playwright/test";

// The shared cycle initialisation: every cycle-dependent screen resolves `init` from /cycles once,
// and a failure is shown as a named error with Retry — never an endless "Loading…".
test.use({ serviceWorkers: "block" });   // the PWA service worker would bypass page.route
const CYCLES = /\/api\/cycles(\?|$)/;
const SCREENS = ["/brief", "/matrix", "/map", "/replay", "/compare", "/watchlist"];

async function trackUndefinedInit(page: Page) {
  const bad: string[] = [];
  page.on("request", (r) => { if (/init=(undefined|null)?(&|$)/.test(r.url())) bad.push(r.url()); });
  return bad;
}

test("network/CORS failure on /cycles → 'Unable to connect' + Retry on every screen; Retry recovers", async ({ page }) => {
  await page.route(CYCLES, (r) => r.abort("failed"));
  for (const s of SCREENS) {
    await page.goto(s);
    await expect(page.getByTestId("error-state")).toContainText("Unable to connect to forecast service", { timeout: 15_000 });
    await expect(page.locator("#cycle-select")).toContainText("Cycles unavailable");
  }
  await page.goto("/brief");
  await expect(page.getByTestId("error-state")).toBeVisible({ timeout: 15_000 });
  await page.unroute(CYCLES);
  await page.getByTestId("error-state").getByRole("button", { name: /Retry/ }).click();
  await expect(page.getByTestId("brief-summary")).toBeVisible();
  expect(await page.locator("#cycle-select option").count()).toBeGreaterThan(1);
});

test("HTTP 500 and non-JSON responses are named, not hidden", async ({ page }) => {
  await page.route(CYCLES, (r) => r.fulfill({ status: 503, body: "upstream down" }));
  await page.goto("/matrix");
  await expect(page.getByTestId("error-state")).toContainText("Forecast service error (503)", { timeout: 15_000 });
  await page.unroute(CYCLES);
  await page.route(CYCLES, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }));
  await page.goto("/map");
  await expect(page.getByTestId("error-state")).toContainText("invalid response", { timeout: 15_000 });
});

test("empty cycle list → 'No forecast cycles available' with Retry", async ({ page }) => {
  await page.route(CYCLES, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("/brief");
  await expect(page.getByTestId("no-cycles")).toContainText("No forecast cycles available.");
  await expect(page.getByTestId("no-cycles").getByRole("button", { name: /Retry/ })).toBeVisible();
});

test("init resolves from /cycles: latest by default, valid ?init= honoured, unknown ?init= falls back; never init=undefined", async ({ page }) => {
  const bad = await trackUndefinedInit(page);
  const cycles = await (await page.request.get("/api/cycles")).json() as { init: string }[];
  const latest = cycles[cycles.length - 1].init;
  await page.goto("/brief");
  await expect(page.locator("#cycle-select")).toHaveValue(latest);
  await page.goto(`/matrix?init=${cycles[3].init}`);
  await expect(page.locator("#cycle-select")).toHaveValue(cycles[3].init);
  await page.goto("/map?init=1999-01-01T00:00");
  await expect(page.locator("#cycle-select")).toHaveValue(latest);
  await expect(page.getByTestId("hero-map")).toBeVisible();
  expect(bad).toEqual([]);
});
