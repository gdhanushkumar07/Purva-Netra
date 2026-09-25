import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, ExpressionSpecification, MapLayerMouseEvent, GeoJSONSourceSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre v6 ships its worker as a separate module; point it at the bundled (offline) copy.
maplibregl.setWorkerUrl(workerUrl);
import type { Cell } from "@/api/client";
import {
  pbustColor, seqColor, RAIN_EDGES, SEQ_BLUE, SEQ_BLUE_DARK, SEQ_ORANGE, SEQ_ORANGE_DARK, SPREAD_EDGES, type Theme,
} from "@/theme/scales";

export type Layer = "pbust" | "rain" | "spread" | "novelty";
const GEO = "/geo/imd_subdivisions.geojson";
let geoCache: GeoJSONSourceSpecification["data"] | null = null;
const loadGeo = async () => (geoCache ??= await (await fetch(GEO)).json());

export function colorFor(c: Cell | undefined, layer: Layer, theme: Theme, orange = false) {
  if (!c || c.p_bust == null) return theme === "dark" ? "#262625" : "#e8e7e1";
  const ramp = orange ? (theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE) : theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE;
  if (layer === "pbust") return pbustColor(c.p_bust, theme);
  if (layer === "rain") return seqColor(c.f_rain, RAIN_EDGES, ramp);
  if (layer === "spread") return seqColor(c.spread_anom, SPREAD_EDGES, ramp);
  return seqColor(c.novelty ?? null, [0.5, 1, 1.5, 2, 2.5, 3, 1e9], ramp);
}

/** Choropleth of the 36 subdivisions; no basemap tiles (fully offline). */
export function RiskMap({
  cells, day, layer, theme, onSelect, selected, orange = false, syncRef, label,
}: {
  cells: Cell[]; day: number; layer: Layer; theme: Theme; onSelect?: (rid: number) => void; selected?: number;
  orange?: boolean; syncRef?: React.MutableRefObject<MLMap[]>; label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(0);  // increments per loaded map instance

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": theme === "dark" ? "#1a1a19" : "#fcfcfb" } }] },
      bounds: [[67.5, 6], [98, 37.5]],
      fitBoundsOptions: { padding: 12 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Boundaries: IMD" }));
    map.current = m;
    if (syncRef) syncRef.current.push(m);
    setReady(0);
    m.on("load", async () => {
      const data = await loadGeo();
      if (map.current !== m) return;          // StrictMode / theme change: this instance was replaced
      m.addSource("sd", { type: "geojson", data, promoteId: "rid" });
      m.addLayer({ id: "fill", type: "fill", source: "sd", paint: { "fill-color": "#ccc", "fill-opacity": 1 } });
      m.addLayer({ id: "line", type: "line", source: "sd", paint: { "line-color": theme === "dark" ? "#1a1a19" : "#fcfcfb", "line-width": 1 } });
      m.addLayer({ id: "sel", type: "line", source: "sd", paint: { "line-color": theme === "dark" ? "#ffffff" : "#0b0b0b", "line-width": 2.5 }, filter: ["==", ["get", "rid"], -1] });
      m.on("click", "fill", (e) => { const rid = e.features?.[0]?.properties?.rid; if (rid != null) onSelect?.(Number(rid)); });
      m.on("mouseenter", "fill", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "fill", () => (m.getCanvas().style.cursor = ""));
      setReady((n) => n + 1);
    });
    if (syncRef) {
      m.on("move", () => {
        for (const o of syncRef.current) if (o !== m && !o.isMoving()) o.jumpTo({ center: m.getCenter(), zoom: m.getZoom() });
      });
    }
    return () => {
      if (syncRef) syncRef.current = syncRef.current.filter((x) => x !== m);
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // popup tooltip
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("fill")) return;
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "text-xs" });
    const byRid = new Map(cells.filter((c) => c.lead === day).map((c) => [c.rid, c]));
    const move = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const c = byRid.get(Number(f.properties?.rid));
      const v = !c || c.p_bust == null ? "Not assessed (no IMD land cells)"
        : layer === "pbust" ? `P(bust) ${(c.p_bust * 100).toFixed(0)}% · ${c.confidence}`
        : layer === "rain" ? `Forecast ${c.f_rain?.toFixed(1)} mm`
        : layer === "spread" ? `Spread ${c.spread_anom?.toFixed(2)}× normal` : `Novelty ${c.novelty?.toFixed(2) ?? "n/a"}`;
      pop.setLngLat(e.lngLat).setHTML(`<strong>${f.properties?.name}</strong><br/>Day ${day}: ${v}`).addTo(m);
    };
    const leave = () => pop.remove();
    m.on("mousemove", "fill", move);
    m.on("mouseleave", "fill", leave);
    return () => { m.off("mousemove", "fill", move); m.off("mouseleave", "fill", leave); pop.remove(); };
  }, [cells, day, layer, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("fill")) return;
    const byRid = new Map(cells.filter((c) => c.lead === day).map((c) => [c.rid, c]));
    const expr: unknown[] = ["match", ["get", "rid"]];
    for (let rid = 0; rid < 36; rid++) expr.push(rid, colorFor(byRid.get(rid), layer, theme, orange));
    expr.push(theme === "dark" ? "#262625" : "#e8e7e1");
    m.setPaintProperty("fill", "fill-color", expr as ExpressionSpecification);
    m.setFilter("sel", ["==", ["get", "rid"], selected ?? -1]);
  }, [cells, day, layer, theme, ready, selected, orange]);

  return <div ref={el} className="h-full min-h-80 w-full rounded-lg border" role="application" aria-label={label} />;
}
