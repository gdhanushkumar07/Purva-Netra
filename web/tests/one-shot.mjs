// node tests/one-shot.mjs <route> <out.png> [width] [dark|light]
import { chromium } from "@playwright/test";
const [route, out, w = "1440", scheme = "dark"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: Number(w), height: 900 }, colorScheme: scheme });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)));
await p.goto("http://localhost:5173" + route); await p.waitForTimeout(2500);
await p.screenshot({ path: out }); await b.close();
