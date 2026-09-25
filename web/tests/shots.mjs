// Dark-mode screenshots at 1440 and 768 px: node tests/shots.mjs <outdir>
import { chromium } from "@playwright/test";
const out = process.argv[2];
const base = process.env.BASE ?? "http://localhost:5173";
const R = [
  ["briefing", "/brief"],
  ["map-pbust", "/map?day=5&layer=pbust"], ["map-rain", "/map?day=5&layer=rain"], ["map-spread", "/map?day=5&layer=spread"],
  ["map-novelty", "/map?day=5&layer=novelty"], ["map-revision", "/map?day=5&layer=revision"], ["map-regime", "/map?day=5&layer=regime"],
  ["map-split", "/map?day=5&split=1"],
  ["region-overview", "/region/8?day=5&tab=overview"], ["region-why", "/region/8?day=5&tab=why"], ["region-evolution", "/region/8?day=5&tab=evolution"],
  ["timemachine-act1", "/replay?event=assam-2020-07&act=1"], ["timemachine-act2", "/replay?event=assam-2020-07&act=2"], ["timemachine-act3", "/replay?event=assam-2020-07&act=3&reveal=6"],
  ...(process.env.OPS ? [["ops", "/ops"]] : []),
];
const b = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
for (const w of [1440, 768]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: "dark" });
  if (process.env.COOKIE) await ctx.addCookies([{ name: "pn_session", value: process.env.COOKIE, url: base }]);
  const p = await ctx.newPage();
  for (const [n, r] of R) {
    await p.goto(base + r, { waitUntil: "load" });
    await p.waitForTimeout(n.startsWith("map") || n.startsWith("timemachine") ? 2500 : 1300);
    await p.screenshot({ path: `${out}/${n}-${w}.png` });
  }
  await ctx.close();
}
await b.close();
console.log("ok");
