// Basemaps are CONTEXT ONLY — nothing here is an input to the model. Minimal/Light/Dark are built
// offline from the existing IMD geometry (graticule + dissolved outline). Satellite/Terrain are NASA GIBS
// Blue Marble tiles (public domain, attribution requested; no key) and need a network connection.
import type { Map as MLMap } from "maplibre-gl";
import type { Theme } from "@/theme/scales";

export type BasemapId = "minimal" | "light" | "dark" | "satellite" | "terrain";
export interface Basemap { id: BasemapId; label: string; network: boolean; note: string; attribution?: string; tiles?: string; dark: boolean }

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const BASEMAPS: Basemap[] = [
  { id: "minimal", label: "Minimal", network: false, dark: false, note: "Plain surface — evidence colours only (offline)." },
  { id: "light", label: "Light", network: false, dark: false, note: "Light surface with 5° graticule and India outline (offline, from IMD boundaries)." },
  { id: "dark", label: "Dark", network: false, dark: true, note: "Dark surface with 5° graticule and India outline (offline, from IMD boundaries)." },
  { id: "satellite", label: "Satellite", network: true, dark: true, note: "NASA Blue Marble true-colour composite. Context only — not used by the model.",
    attribution: "Imagery: NASA Blue Marble (GIBS)", tiles: `${GIBS}/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg` },
  { id: "terrain", label: "Terrain", network: true, dark: true, note: "NASA Blue Marble shaded relief + bathymetry. Context only — not used by the model.",
    attribution: "Relief: NASA Blue Marble (GIBS)", tiles: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg` },
];
export const basemapOf = (id?: string | null) => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];

let outlineCache: unknown = null;
const loadOutline = async () => (outlineCache ??= await (await fetch("/geo/india_outline.geojson")).json());

function graticule() {
  const f: unknown[] = [];
  for (let lon = 65; lon <= 100; lon += 5) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, 0], [lon, 40]] } });
  for (let lat = 5; lat <= 40; lat += 5) f.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[60, lat], [105, lat]] } });
  return { type: "FeatureCollection", features: f };
}

// light/dark: ocean tone distinct from the India land tint drawn from the dissolved IMD outline
const surface = (b: BasemapId, theme: Theme) =>
  b === "light" ? "#e9eef2" : b === "dark" ? "#0f1113" : b === "minimal" ? (theme === "dark" ? "#1a1a19" : "#fcfcfb") : "#0b0f16";

/** Apply a basemap beneath the evidence layers (ids "fill"/"line"/"sel"). Safe to call repeatedly. */
export async function applyBasemap(m: MLMap, id: BasemapId, theme: Theme, onTileError?: () => void) {
  const b = basemapOf(id);
  for (const l of ["bm-raster", "bm-land", "bm-grat", "bm-outline"]) if (m.getLayer(l)) m.removeLayer(l);
  for (const s of ["bm-raster", "bm-grat", "bm-outline"]) if (m.getSource(s)) m.removeSource(s);
  if (m.getLayer("bg")) m.setPaintProperty("bg", "background-color", surface(id, theme));
  const before = m.getLayer("fill") ? "fill" : undefined;
  if (b.tiles) {
    m.addSource("bm-raster", { type: "raster", tiles: [b.tiles], tileSize: 256, maxzoom: 8, attribution: b.attribution });
    // imagery is background: desaturated and dimmed over a dark surface so the evidence stays dominant
    m.addLayer({ id: "bm-raster", type: "raster", source: "bm-raster",
      paint: { "raster-opacity": 0.55, "raster-saturation": -0.55, "raster-contrast": -0.15, "raster-brightness-max": 0.8 } }, before);
    if (onTileError) {
      const h = (e: { sourceId?: string }) => { if (e.sourceId === "bm-raster") onTileError(); };
      m.on("error", h as never);
    }
  }
  if (id === "light" || id === "dark") {
    const ink = id === "dark" ? "#3a3a37" : "#d9d8d1";
    m.addSource("bm-grat", { type: "geojson", data: graticule() as never });
    m.addLayer({ id: "bm-grat", type: "line", source: "bm-grat", paint: { "line-color": ink, "line-width": 0.6, "line-dasharray": [2, 2] } }, before);
    m.addSource("bm-outline", { type: "geojson", data: (await loadOutline()) as never });
    if (m.getSource("bm-outline")) {
      m.addLayer({ id: "bm-land", type: "fill", source: "bm-outline", paint: { "fill-color": id === "dark" ? "#1c1c1b" : "#f7f6f2" } }, "bm-grat");
      m.addLayer({ id: "bm-outline", type: "line", source: "bm-outline", paint: { "line-color": id === "dark" ? "#6b6a64" : "#8a8983", "line-width": 1.4 } });
    }
  }
  // Evidence stays readable over imagery; the legend notes the reduced opacity.
  if (m.getLayer("fill")) m.setPaintProperty("fill", "fill-opacity", b.tiles ? 0.9 : 1);
  if (m.getLayer("line")) m.setPaintProperty("line", "line-width", b.tiles ? 1.2 : 1);
}
