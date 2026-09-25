import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pause, Play, PanelRightClose, PanelRightOpen, Columns2, Table2, X } from "lucide-react";
import type { Map as MLMap } from "maplibre-gl";
import { useMatrix, type Cell } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, prettyName, pct, pts, mm, linkTo, fmtDate, useLang } from "@/lib/hooks";
import { useView } from "@/store";
import { RiskMap } from "@/components/map/RiskMap";
import { ConfidenceBadge, DataTable, ErrorState, Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  LENSES, type Lens, type Theme, pbustColor, pbustPalette, seqColor, RAIN_EDGES, SEQ_BLUE, SEQ_BLUE_DARK,
  SEQ_ORANGE, SEQ_ORANGE_DARK, SPREAD_EDGES, SEQ_VIOLET, SEQ_VIOLET_DARK, NOVELTY_EDGES,
  revColor, revPalette,
} from "@/theme/scales";
import { cn } from "@/lib/utils";

const NA = (t: Theme) => (t === "dark" ? "#262625" : "#e8e7e1");
const rev = (c?: Cell) => (c?.f_rain != null && c.f_rain_prev != null ? c.f_rain - c.f_rain_prev : null);

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
export function LensLegend({ lens, theme, cells, orange = false }: { lens: Lens; theme: Theme; cells: Cell[]; orange?: boolean }) {
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
      <p className="text-muted-foreground">{L.meaning}</p>
    </figure>
  );
}

/** Low-confidence count per day (Day 1–10) — a small bar sparkline above the scrubber. */
function LowSparkline({ cells, day, onPick }: { cells: Cell[]; day: number; onPick: (d: number) => void }) {
  const counts = [...Array(10)].map((_, i) => new Set(cells.filter((c) => c.lead === i + 1 && c.confidence === "Low").map((c) => c.rid)).size);
  const max = Math.max(1, ...counts);
  return (
    <div className="flex h-7 items-end gap-0.5" data-testid="low-sparkline" aria-label={`Regions at Low confidence by day: ${counts.map((n, i) => `Day ${i + 1} ${n}`).join(", ")}`}>
      {counts.map((n, i) => (
        <button key={i} type="button" onClick={() => onPick(i + 1)} title={`Day ${i + 1}: ${n} region(s) at Low confidence`}
          className="flex h-full flex-1 flex-col justify-end" aria-label={`Day ${i + 1}: ${n} at Low`}>
          <span className={cn("block w-full rounded-t-xs", i + 1 === day ? "bg-foreground" : "bg-foreground/35")} style={{ height: `${Math.max(8, (n / max) * 100)}%` }} />
        </button>
      ))}
    </div>
  );
}

function Popover({ cell, name, x, y, onClose, day }: { cell?: Cell; name: string; x: number; y: number; onClose: () => void; day: number }) {
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, [cell]);
  const reason = lang === "hi" ? cell?.top_reason_hi : cell?.top_reason_en;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={`${name}, Day ${day} trust summary`} data-testid="region-popover"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="absolute z-20 w-72 rounded-md border bg-popover p-3 text-sm shadow-lg outline-none"
      style={{ left: Math.max(8, Math.min(x + 12, 10000)), top: Math.max(8, y - 20) }}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div><div className="font-semibold">{name}</div><div className="text-xs text-muted-foreground">Day {day} · valid {fmtDate(cell?.valid_date)}</div></div>
        <button className="text-muted-foreground" aria-label="Close" onClick={onClose}><X className="size-4" /></button>
      </div>
      {cell?.p_bust == null ? <p className="text-muted-foreground">Not assessed — no IMD land cells, so no truth to define a bust.</p> : (
        <>
          <div className="flex items-center gap-2"><span className="kpi-sm">{pct(cell.p_bust)}</span><ConfidenceBadge band={cell.confidence} />
            <span className="text-xs text-muted-foreground">vs 10% base rate</span></div>
          <div className="mt-1 text-xs" data-testid="popover-change">
            {cell.change_vs_prev == null ? "No previous cycle for this valid date" : <>{cell.change_vs_prev > 0 ? "↑" : cell.change_vs_prev < 0 ? "↓" : "→"} {pts(cell.change_vs_prev)} vs previous cycle</>}
          </div>
          {reason && <p className="mt-1 text-xs text-muted-foreground" data-testid="popover-reason">{reason}</p>}
          <Button size="sm" className="mt-2 w-full" asChild>
            <Link to={linkTo(`/region/${cell.rid}`, { day, tab: "overview" })} data-testid="open-analysis">Open analysis</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export default function MapPage() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { init } = useInit();
  const m = useMatrix(init);
  const regions = useRegionMap();
  const v = useView();
  const day = Math.min(10, Math.max(1, Number(v.get("day") ?? 1)));
  const lens = (LENSES.some((l) => l.id === v.get("layer")) ? v.get("layer") : "pbust") as Lens;
  const split = v.get("split") === "1";
  const panel = v.get("panel") !== "0";
  const table = v.get("view") === "table";
  const sel = v.get("rid") != null ? Number(v.get("rid")) : undefined;
  const [ptState, setPt] = useState<{ x: number; y: number } | null>(null);
  const pt = ptState ?? (v.get("rid") != null ? { x: 16, y: 8 } : null);   // shared link with ?rid= → popover top-left
  const [playing, setPlaying] = useState(false);
  const sync = useRef<MLMap[]>([]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const setDay = useCallback((d: number) => v.set({ day: Math.min(10, Math.max(1, d)) }), [v]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const d = Number(new URLSearchParams(window.location.search).get("day") ?? 1);
      if (d >= 10) { setPlaying(false); return; }
      v.set({ day: d + 1 });
    }, reduced ? 1500 : 900);
    return () => clearInterval(id);
  }, [playing, v, reduced]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;       // target may be window/document
      if (el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.getAttribute("role") === "slider" || el.isContentEditable)) return;
      const d = Number(new URLSearchParams(window.location.search).get("day") ?? 1);
      if (e.key === "ArrowRight") { e.preventDefault(); setDay(d + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setDay(d - 1); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [setDay]);

  const colorOf = useMemo(() => lensColor(lens, theme), [lens, theme]);
  const tipOf = useMemo(() => lensTip(lens), [lens]);
  const rainOf = useMemo(() => lensColor("rain", theme, true), [theme]);
  const rainTip = useMemo(() => lensTip("rain"), []);
  const pOf = useMemo(() => lensColor("pbust", theme), [theme]);
  const pTip = useMemo(() => lensTip("pbust"), []);

  if (m.isLoading || !init) return <Loading />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  const cells = m.data!;
  const dayCells = cells.filter((c) => c.lead === day);
  const selCell = sel != null ? dayCells.find((c) => c.rid === sel) : undefined;
  const select = (rid: number, p: { x: number; y: number }) => { v.set({ rid }); setPt(p); };
  const worst = dayCells.filter((c) => c.p_bust != null).sort((a, b) => (b.p_bust ?? 0) - (a.p_bust ?? 0)).slice(0, 6);

  return (
    <div className="flex h-[calc(100svh-var(--hdr,48px)-1.25rem)] flex-col gap-2">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map toolbar">
        <h1 className="sr-only">{t("map.title")}</h1>
        <span className="panel-title">Trust Lens</span>
        <div className="flex flex-wrap rounded-md border p-0.5" role="radiogroup" aria-label="Trust Lens" data-testid="lens-switcher">
          {LENSES.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lens === l.id} disabled={split}
              data-testid={`lens-${l.id}`} onClick={() => v.set({ layer: l.id })}
              className={cn("rounded px-2 py-1 text-xs", lens === l.id ? "bg-foreground text-background" : "hover:bg-accent", split && "opacity-50")}>
              {l.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant={split ? "default" : "outline"} aria-pressed={split} data-testid="split-toggle" onClick={() => v.set({ split: split ? undefined : 1 })}>
          <Columns2 className="size-4" aria-hidden />Split
        </Button>
        <Button size="sm" variant="outline" aria-pressed={table} onClick={() => v.set({ view: table ? undefined : "table" })}>
          <Table2 className="size-4" aria-hidden />{table ? t("common.chart_view") : t("common.table_view")}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={panel} aria-label={panel ? "Collapse side panel" : "Expand side panel"}
          onClick={() => v.set({ panel: panel ? 0 : undefined })}>
          {panel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {table ? (
            <div className="panel flex-1 overflow-auto">
              <DataTable
                cols={[
                  { key: "rid", label: t("common.region"), fmt: (x) => prettyName(regions.get(x as number)?.name) },
                  { key: "p_bust", label: "P(bust)", fmt: (x) => pct(x as number, 1) },
                  { key: "confidence", label: t("common.confidence") },
                  { key: "f_rain", label: "Forecast rain", fmt: (x) => mm(x as number) },
                  { key: "spread_anom", label: "Spread ×", fmt: (x) => (x == null ? "–" : (x as number).toFixed(2)) },
                  { key: "f_rain_prev", label: "Revision (mm)", fmt: (_x, r) => { const d = rev(r as unknown as Cell); return d == null ? "–" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`; } },
                  { key: "novelty", label: "Novelty", fmt: (x) => (x == null ? "n/a" : (x as number).toFixed(2)) },
                ]}
                rows={dayCells as unknown as Record<string, unknown>[]}
              />
            </div>
          ) : split ? (
            <div className="flex min-h-0 flex-1 gap-2" data-testid="split-maps">
              <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs font-medium">Forecast Rain</span>
                <RiskMap cells={cells} day={day} layer="rain" theme={theme} syncRef={sync} selected={sel} onSelect={select} colorOf={rainOf} tipOf={rainTip} label={`Forecast rain map, day ${day}`} /></div>
              <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs font-medium">P(Bust)</span>
                <RiskMap cells={cells} day={day} layer="pbust" theme={theme} syncRef={sync} selected={sel} onSelect={select} colorOf={pOf} tipOf={pTip} label={`P(bust) map, day ${day}`} /></div>
            </div>
          ) : (
            <div className="relative min-h-0 flex-1" data-testid="hero-map">
              <RiskMap cells={cells} day={day} layer={lens} theme={theme} selected={sel} onSelect={select} colorOf={colorOf} tipOf={tipOf}
                label={`${LENSES.find((l) => l.id === lens)!.label} map, day ${day}. ${t("map.click_hint")}`} />
              {lens === "regime" && (
                <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded border bg-card/90 px-3 py-1 text-sm" data-testid="regime-na">
                  Regime: Not available in this model version
                </div>
              )}
            </div>
          )}
          {sel != null && pt && !table && (
            <Popover cell={selCell} name={prettyName(regions.get(sel)?.name)} x={split ? pt.x : pt.x} y={pt.y + 40} day={day}
              onClose={() => { v.set({ rid: undefined }); setPt(null); }} />
          )}
          {/* scrubber */}
          <div className="panel px-3 py-2" data-tour="scrubber">
            <LowSparkline cells={cells} day={day} onPick={setDay} />
            <div className="mt-1 flex items-center gap-3">
              <Button size="sm" onClick={() => { if (day >= 10) setDay(1); setPlaying(!playing); }} aria-label={playing ? t("map.pause") : t("map.play")} data-testid="play">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Slider className="flex-1" min={1} max={10} step={1} value={[day]} onValueChange={([d]) => setDay(d)} aria-label={t("common.day")} />
              <span className="tnum w-36 text-sm font-semibold" aria-live="polite" data-testid="day-label">{t("common.day")} {day} · {fmtDate(dayCells[0]?.valid_date)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">← → change day · bars: regions at Low confidence per day</p>
          </div>
        </div>

        {panel && (
          <aside className="panel hidden w-72 shrink-0 flex-col overflow-auto md:flex" aria-label="Map side panel" data-testid="side-panel">
            <div className="panel-sec">
              {split ? <><LensLegend lens="rain" orange theme={theme} cells={cells} /><div className="mt-2"><LensLegend lens="pbust" theme={theme} cells={cells} /></div></>
                : <LensLegend lens={lens} theme={theme} cells={cells} />}
            </div>
            <div className="panel-sec">
              <h2 className="panel-title mb-1">Lowest trust · Day {day}</h2>
              <ul className="divide-y divide-border/60">
                {worst.map((c) => (
                  <li key={c.rid} className="flex items-center gap-2 py-1 text-xs">
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => { v.set({ rid: c.rid }); setPt({ x: 40, y: 80 }); }}>
                      {prettyName(regions.get(c.rid)?.name)}
                    </button>
                    <span className="tnum font-semibold">{pct(c.p_bust)}</span>
                    <ConfidenceBadge band={c.confidence} />
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
