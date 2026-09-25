import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

// The router registers its navigate() here so tour steps can change screens (spec §18 run-sheet).
let navigate: ((to: string) => void) | null = null;
export const registerNavigate = (f: (to: string) => void) => { navigate = f; };

const qs = () => {
  const p = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of ["init"]) { const v = p.get(k); if (v) keep.set(k, v); }
  return keep.toString() ? `?${keep}` : "";
};
const waitFor = (sel: string, ms = 4000) =>
  new Promise<void>((res) => {
    const t0 = Date.now();
    const tick = () => (document.querySelector(sel) || Date.now() - t0 > ms ? res() : setTimeout(tick, 100));
    tick();
  });

type Step = DriveStep & { route?: string };
const STEPS: Step[] = [
  { route: "/method", element: "[data-tour=method-hero]", popover: { title: "1 · The question", description: "Forecasts sometimes bust. NCMRWF asked: can we know before — which region, which day?" } },
  { route: "/brief", element: "[data-tour=brief-tiles]", popover: { title: "2 · Morning briefing", description: "What a duty forecaster sees first: regions at Low confidence, heavy-rain risk, the most uncertain day." } },
  { route: "/brief", element: "[data-tour=mode]", popover: { title: "Mode badge", description: "Always visible. REPLAY means precomputed history — never presented as live." } },
  { route: "/matrix", element: "[data-tour=matrix]", popover: { title: "3 · Reliability matrix", description: "36 subdivisions × Day 1–10. Blue = more trustworthy than usual, grey ≈ normal, red = less." } },
  { route: "/map", element: "[data-tour=scrubber]", popover: { title: "4 · Day scrubber", description: "Press play: watch where risk travels across Day 1 → 10." } },
  { route: "/region/8?tab=why&day=5", element: "[data-tour=why]", popover: { title: "5 · Why", description: "Up to three reasons from fixed templates, ranked for this cell — plus the most similar past forecasts." } },
  { route: "/replay", element: "[data-tour=replay]", popover: { title: "6 · Time Machine", description: "Rewind to an issue time, advance day by day, and watch truth arrive with a running score." } },
  { route: "/ledger", element: "[data-tour=ledger]", popover: { title: "7 · Trust Ledger", description: "The tool's own track record on held-out years — or an honest 'not yet'." } },
  { route: "/method", element: "[data-tour=limits]", popover: { title: "8 · Limitations", description: "IFS not NCUM, five seasons, 3-h offset, land-only truth — and the path to NEPS-G." } },
];

export function startTour() {
  const d = driver({
    showProgress: true,
    allowClose: true,
    steps: STEPS.map(({ route: _r, ...s }) => s),
    onNextClick: async () => { await go(d.getActiveIndex()! + 1); },
    onPrevClick: async () => { await go(d.getActiveIndex()! - 1); },
  });
  const go = async (i: number) => {
    if (i < 0) return;
    if (i >= STEPS.length) { d.destroy(); return; }
    const r = STEPS[i].route;
    if (r && navigate) {
      const [path, q] = r.split("?");
      const base = qs();
      const joined = q ? (base ? `${base}&${q}` : `?${q}`) : base;
      if (window.location.pathname + window.location.search !== path + joined) navigate(path + joined);
      await waitFor(STEPS[i].element as string);
    }
    d.drive(i);
  };
  void go(0);
}
