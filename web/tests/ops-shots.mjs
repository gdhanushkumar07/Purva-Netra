// /ops screenshots (dark, 1440 + 768) on the NRT demo stack after one job has run.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const b = await chromium.launch({ channel: "chrome" });
for (const w of [1440, 768]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5174/login?next=/ops");
  await p.getByTestId("login-user").fill("operator"); await p.getByTestId("login-pass").fill("change-me-operator");
  await p.getByTestId("login-submit").click(); await p.waitForURL((u) => u.pathname === "/ops");
  if (w === 1440) {
    await p.getByTestId("btn-run-latest").click(); await p.getByTestId("confirm-run").click();
    await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/ops-logs-${w}.png` });
    await p.keyboard.press("Escape"); await p.waitForTimeout(20000); await p.reload();
  }
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/ops-${w}.png`, fullPage: true });
  await ctx.close();
}
await b.close(); console.log("ok");
