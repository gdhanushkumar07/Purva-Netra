import { describe, expect, it } from "vitest";
import { hotspots, footprints, momentum, cycleVerdict, evidenceTimeline, projectPaths, isElevated, RULES } from "@/lib/spatial";
import { BASEMAPS, basemapOf } from "@/components/map/basemaps";
import type { Cell, RevRow } from "@/api/client";

const cell = (rid: number, p: number | null, confidence: string, extra: Partial<Cell> = {}) =>
  ({ rid, lead: 5, p_bust: p, confidence, hi_risk: false, ...extra }) as unknown as Cell;

describe("hotspots use the existing P(bust) ranking only", () => {
  it("sorts by P(bust), breaks ties by heavy-rain flag, drops unassessed", () => {
    const h = hotspots([cell(1, 0.2, "Reduced"), cell(2, 0.3, "Low"), cell(3, null, "Not assessed"), cell(4, 0.2, "Reduced", { hi_risk: true })]);
    expect(h.map((c) => c.rid)).toEqual([2, 4, 1]);
  });
});

describe("risk footprint = connected elevated subdivisions (display grouping)", () => {
  const adj = { "1": [2], "2": [1, 3], "3": [2], "4": [5], "5": [4], "6": [], "7": [8], "8": [7, 9], "9": [8, 10], "10": [9, 11], "11": [10] };
  it("groups by shared boundary and classifies isolated / clustered / widespread", () => {
    const cells = [cell(1, 0.2, "Reduced"), cell(2, 0.35, "Low"), cell(3, 0.05, "Normal"), cell(4, 0.2, "Reduced"),
      cell(6, 0.16, "Reduced"), ...[7, 8, 9, 10, 11].map((r) => cell(r, 0.2, "Reduced"))];
    const f = footprints(cells, adj);
    const byFirst = new Map(f.map((x) => [x.rids[0], x]));
    expect(byFirst.get(7)!.cls).toBe("widespread");       // 7–11 connected (5)
    expect(byFirst.get(1)!.rids).toEqual([1, 2]);          // 3 is Normal → not part of it
    expect(byFirst.get(1)!.cls).toBe("clustered");
    expect(byFirst.get(4)!.cls).toBe("isolated");          // 5 missing → alone
    expect(byFirst.get(6)!.cls).toBe("isolated");
    expect(f[0].id).toBe(1); expect(f[0].rids.length).toBe(5);
  });
  it("elevated means the model's own Reduced/Low bands", () => {
    expect(RULES.elevatedBands).toEqual(["Reduced", "Low"]);
    expect(isElevated(cell(1, 0.4, "Low"))).toBe(true);
    expect(isElevated(cell(1, 0.1, "Normal"))).toBe(false);
    expect(isElevated(cell(1, null, "Not assessed"))).toBe(false);
  });
});

describe("confidence momentum is a documented slope rule over the existing trajectory", () => {
  it("rising P(bust) with lead = deteriorating; falling = improving; flat = stable", () => {
    expect(momentum([0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17, 0.19, 0.21, 0.23]).m).toBe("deteriorating");   // +2 pts/day
    expect(momentum([0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16, 0.14, 0.12]).m).toBe("improving");
    expect(momentum([0.1, 0.101, 0.099, 0.1, 0.102, 0.1, 0.1, 0.101, 0.1, 0.1]).m).toBe("stable");
    const r = momentum([0.05, null, 0.09, null, 0.13, null, 0.17, null, 0.21, null]);
    expect(r.slopePtsPerDay).toBeCloseTo(2, 5);
    expect(momentum([0.1, null, null, null, null, null, null, null, null, 0.2]).slopePtsPerDay).toBeNull();   // < 3 points
  });
});

describe("cycle verdict comes from the sign of the change only", () => {
  it("maps the change to deteriorated / improved / unchanged / unavailable", () => {
    expect(cycleVerdict(0.31, 0.18)).toEqual({ v: "deteriorated", deltaPts: expect.closeTo(13, 6) });
    expect(cycleVerdict(0.18, 0.31).v).toBe("improved");
    expect(cycleVerdict(0.2, 0.198).v).toBe("unchanged");
    expect(cycleVerdict(0.2, null).v).toBe("unavailable");
  });
});

describe("evidence timeline states facts between consecutive cycles", () => {
  it("reports rain revision (with threshold flag) and spread change, never invents", () => {
    const rows = [
      { init: "2020-07-01T00:00", lead: 5, f_rain: 5, ens_mean: 5, ens_q10: 1, ens_q90: 9, p_bust: 0.1, rev12: null, ffi4: null, spread_anom: 1.0 },
      { init: "2020-07-01T12:00", lead: 5, f_rain: 20, ens_mean: 18, ens_q10: 5, ens_q90: 30, p_bust: 0.2, rev12: 1.3, ffi4: null, spread_anom: 1.6 },
    ] as RevRow[];
    const t = evidenceTimeline(rows);
    expect(t[0].changes).toEqual([]);
    expect(t[1].changes[0]).toContain("+15.0 mm");
    expect(t[1].changes[0]).toContain("revision above threshold");
    expect(t[1].changes[1]).toContain("increased (1.00× → 1.60× normal)");
    expect(t[1].dP).toBeCloseTo(0.1);
  });
});

describe("basemaps are context only", () => {
  it("offline basemaps need no network; imagery basemaps declare network + context-only note + attribution", () => {
    for (const b of BASEMAPS.filter((x) => !x.network)) expect(b.tiles).toBeUndefined();
    for (const b of BASEMAPS.filter((x) => x.network)) {
      expect(b.note).toMatch(/Context only — not used by the model/);
      expect(b.attribution).toMatch(/NASA/);
      expect(b.tiles).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov\//);
    }
    expect(basemapOf("nonsense").id).toBe("minimal");
  });
});

describe("small-multiple projection", () => {
  it("projects polygons inside the viewbox", () => {
    const f = [{ properties: { rid: 1, name: "x" }, geometry: { type: "Polygon", coordinates: [[[70, 10], [80, 10], [80, 20], [70, 10]]] } }];
    const p = projectPaths(f, 100, 100).get(1)!;
    const nums = p.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.every((n) => n >= 0 && n <= 100)).toBe(true);
    expect(p.startsWith("M") && p.endsWith("Z")).toBe(true);
  });
});
