import type { Cell } from "@/api/client";
import { LENSES, type Lens, type Theme } from "@/theme/scales";
import { BASEMAPS, type BasemapId } from "./basemaps";
import { LensLegend } from "./lens";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CATEGORIES: { n: string; title: string; lenses: Lens[] }[] = [
  { n: "01", title: "Trust", lenses: ["pbust"] },
  { n: "02", title: "Forecast", lenses: ["rain"] },
  { n: "03", title: "Uncertainty", lenses: ["spread"] },
  { n: "04", title: "Pattern", lenses: ["novelty", "revision", "regime"] },
];

/** Basemap (context) is kept separate from the Purva-Netra evidence layers. One evidence layer at a time. */
export function LayerPanel({ basemap, onBasemap, lens, onLens, evidenceOn, onEvidence, footprintOn, onFootprint, theme, cells,
  basemapError, day, validDate, split }: {
  basemap: BasemapId; onBasemap: (b: BasemapId) => void; lens: Lens; onLens: (l: Lens) => void;
  evidenceOn: boolean; onEvidence: (b: boolean) => void; footprintOn: boolean; onFootprint: (b: boolean) => void;
  theme: Theme; cells: Cell[]; basemapError: boolean; day: number; validDate?: string; split: boolean;
}) {
  const bm = BASEMAPS.find((b) => b.id === basemap)!;
  const unavailable = (l: Lens) => l === "regime" || (l === "novelty" && cells.every((c) => c.novelty == null));
  return (
    <div className="space-y-3 text-xs" data-testid="layer-panel">
      <section aria-labelledby="bm-h">
        <h3 id="bm-h" className="panel-title mb-1">Basemap · context only</h3>
        <div className="grid grid-cols-3 gap-0.5 rounded-md border p-0.5" role="radiogroup" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={basemap === b.id} data-testid={`basemap-${b.id}`}
              onClick={() => onBasemap(b.id)} title={b.note}
              className={cn("rounded px-1 py-1", basemap === b.id ? "bg-foreground text-background" : "hover:bg-accent")}>
              {b.label}{b.network ? " ↗" : ""}
            </button>
          ))}
        </div>
        <p className="mt-1 text-muted-foreground" data-testid="basemap-note">{bm.note}{bm.network ? " Needs a network connection (↗)." : ""}</p>
        {basemapError && bm.network && (
          <p role="status" className="mt-1 rounded border border-[#fab219] px-2 py-1" data-testid="basemap-error">
            ▲ {bm.label} tiles unavailable (offline or blocked). Evidence layers are unaffected — switch to Minimal, Light or Dark.
          </p>
        )}
      </section>

      <section aria-labelledby="ev-h">
        <div className="mb-1 flex items-center justify-between">
          <h3 id="ev-h" className="panel-title">Evidence layers</h3>
          <label className="flex items-center gap-1.5">Show<Switch checked={evidenceOn} onCheckedChange={onEvidence} aria-label="Show evidence layer" data-testid="evidence-toggle" /></label>
        </div>
        <div className="space-y-2" role="radiogroup" aria-label="Evidence layer">
          {CATEGORIES.map((c) => (
            <div key={c.n}>
              <div className="mb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground">CATEGORY {c.n} · {c.title.toUpperCase()}</div>
              {c.lenses.map((id) => {
                const L = LENSES.find((l) => l.id === id)!;
                const na = unavailable(id);
                return (
                  <button key={id} type="button" role="radio" aria-checked={lens === id && !split} disabled={split}
                    data-testid={`layer-${id}`} onClick={() => onLens(id)}
                    className={cn("mb-0.5 flex w-full items-start gap-2 rounded border px-2 py-1 text-left",
                      lens === id && !split ? "border-foreground bg-accent" : "border-transparent hover:bg-accent/60", split && "opacity-50")}>
                    <span aria-hidden className="mt-0.5">{lens === id && !split ? "◉" : "○"}</span>
                    <span className="min-w-0 flex-1"><span className="font-semibold">{L.label}</span>{na && <span className="ml-1 text-muted-foreground">· not available</span>}
                      <span className="block truncate text-muted-foreground" title={L.meaning}>{L.meaning}</span></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="ov-h">
        <h3 id="ov-h" className="panel-title mb-1">Overlay</h3>
        <label className="flex items-start justify-between gap-2">
          <span>Risk footprint outline<span className="block text-muted-foreground">Dashed outline around adjacent subdivisions at ▲ Reduced / ◆ Low — a spatial grouping of the model's bands, not a detected weather event.</span></span>
          <Switch checked={footprintOn} onCheckedChange={onFootprint} aria-label="Risk footprint outline" data-testid="footprint-toggle" />
        </label>
      </section>

      <section aria-labelledby="lg-h" className="border-t pt-2">
        <h3 id="lg-h" className="sr-only">Legend</h3>
        {split ? <><LensLegend lens="rain" orange theme={theme} cells={cells} /><div className="mt-2"><LensLegend lens="pbust" theme={theme} cells={cells} day={day} validDate={validDate} /></div></>
          : <LensLegend lens={lens} theme={theme} cells={cells} day={day} validDate={validDate} overImagery={bm.network} />}
      </section>
    </div>
  );
}
