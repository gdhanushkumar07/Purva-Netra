// Print console errors for a route: node tests/console-debug.mjs "/region/8?day=5&tab=verify" dark
import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ colorScheme: process.argv[3] ?? "light", viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
p.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
await p.goto("http://localhost:5173" + (process.argv[2] ?? "/"));
await p.waitForTimeout(2500);
console.log("body text length:", (await p.textContent("body"))?.length);
await b.close();
