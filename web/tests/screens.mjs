// Screenshot every route in light and dark (node tests/screens.mjs [outdir]).
import { chromium } from "@playwright/test";
const out = process.argv[2] ?? "../docs/screens";
const base = process.env.BASE ?? "http://localhost:5173";
const routes = [
  ["brief", "/brief"], ["matrix", "/matrix"], ["map", "/map?day=5"], ["map-split", "/map?day=5&split=1"],
  ["region-overview", "/region/8?day=5&tab=overview"], ["region-why", "/region/8?day=5&tab=why"],
  ["region-evolution", "/region/8?day=5&tab=evolution"], ["region-verify", "/region/8?day=5&tab=verify"],
  ["replay", "/replay?reveal=4"], ["compare", "/compare"], ["ledger", "/ledger"], ["method", "/method"], ["settings", "/settings"],
];
const b = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const p = await ctx.newPage();
  for (const [name, r] of routes) {
    await p.goto(base + r, { waitUntil: "load" });
    await p.waitForTimeout(name.startsWith("map") || name === "replay" ? 2500 : 1200);
    await p.screenshot({ path: `${out}/${name}-${theme}.png`, fullPage: false });
  }
  await ctx.close();
}
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true });
const pp = await ph.newPage();
await pp.goto(base + "/brief", { waitUntil: "load" });
await pp.screenshot({ path: `${out}/phone-brief.png` });
await pp.goto(base + "/matrix", { waitUntil: "load" }); await pp.waitForTimeout(1500);
await pp.screenshot({ path: `${out}/phone-matrix.png` });
await b.close();
console.log("ok");
