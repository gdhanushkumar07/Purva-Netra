import { ChevronDown, Info } from "lucide-react";
import type { Cell } from "@/api/client";
import { LENSES, type Lens, type Theme, pbustPalette, revPalette, SEQ_BLUE, SEQ_BLUE_DARK, SEQ_ORANGE, SEQ_ORANGE_DARK, SEQ_VIOLET, SEQ_VIOLET_DARK } from "@/theme/scales";
import { BASEMAPS, basemapOf, type BasemapId } from "./basemaps";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Small (i) with the long explanation in a tooltip — progressive disclosure. */
export function InfoTip({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`${label}: ${text}`} className="inline-flex text-muted-foreground hover:text-foreground"><Info className="size-3.5" /></button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Compact basemap control: "BASEMAP ▾". Basemaps are context only. */
export function BasemapMenu({ value, onChange }: { value: BasemapId; onChange: (b: BasemapId) => void }) {
  const cur = basemapOf(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs hover:bg-accent" data-testid="basemap-trigger" aria-label={`Basemap: ${cur.label}`}>
          <span className="text-muted-foreground">Basemap</span> {cur.label} <ChevronDown className="size-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Context only — never an input to the model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as BasemapId)}>
          {BASEMAPS.map((b) => (
            <DropdownMenuRadioItem key={b.id} value={b.id} data-testid={`basemap-${b.id}`} className="flex-col items-start gap-0">
              <span>{b.label}{b.network ? " ↗" : ""}</span>
              <span className="text-[11px] text-muted-foreground" data-testid={value === b.id ? "basemap-note" : undefined}>{b.note}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const EDGES: Record<Exclude<Lens, "regime">, string[]> = {
  pbust: ["3", "6", "9", "12", "18", "25", "35"], rain: ["1", "2.5", "7.5", "15", "35", "64"],
  spread: ["0.5", ".75", "1", "1.25", "1.5", "2"], novelty: ["0.5", "1", "1.5", "2", "2.5", "3"], revision: ["−20", "−10", "−3", "+3", "+10", "+20"],
};
const SHORT: Record<Lens, string> = {
  pbust: "Blue lower · grey ≈ 10% baseline · red higher chance the forecast busts",
  rain: "Lighter → heavier HRES 24-h rain", spread: "Lighter → more ensemble disagreement than normal",
  novelty: "Lighter → more unlike past forecasts", revision: "Orange drier · blue wetter than the previous cycle", regime: "",
};

/** Compact floating legend over the map. */
export function MapLegend({ lens, theme, cells, day, validDate, orange = false }: {
  lens: Lens; theme: Theme; cells: Cell[]; day: number; validDate: string; orange?: boolean;
}) {
  const L = LENSES.find((l) => l.id === lens)!;
  const na = lens === "regime" || (lens === "novelty" && cells.every((c) => c.novelty == null));
  const ramp = lens === "pbust" ? pbustPalette(theme) : lens === "revision" ? revPalette(theme)
    : lens === "spread" || orange ? (theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE)
    : lens === "novelty" ? (theme === "dark" ? SEQ_VIOLET_DARK : SEQ_VIOLET) : theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE;
  return (
    <figure className="w-60 rounded-md border bg-card/92 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur" data-testid="lens-legend" aria-label={`${L.label} legend`}>
      <figcaption className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider">{L.label} <span className="font-normal normal-case text-muted-foreground">{L.units}</span></span>
        <InfoTip label={`${L.label} legend`} text={lens === "pbust"
          ? "Chance this forecast busts (error in the worst 10% for this region, lead day and season). Grey 9–12% ≈ the usual 10% base rate. Bands: ✓ High <5% · ○ Normal 5–15% · ▲ Reduced 15–30% · ◆ Low >30%."
          : `${L.meaning} Units: ${L.units}.`} />
      </figcaption>
      {na ? <p className="text-muted-foreground" data-testid="lens-na">– Not available in this model version</p> : (
        <>
          <div className="flex gap-px">{ramp.map((c, i) => <span key={i} className="h-2 flex-1 first:rounded-l-sm last:rounded-r-sm" style={{ background: c }} />)}</div>
          <div className="relative mt-0.5 h-3">
            {EDGES[lens as Exclude<Lens, "regime">].map((e, i) => (
              <span key={i} className="tnum absolute -translate-x-1/2 text-[9px] text-muted-foreground" style={{ left: `${((i + 1) / ramp.length) * 100}%` }}>{e}</span>
            ))}
          </div>
          <p className="mt-0.5 text-muted-foreground" data-testid={lens === "pbust" ? "pbust-baseline" : undefined}>
            {lens === "pbust" ? "Chance this forecast busts · " : ""}{SHORT[lens]}
          </p>
        </>
      )}
      <p className="text-muted-foreground" data-testid="legend-day">Day {day} = rain day ending {validDate}</p>
    </figure>
  );
}
