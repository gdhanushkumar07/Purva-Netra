import { useEffect, useMemo, useState } from "react";
import type { Cell } from "@/api/client";
import { pbustColor, type Theme } from "@/theme/scales";
import { projectPaths, type GeoFeature } from "@/lib/spatial";
import { cn } from "@/lib/utils";

let featCache: GeoFeature[] | null = null;
async function loadFeatures() {
  if (!featCache) featCache = (await (await fetch("/geo/imd_subdivisions.geojson")).json()).features as GeoFeature[];
  return featCache;
}

/** Risk migration: the existing P(bust) for Day 1…10 as small multiples (lightweight SVG, one projection). */
export function MigrationStrip({ cells, day, onDay, theme }: { cells: Cell[]; day: number; onDay: (d: number) => void; theme: Theme }) {
  const [feats, setFeats] = useState<GeoFeature[] | null>(featCache);
  useEffect(() => { if (!feats) void loadFeatures().then(setFeats); }, [feats]);
  const W = 96, H = 100;
  const paths = useMemo(() => (feats ? projectPaths(feats, W, H) : null), [feats]);
  const byDay = useMemo(() => {
    const m = new Map<number, Map<number, Cell>>();
    for (const c of cells) { if (!m.has(c.lead)) m.set(c.lead, new Map()); m.get(c.lead)!.set(c.rid, c); }
    return m;
  }, [cells]);
  if (!paths) return null;
  const na = theme === "dark" ? "#262625" : "#e8e7e1";
  const stroke = theme === "dark" ? "#1a1a19" : "#fcfcfb";
  return (
    <section className="panel" aria-label="Risk migration Day 1 to 10" data-testid="migration-strip">
      <div className="panel-sec flex items-baseline justify-between">
        <h3 className="panel-title">Risk migration · P(Bust) Day 1 → 10</h3>
        <span className="text-[11px] text-muted-foreground">Where does trust deteriorate or recover with lead time? Same cycle, existing predictions.</span>
      </div>
      <ol className="panel-sec grid grid-cols-5 gap-1 lg:grid-cols-10">
        {[...Array(10)].map((_, i) => {
          const d = i + 1;
          const dc = byDay.get(d) ?? new Map();
          const n = [...dc.values()].filter((c) => c.confidence === "Low" || c.confidence === "Reduced").length;
          return (
            <li key={d}>
              <button type="button" onClick={() => onDay(d)} aria-pressed={d === day} data-testid={`mig-${d}`}
                aria-label={`Day ${d}: ${n} subdivisions at Reduced or Low`}
                className={cn("flex w-full flex-col items-center rounded border p-0.5", d === day ? "border-foreground" : "border-transparent hover:border-border")}>
                <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
                  {[...paths.entries()].map(([rid, dPath]) => (
                    <path key={rid} d={dPath} fill={dc.get(rid)?.p_bust == null ? na : pbustColor(dc.get(rid)!.p_bust, theme)} stroke={stroke} strokeWidth={0.3} />
                  ))}
                </svg>
                <span className="tnum text-[11px]"><strong>D{d}</strong> · {n} ▲◆</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
