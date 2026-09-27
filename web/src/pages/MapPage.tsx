import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Columns2, Table2, X, Maximize2, Minimize2, Film } from "lucide-react";
import type { Map as MLMap } from "maplibre-gl";
import { useMatrix, type Cell } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, prettyName, pct, pts, mm, linkTo, fmtDate, useLang, useMediaQuery } from "@/lib/hooks";
import { useView } from "@/store";
import { RiskMap } from "@/components/map/RiskMap";
import { lensColor, lensTip, LensLegend, rev } from "@/components/map/lens";
export { lensColor, lensTip, LensLegend } from "@/components/map/lens";
import { ConfidenceBadge, DataTable, ErrorState, Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { LayerPanel } from "@/components/map/LayerPanel";
import { DayScrubber } from "@/components/map/DayScrubber";
import { MigrationStrip } from "@/components/map/MigrationStrip";
import { Hotspots } from "@/components/map/Hotspots";
import { Investigation } from "@/components/map/Investigation";
import { basemapOf, type BasemapId } from "@/components/map/basemaps";
import { footprints } from "@/lib/spatial";
import { LENSES, type Lens } from "@/theme/scales";
import { cn } from "@/lib/utils";

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

let adjCache: Record<string, number[]> | null = null;
function useAdjacency() {
  const [a, setA] = useState(adjCache);
  useEffect(() => { if (!a) void fetch("/geo/adjacency.json").then((r) => r.json()).then((j) => { adjCache = j; setA(j); }); }, [a]);
  return a;
}

/** PURVA-NETRA Spatial Intelligence Console — consumes existing predictions only. */
export default function MapPage() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { init } = useInit();
  const m = useMatrix(init);
  const regions = useRegionMap();
  const adjacency = useAdjacency();
  const v = useView();
  const day = Math.min(10, Math.max(1, Number(v.get("day") ?? 1)));
  const lens = (LENSES.some((l) => l.id === v.get("layer")) ? v.get("layer") : "pbust") as Lens;
  const split = v.get("split") === "1";
  const wide = useMediaQuery("(min-width: 1024px)");
  const phoneQ = useMediaQuery("(max-width: 639px)");
  // defaults by screen size (desktop: both open · tablet: collapsed · phone: stacked); URL always wins
  const layersOpen = v.get("layers") === "1" || (v.get("layers") !== "0" && wide);
  const panel = v.get("panel") === "1" || (v.get("panel") !== "0" && (wide || phoneQ));
  const table = v.get("view") === "table";
  const fs = v.get("fs") === "1";
  const mig = v.get("mig") === "1";
  const fpOn = v.get("fp") === "1";
  const evOn = v.get("ev") !== "0";
  const basemap = basemapOf(v.get("basemap")).id;
  const ptab = v.get("ptab") ?? (v.get("rid") != null ? "investigate" : "hotspots");
  const sel = v.get("rid") != null ? Number(v.get("rid")) : undefined;
  const [ptState, setPt] = useState<{ x: number; y: number } | null>(null);
  const pt = ptState;
  const [focusRid, setFocusRid] = useState<number | undefined>(undefined);
  const [bmError, setBmError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const sync = useRef<MLMap[]>([]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const phone = phoneQ;

  useEffect(() => { setBmError(false); }, [basemap]);
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
      if (e.key === "Escape" && new URLSearchParams(window.location.search).get("fs") === "1" && !document.querySelector("[data-testid=region-popover]")) v.set({ fs: undefined });
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [setDay, v]);

  const colorOf = useMemo(() => lensColor(lens, theme), [lens, theme]);
  const tipOf = useMemo(() => lensTip(lens), [lens]);
  const rainOf = useMemo(() => lensColor("rain", theme, true), [theme]);
  const rainTip = useMemo(() => lensTip("rain"), []);
  const pOf = useMemo(() => lensColor("pbust", theme), [theme]);
  const pTip = useMemo(() => lensTip("pbust"), []);
  const cells = m.data;
  const dayCells = useMemo(() => (cells ?? []).filter((c) => c.lead === day), [cells, day]);
  const fpRids = useMemo(() => (fpOn && adjacency ? footprints(dayCells, adjacency).filter((f) => f.rids.length > 0).flatMap((f) => f.rids) : []), [fpOn, adjacency, dayCells]);

  if (m.isLoading || !init) return <Loading />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  const allCells = cells!;
  const selCell = sel != null ? dayCells.find((c) => c.rid === sel) : undefined;
  const openPanel = wide || phone ? undefined : 1;             // tablet: clicking a region opens the analysis overlay
  const select = (rid: number, p: { x: number; y: number }) => { v.set({ rid, ptab: "investigate", panel: openPanel, layers: wide ? v.get("layers") : 0 }); setPt(p); };
  const pick = (rid: number) => { v.set({ rid, ptab: "investigate", panel: openPanel }); setFocusRid(rid); setPt(null); };
  const validDate = fmtDate(dayCells[0]?.valid_date);
  const bm = basemapOf(basemap);
  const mapProps = { basemap: basemap as BasemapId, footprintRids: fpRids, evidenceVisible: evOn, onBasemapError: () => setBmError(true), focusRid };

  const layerPanel = (
    <LayerPanel basemap={basemap} onBasemap={(b) => v.set({ basemap: b === "minimal" ? undefined : b })} lens={lens} onLens={(l) => v.set({ layer: l })}
      evidenceOn={evOn} onEvidence={(b) => v.set({ ev: b ? undefined : 0 })} footprintOn={fpOn} onFootprint={(b) => v.set({ fp: b ? 1 : undefined })}
      theme={theme} cells={allCells} basemapError={bmError} day={day} validDate={validDate} split={split} />
  );
  const rightPanel = (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="Analysis panel">
        {[["hotspots", "Risk hotspots"], ["investigate", "Investigate"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={ptab === k} data-testid={`ptab-${k}`} onClick={() => v.set({ ptab: k })}
            className={cn("flex-1 rounded px-2 py-1", ptab === k ? "bg-foreground text-background" : "hover:bg-accent")}>{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ptab === "investigate" && sel != null ? (
          <Investigation rid={sel} name={regions.get(sel)?.name ?? ""} day={day} init={init} cells={allCells} onDay={setDay}
            onClose={() => { v.set({ rid: undefined, ptab: "hotspots" }); setPt(null); }} />
        ) : ptab === "investigate" ? (
          <p className="panel panel-sec text-xs text-muted-foreground" data-testid="inv-empty">Click a subdivision on the map or a hotspot to investigate it.</p>
        ) : (
          <div className="panel panel-sec"><Hotspots dayCells={dayCells} regions={regions} adjacency={adjacency} selected={sel} onPick={pick} day={day} /></div>
        )}
      </div>
    </div>
  );

  return (
    <div data-testid="map-console" data-fullscreen={fs ? "1" : "0"}
      className={cn("flex flex-col gap-2", fs ? "fixed inset-0 z-50 bg-background p-2" : phone ? "" : "h-[calc(100svh-var(--hdr,48px)-1.25rem)]")}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map toolbar">
        <h1 className="text-sm font-semibold">Spatial Intelligence</h1>
        <Button size="icon" variant="ghost" aria-pressed={layersOpen} aria-label={layersOpen ? "Hide layer panel" : "Show layer panel"} data-testid="layers-toggle"
          onClick={() => v.set({ layers: layersOpen ? 0 : 1, panel: !wide && !layersOpen ? 0 : v.get("panel") })}>{layersOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}</Button>
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
        <Button size="sm" variant="outline" aria-pressed={table} onClick={() => v.set({ view: table ? undefined : "table" })} data-testid="table-toggle">
          <Table2 className="size-4" aria-hidden />{table ? t("common.chart_view") : t("common.table_view")}
        </Button>
        <Button size="sm" variant={mig ? "default" : "outline"} aria-pressed={mig} data-testid="migration-toggle" onClick={() => v.set({ mig: mig ? undefined : 1 })}>
          <Film className="size-4" aria-hidden />Migration
        </Button>
        <span className="text-[11px] text-muted-foreground">basemap: {bm.label}{bm.network ? " (context)" : ""}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" aria-pressed={fs} data-testid="fullscreen-toggle" onClick={() => v.set({ fs: fs ? undefined : 1 })}>
            {fs ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}{fs ? "Exit full screen" : "Full screen"}
          </Button>
          <Button size="icon" variant="ghost" aria-pressed={panel} aria-label={panel ? "Collapse side panel" : "Expand side panel"} data-testid="panel-toggle"
            onClick={() => v.set({ panel: panel ? 0 : 1, layers: !wide && !panel ? 0 : v.get("layers") })}>{panel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</Button>
        </div>
      </div>

      <div className={cn("relative flex gap-2", phone ? "flex-col" : "min-h-0 flex-1")}>
        {layersOpen && (
          <aside className={cn("panel shrink-0 overflow-auto p-3", phone ? "order-3" : "absolute left-0 top-0 z-30 max-h-[70%] w-72 shadow-lg lg:static lg:max-h-none lg:w-64 lg:shadow-none")}
            aria-label="Layers and legend">{layerPanel}</aside>
        )}
        <div className={cn("relative flex min-w-0 flex-1 flex-col gap-2", !phone && "min-h-0")}>
          {table ? (
            <div className="panel flex-1 overflow-auto">
              <DataTable
                cols={[
                  { key: "rid", label: t("common.region"), fmt: (x) => prettyName(regions.get(x as number)?.name) },
                  { key: "p_bust", label: "P(bust)", fmt: (x) => pct(x as number, 1) },
                  { key: "p_bust_prev", label: "P(bust) prev. cycle", fmt: (x) => pct(x as number, 1) },
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
            <div className={cn("flex gap-2", phone ? "h-[55svh]" : "min-h-0 flex-1")} data-testid="split-maps">
              <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs font-medium">Forecast Rain</span>
                <RiskMap cells={allCells} day={day} layer="rain" theme={theme} syncRef={sync} selected={sel} onSelect={select} colorOf={rainOf} tipOf={rainTip} label={`Forecast rain map, day ${day}`} {...mapProps} /></div>
              <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs font-medium">P(Bust)</span>
                <RiskMap cells={allCells} day={day} layer="pbust" theme={theme} syncRef={sync} selected={sel} onSelect={select} colorOf={pOf} tipOf={pTip} label={`P(bust) map, day ${day}`} {...mapProps} /></div>
            </div>
          ) : (
            <div className={cn("relative", phone ? "h-[55svh]" : "min-h-0 flex-1")} data-testid="hero-map">
              <RiskMap cells={allCells} day={day} layer={lens} theme={theme} selected={sel} onSelect={select} colorOf={colorOf} tipOf={tipOf}
                label={`${LENSES.find((l) => l.id === lens)!.label} map, day ${day}. ${t("map.click_hint")}`} {...mapProps} />
              {lens === "regime" && (
                <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded border bg-card/90 px-3 py-1 text-sm" data-testid="regime-na">
                  Regime: Not available in this model version
                </div>
              )}
              {!layersOpen && (
                <div className="pointer-events-none absolute bottom-8 left-2 w-64 rounded border bg-card/90 p-2" data-testid="lens-legend-float">
                  <LensLegend lens={lens} theme={theme} cells={allCells} />
                </div>
              )}
            </div>
          )}
          {sel != null && pt && !table && (
            <Popover cell={selCell} name={prettyName(regions.get(sel)?.name)} x={pt.x} y={pt.y + 40} day={day}
              onClose={() => setPt(null)} />
          )}
          <DayScrubber cells={allCells} day={day} onDay={setDay} playing={playing} onPlay={() => { if (day >= 10) setDay(1); setPlaying(!playing); }} />
          {mig && <MigrationStrip cells={allCells} day={day} onDay={setDay} theme={theme} />}
        </div>

        {panel && (
          <div className={cn("shrink-0", phone ? "order-2" : "absolute right-0 top-0 z-30 h-full w-[22rem] shadow-lg lg:static lg:h-auto lg:w-80 lg:shadow-none xl:w-96")}
            data-testid="side-panel">{rightPanel}</div>
        )}
      </div>
    </div>
  );
}
