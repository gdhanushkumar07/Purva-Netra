import type { Cell, Region } from "@/api/client";
import { hotspots, footprints, RULES, type Footprint } from "@/lib/spatial";
import { prettyName, pct } from "@/lib/hooks";
import { ConfidenceBadge } from "@/components/common";
import { cn } from "@/lib/utils";

const FP_LABEL = { isolated: "Isolated", clustered: "Clustered", widespread: "Widespread" } as const;

/** Ranking of the existing P(bust) for the selected day + the spatial footprint summary. */
export function Hotspots({ dayCells, regions, adjacency, selected, onPick, day }: {
  dayCells: Cell[]; regions: Map<number, Region>; adjacency: Record<string, number[]> | null; selected?: number;
  onPick: (rid: number) => void; day: number;
}) {
  const top = hotspots(dayCells, 10);
  const fps: Footprint[] = adjacency ? footprints(dayCells, adjacency) : [];
  const name = (r: number) => prettyName(regions.get(r)?.name);
  return (
    <div className="space-y-3" data-testid="hotspots">
      <section aria-labelledby="hs-h">
        <h3 id="hs-h" className="panel-title mb-1">Risk hotspots · Day {day}</h3>
        <p className="mb-1 text-[11px] text-muted-foreground">Highest existing P(bust) for this day (no new risk calculation). Click to focus the map and investigate.</p>
        <ol className="divide-y divide-border/60">
          {top.map((c, i) => (
            <li key={c.rid}>
              <button type="button" onClick={() => onPick(c.rid)} data-testid={`hotspot-${i + 1}`} aria-current={selected === c.rid ? "true" : undefined}
                className={cn("flex w-full items-center gap-2 px-1 py-1 text-left text-xs hover:bg-accent", selected === c.rid && "bg-accent")}>
                <span className="tnum w-4 text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{name(c.rid)}</span>
                {c.hi_risk && <span className="rounded border px-1 text-[10px]" title="HRES and ensemble disagree about heavy rain (fixed rule)">heavy rain</span>}
                <span className="tnum w-9 text-right font-semibold">{pct(c.p_bust)}</span>
                <ConfidenceBadge band={c.confidence} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="fp-h" data-testid="footprints">
        <h3 id="fp-h" className="panel-title mb-1">Risk footprint · Day {day}</h3>
        <p className="mb-1 text-[11px] text-muted-foreground">
          Subdivisions at ▲ Reduced or ◆ Low that share a boundary are grouped. {RULES.footprint.isolated} region → isolated ·
          2–{RULES.footprint.clusteredMax} → clustered · ≥{RULES.footprint.clusteredMax + 1} → widespread. A spatial view of the model's
          bands — not a detected weather system.
        </p>
        {!adjacency ? <p className="text-xs text-muted-foreground">Loading geometry…</p>
          : fps.length === 0 ? <p className="text-xs" data-testid="fp-none">○ No subdivision at Reduced or Low on Day {day}.</p> : (
            <ul className="space-y-1">
              {fps.map((f) => (
                <li key={f.id} className="rounded border px-2 py-1 text-xs" data-testid={`fp-${f.id}`} data-class={f.cls}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">#{f.id} · {FP_LABEL[f.cls]} · {f.rids.length} region{f.rids.length > 1 ? "s" : ""}</span>
                    <span className="tnum text-muted-foreground">max {pct(f.maxP)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {f.rids.map((r, j) => (
                      <span key={r}>{j > 0 && ", "}<button type="button" className="underline-offset-2 hover:underline" onClick={() => onPick(r)}>{name(r)}</button></span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
