// Print axe colour-contrast details for one route: node tests/axe-debug.mjs /compare [light|dark]
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const route = process.argv[2] ?? "/compare";
const scheme = process.argv[3] ?? "light";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173" + route);
await p.waitForTimeout(1500);
const r = await new AxeBuilder({ page: p }).withRules(["color-contrast"]).analyze();
for (const v of r.violations) for (const n of v.nodes.slice(0, 5)) console.log(n.target.join(" "), "|", n.any[0]?.message);
await b.close();
