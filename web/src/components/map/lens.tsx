import type { Cell } from "@/api/client";
import { pct, mm } from "@/lib/hooks";
import {
  LENSES, type Lens, type Theme, pbustColor, pbustPalette, seqColor, RAIN_EDGES, SEQ_BLUE, SEQ_BLUE_DARK,
  SEQ_ORANGE, SEQ_ORANGE_DARK, SPREAD_EDGES, SEQ_VIOLET, SEQ_VIOLET_DARK, NOVELTY_EDGES, revColor, revPalette,
} from "@/theme/scales";

export const NA = (t: Theme) => (t === "dark" ? "#262625" : "#e8e7e1");
export const rev = (c?: Cell) => (c?.f_rain != null && c.f_rain_prev != null ? c.f_rain - c.f_rain_prev : null);

export function lensColor(lens: Lens, theme: Theme, orange = false) {
  const blue = theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE;
  const org = theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE;
  const vio = theme === "dark" ? SEQ_VIOLET_DARK : SEQ_VIOLET;
  return (c?: Cell) => {
    if (!c || c.p_bust == null) return NA(theme);
    switch (lens) {
      case "pbust": return pbustColor(c.p_bust, theme);
      case "rain": return seqColor(c.f_rain, RAIN_EDGES, orange ? org : blue);
      case "spread": return seqColor(c.spread_anom, SPREAD_EDGES, org);
      case "novelty": return c.novelty == null ? NA(theme) : seqColor(c.novelty, NOVELTY_EDGES, vio);
      case "revision": { const r = rev(c); return r == null ? NA(theme) : revColor(r, theme); }
      case "regime": return NA(theme);
    }
  };
}
export function lensTip(lens: Lens) {
  return (c?: Cell) => {
    if (!c || c.p_bust == null) return "Not assessed (no IMD land cells)";
    switch (lens) {
      case "pbust": return `P(bust) ${pct(c.p_bust)} · ${c.confidence}`;
      case "rain": return `Forecast ${mm(c.f_rain)}`;
      case "spread": return `Spread ${c.spread_anom?.toFixed(2)}× normal`;
      case "novelty": return c.novelty == null ? "Novelty: not available in this model version" : `Novelty ${c.novelty.toFixed(2)}`;
      case "revision": { const r = rev(c); return r == null ? "No previous cycle for this valid date" : `${r > 0 ? "+" : ""}${r.toFixed(1)} mm vs previous cycle`; }
      case "regime": return "Regime: not available in this model version";
    }
  };
}

/** Swatch row with labels on the boundaries between bins (never overlapping). */
function Swatches({ colors, edges }: { colors: string[]; edges: string[] }) {
  return (
    <div>
      <div className="flex gap-0.5" role="list" aria-label={`bins with boundaries ${edges.join(", ")}`}>
        {colors.map((c, i) => <span key={i} role="listitem" className="h-2.5 flex-1 rounded-sm border border-black/10 dark:border-white/10" style={{ background: c }} />)}
      </div>
      <div className="relative mt-0.5 h-3.5">
        {edges.map((e, i) => (
          <span key={i} className="tnum absolute -translate-x-1/2 text-[10px] text-muted-foreground" style={{ left: `${((i + 1) / colors.length) * 100}%` }}>{e}</span>
        ))}
      </div>
    </div>
  );
}

/** Legend for one lens: swatches, units and a one-line meaning; unavailable lenses say so. */
export function LensLegend({ lens, theme, cells, orange = false, overImagery = false, day, validDate }: {
  lens: Lens; theme: Theme; cells: Cell[]; orange?: boolean; overImagery?: boolean; day?: number; validDate?: string;
}) {
  const L = LENSES.find((l) => l.id === lens)!;
  const noveltyMissing = lens === "novelty" && cells.every((c) => c.novelty == null);
  const unavailable = lens === "regime" || noveltyMissing;
  return (
    <figure className="space-y-1 text-xs" data-testid="lens-legend" aria-label={`${L.label} legend`}>
      <figcaption className="flex justify-between gap-2"><span className="font-semibold">{L.label}</span><span className="text-muted-foreground">{L.units}</span></figcaption>
      {unavailable ? (
        <p className="rounded border border-dashed px-2 py-1 text-muted-foreground" data-testid="lens-na">– Not available in this model version</p>
      ) : lens === "pbust" ? <Swatches colors={pbustPalette(theme)} edges={["3", "6", "9", "12", "18", "25", "35"]} />
        : lens === "rain" ? <Swatches colors={orange ? (theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE) : theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE} edges={["1", "2.5", "7.5", "15", "35", "64.5"]} />
        : lens === "spread" ? <Swatches colors={theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE} edges={["0.5", "0.75", "1", "1.25", "1.5", "2"]} />
        : lens === "novelty" ? <Swatches colors={theme === "dark" ? SEQ_VIOLET_DARK : SEQ_VIOLET} edges={["0.5", "1", "1.5", "2", "2.5", "3"]} />
        : <Swatches colors={revPalette(theme)} edges={["−20", "−10", "−3", "+3", "+10", "+20"]} />}
      {lens !== "pbust" && <p className="text-muted-foreground">{L.meaning}</p>}
      {lens === "pbust" && (
        <p className="text-muted-foreground" data-testid="pbust-baseline">
          Chance this forecast busts (error in the worst 10% for this region, lead day and season). Grey 9–12% ≈ the usual
          10% base rate; blue = more trustworthy than usual, red = less. Bands: ✓ High &lt;5% · ○ Normal 5–15% · ▲ Reduced 15–30% · ◆ Low &gt;30%.
        </p>
      )}
      {day != null && <p className="text-muted-foreground" data-testid="legend-day">Day {day} = the 24 h rain day ending on {validDate ?? "–"} (IMD day, 03 UTC).</p>}
      {overImagery && <p className="text-muted-foreground">Shown at 82% opacity over context imagery.</p>}
    </figure>
  );
}

