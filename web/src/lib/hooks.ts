import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCycles, useRegions, type Region } from "@/api/client";
import { useSettings, useView } from "@/store";
import type { Theme } from "@/theme/scales";

export function useResolvedTheme(): Theme {
  const theme = useSettings((s) => s.theme);
  const [sys, setSys] = useState<Theme>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    const f = () => setSys(m.matches ? "dark" : "light");
    m?.addEventListener("change", f);
    return () => m?.removeEventListener("change", f);
  }, []);
  return theme === "system" ? sys : theme;
}

/** Current cycle from ?init=, else the latest cycle in the replay store. */
export function useInit() {
  const { get, set } = useView();
  const cycles = useCycles();
  const list = cycles.data?.map((c) => c.init) ?? [];
  const init = get("init") ?? list[list.length - 1];
  const idx = init ? list.indexOf(init) : -1;
  return {
    init,
    cycles: list,
    loading: cycles.isLoading,
    error: cycles.error,
    prev: idx > 0 ? list[idx - 1] : undefined,
    next: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : undefined,
    setInit: (v: string) => set({ init: v }),
  };
}

export function useRegionMap() {
  const r = useRegions();
  return useMemo(() => new Map<number, Region>((r.data ?? []).map((x) => [x.rid, x])), [r.data]);
}

export const ZONE_ORDER = ["NW", "Central", "East & NE", "South", "Islands"];

export const pct = (p: number | null | undefined, d = 0) => (p == null || Number.isNaN(p) ? "–" : `${(p * 100).toFixed(d)}%`);
export const pts = (d: number | null | undefined) =>
  d == null ? "–" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d * 100).toFixed(0)} pts`;
export const mm = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? "–" : `${v.toFixed(d)} mm`);

export function fmtInit(s?: string) {
  if (!s) return "–";
  const d = new Date(s + "Z");
  return `${String(d.getUTCHours()).padStart(2, "0")} UTC ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}
export function fmtDate(s?: string) {
  if (!s) return "–";
  const d = new Date(s + "Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

/** Title-case IMD subdivision names for display ("GANGETIC WEST BENGAL" → "Gangetic West Bengal"). */
export function prettyName(n?: string) {
  if (!n) return "";
  const keep = new Set(["A", "N", "M", "T", "SHWB", "S.", "I.", "N.", "HAR.", "CHD"]);
  return n
    .split(" ")
    .map((w) => (keep.has(w) || w.length <= 2 ? w.replace("&", "&") : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
}

export function useLang() {
  const { i18n } = useTranslation();
  return (i18n.language as "en" | "hi") ?? "en";
}

/** Build a link to `path` carrying the current cycle (init) plus a patch of view params. */
export function linkTo(path: string, patch: Record<string, string | number | undefined> = {}, keep = ["init"]) {
  const cur = new URLSearchParams(window.location.search);
  const n = new URLSearchParams();
  for (const k of keep) { const v = cur.get(k); if (v) n.set(k, v); }
  for (const [k, v] of Object.entries(patch)) if (v != null) n.set(k, String(v));
  const s = n.toString();
  return s ? `${path}?${s}` : path;
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}
