// Map 2.0 screenshots (dark; 1440 / 768 / 390): node tests/map2-shots.mjs ../docs/screens/map2
import { chromium } from "@playwright/test";
const out = process.argv[2];
const R = [
  ["console-investigate", "/map?day=5&rid=13&ptab=investigate&basemap=dark&fp=1"],
  ["hotspots-footprint", "/map?day=5&fp=1&basemap=light"],
  ["satellite", "/map?day=5&basemap=satellite"],
  ["terrain-spread", "/map?day=5&basemap=terrain&layer=spread"],
  ["migration", "/map?day=7&mig=1&layers=0"],
  ["split", "/map?day=5&split=1&rid=8"],
  ["fullscreen", "/map?day=6&fs=1&ptab=hotspots"],
];
const b = await chromium.launch({ channel: "chrome" });
for (const w of [1440, 768, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: "dark", isMobile: w === 390 });
  const p = await ctx.newPage();
  for (const [n, r] of w === 1440 ? R : R.slice(0, 2)) {
    await p.goto("http://localhost:5173" + r); await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${n}-${w}.png`, fullPage: w === 390 });
  }
  await ctx.close();
}
await b.close(); console.log("ok");
