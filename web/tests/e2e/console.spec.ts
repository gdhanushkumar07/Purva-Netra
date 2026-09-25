import { test, expect, type Page } from "@playwright/test";

/** Time (ms, measured in the page) from an action to a DOM condition becoming true. */
async function timeIt(page: Page, action: string, until: string) {
  return page.evaluate(async ([a, u]) => {
    const t0 = performance.now();
    // eslint-disable-next-line no-new-func
    new Function(a)();
    // eslint-disable-next-line no-new-func
    const ok = new Function(`return (${u})`);
    while (!ok()) {
      if (performance.now() - t0 > 5000) return Infinity;       // fail, don't hang
      await new Promise((r) => requestAnimationFrame(r));
    }
    return performance.now() - t0;
  }, [action, until]);
}

test("Trust Lens: every layer switches, has a legend with units, regime says Not available", async ({ page }) => {
  await page.goto("/map?day=5");
  await expect(page.getByTestId("hero-map")).toBeVisible();
  for (const [id, label] of [["rain", "Forecast Rain"], ["spread", "Ensemble Spread"], ["novelty", "Novelty"], ["revision", "Revision"], ["pbust", "P(Bust)"]]) {
    await page.getByTestId(`lens-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`layer=${id}`));
    await expect(page.getByTestId("lens-legend")).toContainText(label);
  }
  await page.getByTestId("lens-regime").click();
  await expect(page.getByTestId("lens-na")).toHaveText(/Not available in this model version/);
  await expect(page.getByTestId("regime-na")).toBeVisible();
  // novelty has no analog memory in the shipped model → also "Not available"
  await page.getByTestId("lens-novelty").click();
  await expect(page.getByTestId("lens-na")).toBeVisible();
});

test("performance: lens switch < 100 ms, day change < 50 ms, cycle switch < 300 ms", async ({ page }) => {
  await page.goto("/map?day=5&layer=pbust");
  await expect(page.getByTestId("lens-legend")).toContainText("P(Bust)");
  const lens = await timeIt(page, `document.querySelector('[data-testid=lens-rain]').click()`,
    `document.querySelector('[data-testid=lens-legend]')?.textContent.includes('Forecast Rain')`);
  const day = await timeIt(page, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`,
    `document.querySelector('[data-testid=day-label]')?.textContent.includes('Day 6')`);
  await page.goto("/brief");
  await expect(page.getByTestId("brief-summary")).toBeVisible();
  const before = await page.locator("#cycle-select").inputValue();
  const cycle = await timeIt(page, `document.querySelector('[aria-label="Previous cycle"]').click()`,
    `document.querySelector('#cycle-select').value !== ${JSON.stringify(before)} && !document.querySelector('[role=status]')?.textContent.includes('Loading')
     && document.querySelector('main h1')?.textContent.length > 0`);
  console.log(`perf: lens ${lens.toFixed(1)} ms · day ${day.toFixed(1)} ms · cycle ${cycle.toFixed(1)} ms`);
  expect(lens).toBeLessThan(100);
  expect(day).toBeLessThan(50);
  expect(cycle).toBeLessThan(300);
});

test("map: ←/→ keys change the day and the Low-confidence sparkline is shown", async ({ page }) => {
  await page.goto("/map?day=3");
  await expect(page.getByTestId("low-sparkline")).toBeVisible();
  await page.locator("body").press("ArrowRight");
  await expect(page).toHaveURL(/day=4/);
  await page.locator("body").press("ArrowLeft");
  await page.locator("body").press("ArrowLeft");
  await expect(page).toHaveURL(/day=2/);
});

test("map: click a region → trust popover → Open analysis", async ({ page }) => {
  await page.goto("/map?day=5&layer=pbust");
  const map = page.getByTestId("hero-map").locator("canvas");
  await expect(map).toBeVisible();
  await page.waitForTimeout(1500);
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.47, box.y + box.height * 0.5);   // central India
  const pop = page.getByTestId("region-popover");
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(/Day 5/);
  await expect(pop.getByTestId("popover-change")).toBeVisible();
  await expect(page).toHaveURL(/rid=\d+/);
  await pop.getByTestId("open-analysis").click();
  await expect(page).toHaveURL(/\/region\/\d+\?.*day=5/);
  await expect(page.getByTestId("region-header")).toBeVisible();
});

test("split map: Forecast Rain | P(Bust), zoom and day stay in sync", async ({ page }) => {
  await page.goto("/map?day=5");
  await page.getByTestId("split-toggle").click();
  await expect(page).toHaveURL(/split=1/);
  const maps = page.getByTestId("split-maps").locator("[role=application]");
  await expect(maps).toHaveCount(2);
  await page.waitForTimeout(1500);
  await maps.nth(0).locator(".maplibregl-ctrl-zoom-in").click();
  await page.waitForTimeout(1200);
  const z0 = await maps.nth(0).getAttribute("data-zoom");
  const z1 = await maps.nth(1).getAttribute("data-zoom");
  expect(z0).not.toBeNull();
  expect(Math.abs(Number(z0) - Number(z1))).toBeLessThan(0.01);
  await page.locator("body").press("ArrowRight");
  await expect(page).toHaveURL(/day=6/);
});

test("region header strip + Day 1–10 trust strip + Forecast DNA", async ({ page }) => {
  await page.goto("/region/8?day=5&tab=overview");
  const h = page.getByTestId("region-header");
  await expect(h).toContainText("Vidarbha");
  await expect(h.getByTestId("hdr-pbust")).toContainText("%");
  await expect(h.getByTestId("hdr-change")).toBeVisible();
  await expect(h.getByTestId("hdr-spread")).toContainText("×");
  await expect(h.getByTestId("hdr-novelty")).toContainText(/n\/a/);
  await expect(page).toHaveURL(/init=/);              // cycle pinned: a new NRT cycle cannot swap data mid-analysis
  await page.getByTestId("strip-7").click();
  await expect(page).toHaveURL(/day=7/);
  await expect(page.getByTestId("strip-7")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("dna-spread")).toHaveAttribute("data-available", "true");
  for (const g of ["revision", "analogs", "novelty", "regime", "state"])
    await expect(page.getByTestId(`dna-${g}`)).toHaveAttribute("data-available", "false");
  await page.getByTestId("tab-why").click();
  await expect(page.getByTestId("dna")).toBeVisible();
});

test("Evolution tab answers the four questions with stacked charts", async ({ page }) => {
  await page.goto("/region/8?day=5&tab=evolution");
  const e = page.getByTestId("evolution");
  await expect(e.getByTestId("evo-summary")).toContainText(/Since the previous cycle|Only one cycle/);
  await expect(e.getByTestId("sig-flag")).toContainText(/Significant change/);
  for (const q of ["What changed?", "How much did P(bust) change?", "Did spread increase?"])
    await expect(e.getByText(q, { exact: false }).first()).toBeVisible();
  await e.getByRole("button", { name: /Table view/ }).first().click();
  await expect(e.locator("table").first()).toBeVisible();
});

test("Time Machine: three acts, progress rail, step to Day 10, ticker vs spread baseline", async ({ page }) => {
  await page.goto("/replay?event=assam-2020-07");
  await expect(page.getByTestId("demo-badge")).toContainText("REPLAY");
  await expect(page.getByTestId("act1")).toBeVisible();
  await page.getByTestId("act-2").click();
  await expect(page.getByTestId("act2")).toBeVisible();
  await expect(page.getByTestId("evolution")).toBeVisible();
  await page.getByTestId("act-3").click();
  await expect(page.getByTestId("act3")).toBeVisible();
  for (let d = 0; d < 10; d++) await page.getByTestId("advance").click();
  await expect(page).toHaveURL(/reveal=10/);
  await expect(page.getByTestId("reveal-label")).toContainText("Day 10");
  await expect(page.getByTestId("ticker")).toContainText(/Brier/);
  await expect(page.getByTestId("ticker")).toContainText(/Spread baseline/);
  await expect(page.getByTestId("truth-map")).toHaveCSS("opacity", "1");
});

test.describe("with a mocked API", () => {
// page.route cannot see requests answered by the PWA service worker → block it for mocked tests
test.use({ serviceWorkers: "block" });
test("NRT new-cycle toast (mocked API): pinned view offers Switch, never swaps silently", async ({ page }) => {
  let last = "2020-07-31 00:00:00";
  await page.route("**/api/health", async (route) => {          // register routes before installing the clock
    const j = await (await route.fetch()).json();
    await route.fulfill({ json: { ...j, mode: "NEAR-REAL-TIME", last_cycle: last, data_age_h: 3.2, freshness: "fresh",
      last_update: "2026-09-25T06:00:00Z", source: "mock", upstream: { status: "reachable", checked_at: "2026-09-25T06:00:00Z", init: last } },
      headers: { "cache-control": "no-store" } });
  });
  await page.clock.install();
  await page.goto("/region/8?day=5&init=2020-07-31T00:00");
  await expect(page.getByTestId("mode-badge")).toHaveText("NEAR-REAL-TIME");
  await expect(page.getByTestId("data-age")).toContainText("age 3.2 h");
  last = "2020-07-31 12:00:00";
  await page.clock.runFor(61_000);                    // health polls every 60 s
  const toast = page.getByText(/New cycle 12 UTC 31 Jul 2020 available/);
  await expect(toast).toBeVisible();
  await expect(page).toHaveURL(/init=2020-07-31T00(:|%3A)00/);   // not swapped silently
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page).toHaveURL(/init=2020-07-31T12(:|%3A)00/);
});
});
