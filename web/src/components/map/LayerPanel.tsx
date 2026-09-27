import type { Cell } from "@/api/client";
import { LENSES, type Lens } from "@/theme/scales";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "./controls";
import { cn } from "@/lib/utils";

const SHORT: Record<Lens, string> = {
  pbust: "Chance the forecast busts", rain: "HRES 24-h rain", spread: "Member disagreement vs normal",
  novelty: "Unlike past forecasts", revision: "Forecast change vs previous cycle", regime: "Weather regime",
};
const GROUPS: { title: string; lenses: Lens[] }[] = [
  { title: "Trust", lenses: ["pbust"] }, { title: "Forecast", lenses: ["rain"] },
  { title: "Uncertainty", lenses: ["spread"] }, { title: "Pattern", lenses: ["novelty", "revision", "regime"] },
];

/** Compact layer drawer: one line per layer, details on demand (info tooltips). */
export function LayerPanel({ lens, onLens, evidenceOn, onEvidence, footprintOn, onFootprint, cells, split }: {
  lens: Lens; onLens: (l: Lens) => void; evidenceOn: boolean; onEvidence: (b: boolean) => void;
  footprintOn: boolean; onFootprint: (b: boolean) => void; cells: Cell[]; split: boolean;
}) {
  const na = (l: Lens) => l === "regime" || (l === "novelty" && cells.every((c) => c.novelty == null));
  return (
    <div className="space-y-3 text-xs" data-testid="layer-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Layers</h3>
        <label className="flex items-center gap-1.5 text-muted-foreground">Show
          <Switch checked={evidenceOn} onCheckedChange={onEvidence} aria-label="Show evidence layer" data-testid="evidence-toggle" /></label>
      </div>
      <div role="radiogroup" aria-label="Evidence layer" className="space-y-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{g.title}</div>
            {g.lenses.map((id) => {
              const L = LENSES.find((l) => l.id === id)!;
              const on = lens === id && !split;
              return (
                <div key={id} className="flex items-center gap-1">
                  <button type="button" role="radio" aria-checked={on} disabled={split} data-testid={`layer-${id}`} onClick={() => onLens(id)}
                    className={cn("flex min-w-0 flex-1 items-baseline gap-2 rounded px-1.5 py-1 text-left", on ? "bg-accent" : "hover:bg-accent/60", split && "opacity-50")}>
                    <span aria-hidden className={on ? "" : "text-muted-foreground"}>{on ? "●" : "○"}</span>
                    <span className="min-w-0">
                      <span className={on ? "font-semibold" : ""}>{L.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{na(id) ? "Not available in this model version" : SHORT[id]}</span>
                    </span>
                  </button>
                  <InfoTip label={L.label} text={`${L.meaning} Units: ${L.units}.`} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="flex items-center gap-1">Risk footprint
          <InfoTip label="Risk footprint" text="Dashed outline around adjacent subdivisions at ▲ Reduced / ◆ Low. A spatial grouping of adjacent model risk bands — not a detected weather event." /></span>
        <Switch checked={footprintOn} onCheckedChange={onFootprint} aria-label="Risk footprint outline" data-testid="footprint-toggle" />
      </div>
    </div>
  );
}
