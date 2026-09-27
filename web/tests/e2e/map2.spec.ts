import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const mapEl = (page: import("@playwright/test").Page) => page.getByTestId("hero-map").locator("[role=application]");

test("basemaps (compact menu): offline Minimal/Light/Dark apply; imagery is labelled context-only", async ({ page }) => {
  await page.goto("/map?day=5");
  for (const b of ["light", "dark", "terrain", "minimal"]) {
    await page.getByTestId("basemap-trigger").click();
    await page.getByTestId(`basemap-${b}`).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(mapEl(page)).toHaveAttribute("data-basemap", b);
  }
  await expect(page).not.toHaveURL(/basemap=/);                         // minimal is the default
  await page.getByTestId("basemap-trigger").click();
  await page.getByTestId("basemap-satellite").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/basemap=satellite/);
  await expect(page.getByTestId("context-chip")).toContainText(/Satellite · context only/i);
  await page.getByTestId("basemap-trigger").click();
  await expect(page.getByTestId("basemap-note")).toContainText("Context only — not used by the model");
});

test("imagery basemap offline → truthful fallback message, evidence unaffected", async ({ page }) => {
  await page.route(/gibs\.earthdata\.nasa\.gov/, (r) => r.abort());
  await page.goto("/map?day=5&basemap=terrain");
  await expect(page.getByTestId("basemap-error")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("lens-pbust")).toHaveAttribute("aria-checked", "true");
});

test("layer drawer (closed by default): radio switching, show/hide; legend explains baseline and day", async ({ page }) => {
  await page.goto("/map?day=4");
  await expect(page.getByTestId("layer-panel")).toHaveCount(0);            // map first: drawer closed
  await page.getByTestId("layers-toggle").click();
  await expect(page.getByTestId("layer-panel")).toContainText(/Trust/i);
  await expect(page.getByTestId("layer-panel")).toContainText("Forecast change vs previous cycle");
  await expect(page.getByTestId("pbust-baseline")).toContainText("Chance this forecast busts");
  await expect(page.getByTestId("legend-day")).toContainText("Day 4 = rain day ending");
  await page.getByTestId("layer-spread").click();
  await expect(page).toHaveURL(/layer=spread/);
  await expect(page.getByTestId("lens-spread")).toHaveAttribute("aria-checked", "true");   // quick switcher in sync
  await page.getByTestId("evidence-toggle").click();
  await expect(page).toHaveURL(/ev=0/);
  await page.getByTestId("layer-regime").click();
  await expect(page.getByTestId("lens-na")).toContainText("Not available in this model version");
});

test("day scrubber D1–D10 drives map, legend, ranking and investigation together", async ({ page }) => {
  await page.goto("/map?day=5&rid=13&ptab=investigate");
  await expect(page.getByTestId("investigation")).toContainText("Day 5");
  await page.getByTestId("day-7").click();
  await expect(page).toHaveURL(/day=7/);
  await expect(page.getByTestId("day-label")).toContainText("Day 7");
  await expect(page.getByTestId("legend-day")).toContainText("Day 7");
  await expect(page.getByTestId("investigation")).toContainText("Day 7");
  await page.getByTestId("day-next").click();
  await expect(page).toHaveURL(/day=8/);
  await page.getByTestId("day-prev").click(); await page.getByTestId("day-prev").click();
  await expect(page).toHaveURL(/day=6/);
  await page.getByTestId("ptab-hotspots").click();
  await expect(page.getByTestId("hotspots")).toContainText("Risk hotspots · Day 6");
});

test("risk hotspots: ranked by existing P(bust); click focuses the map and opens the investigation", async ({ page }) => {
  await page.goto("/map?day=5");
  const first = page.getByTestId("hotspot-1");
  await expect(first).toBeVisible();
  const vals = await page.locator("[data-testid^=hotspot-] .tnum.font-semibold").allTextContents();
  const nums = vals.map((v) => Number(v.replace("%", "")));
  expect([...nums].sort((a, b) => b - a)).toEqual(nums);
  await page.waitForTimeout(1200);
  const z0 = Number(await mapEl(page).getAttribute("data-zoom"));
  await first.click();
  await expect(page).toHaveURL(/rid=\d+/);
  await expect(page.getByTestId("investigation")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(Number(await mapEl(page).getAttribute("data-zoom"))).toBeGreaterThan(z0);     // map focused the region
});

test("risk footprint: grouping listed and outlined on the map, labelled as a spatial view", async ({ page }) => {
  await page.goto("/map?day=5&layers=1");
  await expect(page.getByTestId("footprints").getByRole("button", { name: /not a detected weather event/ })).toBeVisible();
  await expect(page.getByTestId("fp-summary")).toContainText(/widespread|clustered|isolated|No subdivision/);
  await page.getByTestId("footprint-toggle").click();
  await expect(page).toHaveURL(/fp=1/);
  await expect(page.locator("[data-testid^=fp-][data-class]").first()).toBeVisible();
  await page.waitForTimeout(800);
  expect((await mapEl(page).getAttribute("data-footprint"))!.length).toBeGreaterThan(0);
});

test("table view is a synced alternative: row click selects the region", async ({ page }) => {
  await page.goto("/map?day=5");
  await page.getByTestId("table-toggle").click();
  const rows = page.locator("[data-testid^=trow-]");
  await expect(rows.first()).toBeVisible();
  for (const h of ["Region", "P(Bust)", "Forecast rain", "Spread", "Confidence", "Day"])
    await expect(page.getByTestId("map-table").locator("thead")).toContainText(h);
  await rows.first().click();
  await expect(page).toHaveURL(/rid=\d+/);
  await expect(page.getByTestId("investigation")).toBeVisible();
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
});

test("risk migration small multiples select the day", async ({ page }) => {
  await page.goto("/map?day=2");
  await page.getByTestId("migration-toggle").click();
  await expect(page.getByTestId("migration-strip")).toBeVisible();
  await page.getByTestId("mig-9").click();
  await expect(page).toHaveURL(/day=9/);
});

test("investigation panel: trajectory+momentum, cycle change, why, timeline, ensemble, analogs, open analysis", async ({ page }) => {
  await page.goto("/map?day=5&rid=13&ptab=investigate");
  const inv = page.getByTestId("investigation");
  await expect(inv.getByTestId("inv-name")).toContainText("Gangetic West Bengal");
  await expect(inv.getByTestId("momentum")).toHaveAttribute("data-momentum", /improving|stable|deteriorating/);
  await expect(inv.getByTestId("cc-verdict")).toHaveText(/TRUST (DETERIORATED|IMPROVED)|UNCHANGED|NO PREVIOUS CYCLE/);
  await expect(inv.getByTestId("cc-reason")).toContainText(/SHAP|Reason unavailable/);
  await expect(inv.getByTestId("evc-spread")).toHaveAttribute("data-available", "true");
  for (const g of ["revision", "analogs", "novelty", "regime", "state"])
    await expect(inv.getByTestId(`evc-${g}`)).toContainText("not available");
  await inv.getByText(/More detail/).click();                                // progressive disclosure
  await expect(inv.getByTestId("ev-spread")).toHaveAttribute("data-available", "true");
  await expect(inv.getByTestId("timeline")).toContainText(/P\(bust\)|Only one cycle/);
  await expect(inv.getByTestId("ensemble")).toContainText("member histogram is not available");
  await expect(inv.getByTestId("analogs-na")).toBeVisible();
  await inv.getByTestId("open-region-analysis").click();
  await expect(page).toHaveURL(/\/region\/13\?.*day=5/);
});

test("fullscreen keeps state; Esc exits without losing it; Space plays", async ({ page }) => {
  await page.goto("/map?day=6&layer=spread&basemap=dark");
  await page.getByTestId("fullscreen-toggle").click();
  await expect(page.getByTestId("map-console")).toHaveAttribute("data-fullscreen", "1");
  await expect(page.getByTestId("day-scrubber")).toBeVisible();
  await expect(page.getByTestId("lens-legend")).toBeVisible();
  await expect(page.getByTestId("lens-spread")).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());   // Space on a focused button activates it
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/day=7/, { timeout: 5000 });
  await page.keyboard.press("Space");                                       // pause
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("map-console")).toHaveAttribute("data-fullscreen", "0");
  await expect(page).toHaveURL(/layer=spread/); await expect(page).toHaveURL(/basemap=dark/);
});

test("deep link restores cycle, day, region, layer, split, basemap", async ({ page }) => {
  await page.goto("/map?init=2020-07-20T12:00&day=3&rid=8&layer=spread&split=1&basemap=light");
  await expect(page.locator("#cycle-select")).toHaveValue("2020-07-20T12:00");
  await expect(page.getByTestId("split-maps")).toBeVisible();
  await expect(page.getByTestId("day-label")).toContainText("Day 3");
  await expect(page.getByTestId("inv-name")).toContainText("Vidarbha");
  await expect(page.getByTestId("split-maps").locator("[role=application]").first()).toHaveAttribute("data-basemap", "light");
});

test("phone: map first, then risk list, then analysis — no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("/map?day=5");
  await expect(page.getByTestId("hero-map")).toBeVisible();
  const [mapY, listY] = await Promise.all([page.getByTestId("hero-map").boundingBox(), page.getByTestId("hotspots").boundingBox()]);
  expect(listY!.y).toBeGreaterThan(mapY!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});

for (const r of ["/map?day=5&basemap=dark&fp=1&rid=13", "/map?mig=1&day=3", "/map?fs=1&day=2&ptab=hotspots"]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe: ${r} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(r);
      await expect(page.getByTestId("day-scrubber")).toBeVisible();
      await page.waitForTimeout(900);
      const res = await new AxeBuilder({ page }).exclude(".maplibregl-canvas").analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
}
