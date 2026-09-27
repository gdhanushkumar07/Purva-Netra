import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layers, PanelRightClose, PanelRightOpen, Columns2, Table2, X, Maximize2, Minimize2, Film } from "lucide-react";
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
import { BasemapMenu, MapLegend, InfoTip } from "@/components/map/controls";
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

/** PURVA-NETRA Spatial Intelligence Console — map first, evidence second, controls third. */
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
  const phone = useMediaQuery("(max-width: 639px)");
  // layer drawer: closed by default everywhere (URL layers=1 opens it); analysis panel: open on desktop/phone
  const layersOpen = v.get("layers") === "1";
  const panel = v.get("panel") === "1" || (v.get("panel") !== "0" && (wide || phone));
  const table = v.get("view") === "table";
  const fs = v.get("fs") === "1";
  const mig = v.get("mig") === "1";
  const fpOn = v.get("fp") === "1" || mig;                 // migration view shows the footprint evolution
  const evOn = v.get("ev") !== "0";
  const basemap = basemapOf(v.get("basemap")).id;
  const ptab = v.get("ptab") ?? (v.get("rid") != null ? "investigate" : "hotspots");
  const sel = v.get("rid") != null ? Number(v.get("rid")) : undefined;
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  const [focusRid, setFocusRid] = useState<number | undefined>(undefined);
  const [bmError, setBmError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const sync = useRef<MLMap[]>([]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
  const togglePlay = useCallback(() => {
    const d = Number(new URLSearchParams(window.location.search).get("day") ?? 1);
    setPlaying((p) => { if (!p && d >= 10) setDay(1); return !p; });
  }, [setDay]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;       // target may be window/document
      if (el && (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(el.tagName) && e.key === " ")) return;
      if (el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.getAttribute("role") === "slider" || el.isContentEditable)) return;
      const d = Number(new URLSearchParams(window.location.search).get("day") ?? 1);
      if (e.key === "ArrowRight") { e.preventDefault(); setDay(d + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); setDay(d - 1); }
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "Escape" && new URLSearchParams(window.location.search).get("fs") === "1" && !document.querySelector("[data-testid=region-popover]")) v.set({ fs: undefined });
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [setDay, v, togglePlay]);
  // migration view: play D1 → D10 once when it is switched on
  const migPrev = useRef(mig);
  useEffect(() => { if (mig && !migPrev.current) { setDay(1); setPlaying(true); } migPrev.current = mig; }, [mig, setDay]);

  const colorOf = useMemo(() => lensColor(lens, theme), [lens, theme]);
  const tipOf = useMemo(() => lensTip(lens), [lens]);
  const rainOf = useMemo(() => lensColor("rain", theme, true), [theme]);
  const rainTip = useMemo(() => lensTip("rain"), []);
  const pOf = useMemo(() => lensColor("pbust", theme), [theme]);
  const pTip = useMemo(() => lensTip("pbust"), []);
  const cells = m.data;
  const dayCells = useMemo(() => (cells ?? []).filter((c) => c.lead === day), [cells, day]);
  const fpRids = useMemo(() => (fpOn && adjacency ? footprints(dayCells, adjacency).flatMap((f) => f.rids) : []), [fpOn, adjacency, dayCells]);

  if (m.isLoading || !init) return <Loading />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  const allCells = cells!;
  const selCell = sel != null ? dayCells.find((c) => c.rid === sel) : undefined;
  const openPanel = wide || phone ? undefined : 1;             // tablet: selecting a region opens the analysis overlay
  const select = (rid: number, p: { x: number; y: number }) => { v.set({ rid, ptab: "investigate", panel: openPanel, layers: wide ? v.get("layers") : undefined }); setPt(p); };
  const pick = (rid: number) => { v.set({ rid, ptab: "investigate", panel: openPanel }); setFocusRid(rid); setPt(null); };
  const validDate = fmtDate(dayCells[0]?.valid_date);
  const bm = basemapOf(basemap);
  const mapProps = { basemap: basemap as BasemapId, footprintRids: fpRids, evidenceVisible: evOn, onBasemapError: () => setBmError(true), focusRid };
  const lensBtn = (id: Lens, primary: boolean) => {
    const L = LENSES.find((l) => l.id === id)!;
    const on = lens === id && !split;
    return (
      <button key={id} type="button" role="radio" aria-checked={lens === id} disabled={split} data-testid={`lens-${id}`} onClick={() => v.set({ layer: id })}
        className={cn("rounded px-2.5 py-1", primary ? "text-xs font-medium" : "text-[11px] text-muted-foreground",
          on ? "bg-foreground text-background" : "hover:bg-accent hover:text-foreground", split && "opacity-50")}>{L.label}</button>
    );
  };
  const quiet = "h-7 gap-1 px-2 text-xs";

  const rightPanel = (
    <div className="panel flex h-full min-h-0 flex-col">
      <div className="flex border-b text-[11px] font-semibold uppercase tracking-wider" role="tablist" aria-label="Analysis panel">
        {[["hotspots", "Hotspots"], ["investigate", "Investigate"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={ptab === k} data-testid={`ptab-${k}`} onClick={() => v.set({ ptab: k })}
            className={cn("flex-1 border-b-2 px-2 py-2", ptab === k ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ptab === "investigate" && sel != null ? (
          <Investigation rid={sel} name={regions.get(sel)?.name ?? ""} day={day} init={init} cells={allCells} onDay={setDay}
            onClose={() => { v.set({ rid: undefined, ptab: "hotspots" }); setPt(null); }} />
        ) : ptab === "investigate" ? (
          <p className="p-3 text-xs text-muted-foreground" data-testid="inv-empty">Click a subdivision on the map, or a hotspot, to investigate it.</p>
        ) : (
          <div className="p-3"><Hotspots dayCells={dayCells} regions={regions} adjacency={adjacency} selected={sel} onPick={pick} day={day} footprintOn={fpOn} /></div>
        )}
      </div>
    </div>
  );

  const tableView = (
    <div className="panel min-h-0 flex-1 overflow-auto" data-testid="map-table">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card"><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          {["Region", "P(Bust)", "Forecast rain", "Spread", "Confidence", "Day"].map((h) => <th key={h} scope="col" className="border-b px-3 py-1.5 font-medium">{h}</th>)}
        </tr></thead>
        <tbody className="tnum">
          {[...dayCells].sort((a, b) => (b.p_bust ?? -1) - (a.p_bust ?? -1)).map((c) => (
            <tr key={c.rid} onClick={() => pick(c.rid)} aria-selected={sel === c.rid} data-testid={`trow-${c.rid}`}
              className={cn("cursor-pointer border-b border-border/50 hover:bg-accent", sel === c.rid && "bg-accent")}>
              <td className="px-3 py-1"><button type="button" className="text-left" onClick={() => pick(c.rid)}>{prettyName(regions.get(c.rid)?.name)}</button></td>
              <td className="px-3 font-semibold">{pct(c.p_bust, 1)}</td>
              <td className="px-3">{mm(c.f_rain)}</td>
              <td className="px-3">{c.spread_anom == null ? "–" : `${c.spread_anom.toFixed(2)}×`}</td>
              <td className="px-3">{c.confidence}</td>
              <td className="px-3">D{day}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div data-testid="map-console" data-fullscreen={fs ? "1" : "0"}
      className={cn("flex flex-col", fs ? "fixed inset-0 z-50 bg-background p-2" : phone ? "gap-2" : "h-[calc(100svh-var(--hdr,48px)-1.25rem)]")}>
      {/* toolbar: layers (primary / secondary) · view · spatial · utility */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2" role="toolbar" aria-label="Map toolbar">
        <h1 className="sr-only">{t("map.title")}</h1>
        <Button size="sm" variant={layersOpen ? "secondary" : "ghost"} className={quiet} aria-pressed={layersOpen} data-testid="layers-toggle"
          onClick={() => v.set({ layers: layersOpen ? undefined : 1 })}><Layers className="size-4" aria-hidden />Layers</Button>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Trust Lens" data-testid="lens-switcher">
          <div className="flex rounded-md border p-0.5">{(["pbust", "rain", "spread"] as Lens[]).map((id) => lensBtn(id, true))}</div>
          <div className="flex">{(["novelty", "revision", "regime"] as Lens[]).map((id) => lensBtn(id, false))}</div>
        </div>
        <span className="h-5 w-px bg-border" aria-hidden />
        <div className="flex items-center">
          <Button size="sm" variant={split ? "secondary" : "ghost"} className={quiet} aria-pressed={split} data-testid="split-toggle" onClick={() => v.set({ split: split ? undefined : 1 })}>
            <Columns2 className="size-3.5" aria-hidden />Split</Button>
          <Button size="sm" variant={table ? "secondary" : "ghost"} className={quiet} aria-pressed={table} data-testid="table-toggle" onClick={() => v.set({ view: table ? undefined : "table" })}>
            <Table2 className="size-3.5" aria-hidden />{table ? t("common.chart_view") : "Table"}</Button>
          <Button size="sm" variant={mig ? "secondary" : "ghost"} className={quiet} aria-pressed={mig} data-testid="migration-toggle" onClick={() => v.set({ mig: mig ? undefined : 1 })}>
            <Film className="size-3.5" aria-hidden />Migration</Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <BasemapMenu value={basemap} onChange={(b) => v.set({ basemap: b === "minimal" ? undefined : b })} />
          <Button size="sm" variant="ghost" className={quiet} aria-pressed={fs} data-testid="fullscreen-toggle" onClick={() => v.set({ fs: fs ? undefined : 1 })}
            aria-label={fs ? "Exit full screen" : "Full screen"}>{fs ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}{fs ? "Exit" : ""}</Button>
          <Button size="icon" variant="ghost" className="size-7" aria-pressed={panel} aria-label={panel ? "Collapse analysis panel" : "Expand analysis panel"} data-testid="panel-toggle"
            onClick={() => v.set({ panel: panel ? 0 : 1 })}>{panel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</Button>
        </div>
      </div>

      <div className={cn("relative flex gap-2", phone ? "flex-col" : "min-h-0 flex-1")}>
        {layersOpen && (
          <aside className={cn("panel shrink-0 overflow-auto p-3", phone ? "order-3" : "absolute left-2 top-2 z-30 max-h-[calc(100%-1rem)] w-60 shadow-lg")}
            aria-label="Layer drawer">
            <LayerPanel lens={lens} onLens={(l) => v.set({ layer: l })} evidenceOn={evOn} onEvidence={(b) => v.set({ ev: b ? undefined : 0 })}
              footprintOn={fpOn} onFootprint={(b) => v.set({ fp: b ? 1 : undefined })} cells={allCells} split={split} />
          </aside>
        )}
        <div className={cn("panel relative flex min-w-0 flex-1 flex-col overflow-hidden", !phone && "min-h-0")}>
          {table ? tableView : (
          <div className={cn("relative flex flex-col", phone ? "" : "min-h-0 flex-1")} data-testid="map-area">
          {split ? (
            <div className={cn("flex gap-px bg-border", phone ? "h-[55svh]" : "min-h-0 flex-1")} data-testid="split-maps">
              {[["Forecast Rain", "rain", rainOf, rainTip], ["P(Bust)", "pbust", pOf, pTip]].map(([label, layer, co, tp]) => (
                <div key={label as string} className="relative flex min-w-0 flex-1 flex-col bg-card">
                  <span className="absolute left-2 top-2 z-10 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{label as string}</span>
                  <RiskMap cells={allCells} day={day} layer={layer as Lens} theme={theme} syncRef={sync} selected={sel} onSelect={select}
                    colorOf={co as ReturnType<typeof lensColor>} tipOf={tp as ReturnType<typeof lensTip>} label={`${label} map, day ${day}`} {...mapProps} />
                </div>
              ))}
            </div>
          ) : (
            <div className={cn("relative", phone ? "h-[58svh]" : "min-h-0 flex-1")} data-testid="hero-map">
              <RiskMap cells={allCells} day={day} layer={lens} theme={theme} selected={sel} onSelect={select} colorOf={colorOf} tipOf={tipOf}
                label={`${LENSES.find((l) => l.id === lens)!.label} map, day ${day}. ${t("map.click_hint")}`} {...mapProps} />
              {lens === "regime" && (
                <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded border bg-card/90 px-3 py-1 text-xs" data-testid="regime-na">
                  Regime: Not available in this model version
                </div>
              )}
            </div>
          )}
              {bm.network && (
                <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" data-testid="context-chip">
                  {bm.label} · context only <InfoTip label="Basemap" text={`${bm.note} ${bm.attribution ?? ""}`} />
                </div>
              )}
              {bmError && bm.network && (
                <p role="status" className="absolute left-2 top-9 z-10 max-w-72 rounded border border-[#fab219] bg-card/95 px-2 py-1 text-[11px]" data-testid="basemap-error">
                  ▲ {bm.label} tiles unavailable (offline). Evidence layers are unaffected.
                </p>
              )}
              <div className={cn("absolute bottom-2 left-2 z-10", split && "hidden")}>
                <MapLegend lens={lens} theme={theme} cells={allCells} day={day} validDate={validDate} />
              </div>
              {sel != null && pt && (
                <Popover cell={selCell} name={prettyName(regions.get(sel)?.name)} x={pt.x} y={pt.y + 8} day={day} onClose={() => setPt(null)} />
              )}
          </div>
          )}
          {!table && mig && <div className="border-t"><MigrationStrip cells={allCells} day={day} onDay={setDay} theme={theme} /></div>}
          <DayScrubber cells={allCells} day={day} onDay={setDay} playing={playing} onPlay={togglePlay} />
        </div>

        {panel && (
          <div className={cn("shrink-0", phone ? "order-2 h-[70svh]" : "absolute right-2 top-2 z-30 h-[calc(100%-1rem)] w-80 shadow-lg lg:static lg:h-auto lg:w-[26%] lg:min-w-[300px] lg:max-w-[400px] lg:shadow-none")}
            data-testid="side-panel">{rightPanel}</div>
        )}
      </div>
    </div>
  );
}
