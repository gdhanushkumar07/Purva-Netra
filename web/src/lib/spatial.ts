// Display-only spatial / temporal helpers for the Map. Everything here re-arranges EXISTING model
// outputs (P(bust), confidence band, previous-cycle P(bust), per-cycle revision data). No new scores,
// no meteorological event detection. Every threshold is stated in RULES and shown in the UI.
import type { Cell, RevRow } from "@/api/client";

export const RULES = {
  /** Elevated trust risk = the model's own confidence band is Reduced or Low (P(bust) ≥ 15%). */
  elevatedBands: ["Reduced", "Low"] as const,
  /** Footprint class by number of connected (boundary-sharing) elevated subdivisions. */
  footprint: { isolated: 1, clusteredMax: 4 },          // 1 → isolated · 2–4 → clustered · ≥5 → widespread
  /** Momentum over Day 1→10: least-squares slope of P(bust) in percentage points per lead day. */
  momentumPtsPerDay: 0.5,
  /** Cycle change smaller than this (percentage points) is reported as "unchanged". */
  cycleUnchangedPts: 0.5,
  /** Revision reported as significant above this |Δ log1p(rain)| (same fixed threshold as the reason rule). */
  revisionLogUnits: 0.4,
};

export const isElevated = (c?: Cell) => !!c && c.p_bust != null && (RULES.elevatedBands as readonly string[]).includes(c.confidence);

/** Highest existing P(bust) first; ties broken by the heavy-rain flag. Unassessed regions excluded. */
export function hotspots(dayCells: Cell[], n = 10): Cell[] {
  return dayCells.filter((c) => c.p_bust != null)
    .sort((a, b) => (b.p_bust! - a.p_bust!) || (Number(!!b.hi_risk) - Number(!!a.hi_risk)))
    .slice(0, n);
}

export type FootprintClass = "isolated" | "clustered" | "widespread";
export interface Footprint { id: number; rids: number[]; cls: FootprintClass; maxP: number }

/** Connected components of elevated subdivisions over the shared-boundary graph (display grouping only). */
export function footprints(dayCells: Cell[], adjacency: Record<string, number[]>): Footprint[] {
  const elevated = new Map(dayCells.filter(isElevated).map((c) => [c.rid, c]));
  const seen = new Set<number>();
  const out: Footprint[] = [];
  for (const rid of [...elevated.keys()].sort((a, b) => a - b)) {
    if (seen.has(rid)) continue;
    const comp: number[] = [];
    const stack = [rid];
    seen.add(rid);
    while (stack.length) {
      const r = stack.pop()!;
      comp.push(r);
      for (const nb of adjacency[String(r)] ?? []) if (elevated.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    const k = comp.length;
    out.push({ id: 0, rids: comp.sort((a, b) => a - b), maxP: Math.max(...comp.map((r) => elevated.get(r)!.p_bust!)),
      cls: k <= RULES.footprint.isolated ? "isolated" : k <= RULES.footprint.clusteredMax ? "clustered" : "widespread" });
  }
  out.sort((a, b) => b.rids.length - a.rids.length || b.maxP - a.maxP);
  out.forEach((f, i) => (f.id = i + 1));
  return out;
}

export type Momentum = "improving" | "stable" | "deteriorating";
/** Least-squares slope (pts/day) of P(bust) against lead day. Rising P(bust) = trust deteriorating. */
export function momentum(traj: (number | null)[]): { m: Momentum; slopePtsPerDay: number | null } {
  const pts = traj.map((p, i) => [i + 1, p] as const).filter((x): x is readonly [number, number] => x[1] != null);
  if (pts.length < 3) return { m: "stable", slopePtsPerDay: null };
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const slope = (sxy / sxx) * 100;
  const m: Momentum = slope > RULES.momentumPtsPerDay ? "deteriorating" : slope < -RULES.momentumPtsPerDay ? "improving" : "stable";
  return { m, slopePtsPerDay: slope };
}

export type CycleVerdict = "deteriorated" | "improved" | "unchanged" | "unavailable";
export function cycleVerdict(cur?: number | null, prev?: number | null): { v: CycleVerdict; deltaPts: number | null } {
  if (cur == null || prev == null) return { v: "unavailable", deltaPts: null };
  const d = (cur - prev) * 100;
  return { v: Math.abs(d) < RULES.cycleUnchangedPts ? "unchanged" : d > 0 ? "deteriorated" : "improved", deltaPts: d };
}

/** Facts between consecutive cycles for one valid date (template text, existing values only). */
export interface TimelineStep { init: string; lead: number; p: number | null; f_rain: number; spread: number | null;
  changes: string[]; dP: number | null }
export function evidenceTimeline(rows: RevRow[]): TimelineStep[] {
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const changes: string[] = [];
    if (prev) {
      const dmm = r.f_rain - prev.f_rain;
      const dlog = Math.abs(Math.log1p(r.f_rain) - Math.log1p(prev.f_rain));
      changes.push(`forecast rain ${dmm >= 0 ? "+" : "−"}${Math.abs(dmm).toFixed(1)} mm (${prev.f_rain.toFixed(1)} → ${r.f_rain.toFixed(1)})${dlog > RULES.revisionLogUnits ? " — revision above threshold" : ""}`);
      if (r.spread_anom != null && prev.spread_anom != null && Math.abs(r.spread_anom - prev.spread_anom) >= 0.05)
        changes.push(`ensemble spread ${r.spread_anom > prev.spread_anom ? "increased" : "decreased"} (${prev.spread_anom.toFixed(2)}× → ${r.spread_anom.toFixed(2)}× normal)`);
    }
    return { init: r.init, lead: r.lead, p: r.p_bust, f_rain: r.f_rain, spread: r.spread_anom ?? null, changes,
      dP: prev && r.p_bust != null && prev.p_bust != null ? r.p_bust - prev.p_bust : null };
  });
}

/** Equirectangular projection of lon/lat rings to SVG path strings (small multiples; cos-lat scaled). */
type Ring = number[][];
export interface GeoFeature { properties: { rid: number; name: string }; geometry: { type: string; coordinates: unknown } }
export function projectPaths(features: GeoFeature[], w: number, h: number, bbox = [67.5, 6, 98, 37.5]) {
  const [x0, y0, x1, y1] = bbox;
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  const sx = w / ((x1 - x0) * k), sy = h / (y1 - y0), s = Math.min(sx, sy);
  const ox = (w - (x1 - x0) * k * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  const P = (p: number[]) => `${(ox + (p[0] - x0) * k * s).toFixed(1)},${(oy + (y1 - p[1]) * s).toFixed(1)}`;
  const ring = (r: Ring) => `M${r.map(P).join("L")}Z`;
  const out = new Map<number, string>();
  for (const f of features) {
    const g = f.geometry;
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    out.set(f.properties.rid, polys.map((poly) => poly.map(ring).join("")).join(""));
  }
  return out;
}
