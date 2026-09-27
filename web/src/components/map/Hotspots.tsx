import type { Cell, Region } from "@/api/client";
import { hotspots, footprints, RULES, type Footprint } from "@/lib/spatial";
import { prettyName, pct } from "@/lib/hooks";
import { BAND } from "@/theme/scales";
import { InfoTip } from "./controls";
import { cn } from "@/lib/utils";

const FP_LABEL = { isolated: "Isolated", clustered: "Clustered", widespread: "Widespread" } as const;
const FP_TIP = `Subdivisions at ▲ Reduced or ◆ Low that share a boundary are grouped: 1 → isolated, 2–${RULES.footprint.clusteredMax} → clustered, ≥${RULES.footprint.clusteredMax + 1} → widespread. A spatial grouping of adjacent model risk bands — not a detected weather event.`;

/** "Where should I look?" — compact ranking of the existing P(bust) for the selected day. */
export function Hotspots({ dayCells, regions, adjacency, selected, onPick, day, footprintOn }: {
  dayCells: Cell[]; regions: Map<number, Region>; adjacency: Record<string, number[]> | null; selected?: number;
  onPick: (rid: number) => void; day: number; footprintOn: boolean;
}) {
  const top = hotspots(dayCells, 10);
  const fps: Footprint[] = adjacency ? footprints(dayCells, adjacency) : [];
  const name = (r: number) => prettyName(regions.get(r)?.name);
  const counts = (["widespread", "clustered", "isolated"] as const).map((k) => [k, fps.filter((f) => f.cls === k).length] as const).filter(([, n]) => n);
  return (
    <div className="space-y-3" data-testid="hotspots">
      <section aria-labelledby="hs-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="hs-h" className="text-[10px] font-semibold uppercase tracking-wider">Risk hotspots · Day {day}</h3>
          <InfoTip label="Risk hotspots" text="Highest existing P(bust) for this day (no new risk calculation). Click a row to focus the map and investigate." />
        </div>
        <ol>
          {top.map((c, i) => {
            const b = BAND[c.confidence];
            return (
              <li key={c.rid}>
                <button type="button" onClick={() => onPick(c.rid)} data-testid={`hotspot-${i + 1}`} aria-current={selected === c.rid ? "true" : undefined}
                  aria-label={`${i + 1}. ${name(c.rid)}, P(bust) ${pct(c.p_bust)}, ${c.confidence}${c.hi_risk ? ", heavy-rain risk" : ""}`}
                  className={cn("grid w-full grid-cols-[1.5rem_1fr_auto_5.5rem] items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent",
                    selected === c.rid && "bg-accent")}>
                  <span className="tnum text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate" title={name(c.rid)}>{name(c.rid)}{c.hi_risk && <span className="ml-1 text-[10px] text-muted-foreground" title="HRES and ensemble disagree about heavy rain">· heavy rain</span>}</span>
                  <span className="tnum text-right font-semibold">{pct(c.p_bust)}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><span aria-hidden style={{ color: b.color }}>{b.icon}</span>{c.confidence}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="fp-h" className="border-t pt-2" data-testid="footprints">
        <div className="flex items-center justify-between">
          <h3 id="fp-h" className="text-[10px] font-semibold uppercase tracking-wider">Risk footprint</h3>
          <InfoTip label="Risk footprint" text={FP_TIP} />
        </div>
        <p className="text-xs text-muted-foreground" data-testid="fp-summary">
          {!adjacency ? "…" : fps.length === 0 ? "No subdivision at Reduced or Low." : counts.map(([k, n]) => `${n} ${FP_LABEL[k].toLowerCase()}`).join(" · ")}
          {!footprintOn && fps.length > 0 && " — turn on the outline to see it on the map"}
        </p>
        {footprintOn && fps.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {fps.map((f) => (
              <li key={f.id} className="text-xs" data-testid={`fp-${f.id}`} data-class={f.cls}>
                <span className="text-muted-foreground">#{f.id} {FP_LABEL[f.cls]} ·</span>{" "}
                {f.rids.map((r, j) => <span key={r}>{j > 0 && ", "}<button type="button" className="hover:underline" onClick={() => onPick(r)}>{name(r)}</button></span>)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
