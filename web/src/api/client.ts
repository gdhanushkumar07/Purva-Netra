import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Band } from "@/theme/scales";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}

export interface Health {
  status: string;
  mode: "REPLAY" | "NEAR-REAL-TIME";
  model_version: string | null;
  model_meta: { kind?: string; threshold_meta?: { years: number[] } };
  first_cycle: string | null;
  last_cycle: string | null;
  n_cycles: number;
  git: string | null;
  server_time: string;
}
export interface Region { rid: number; name: string; zone: string; STATE: string }
export interface Cell {
  rid: number; lead: number; valid_date: string; p_bust: number | null; confidence: Band;
  hi_risk: boolean | null; hi_type_fcst: string; novelty: number | null; change_vs_prev: number | null;
  top_reason_en: string | null; top_reason_hi: string | null; f_rain: number | null; spread_anom: number | null;
  regime: string | null; err_q90: number | null; obs_lo_mm: number | null; obs_hi_mm: number | null;
  // replay only (truth, revealed day by day)
  o_rain?: number | null; bust?: number | null; outcome?: Outcome | null; p_b2?: number | null;
}
export type Outcome = "hit" | "miss" | "false_alarm" | "correct_negative";
export interface Brief {
  init: string;
  counts: { low_regions: number; low_cells: number; heavy_risk_regions: number; most_uncertain_day: number | null;
    assessed_regions: number; total_regions: number };
  top_risks: (Pick<Cell, "rid" | "lead" | "p_bust" | "confidence" | "hi_risk" | "top_reason_en" | "top_reason_hi"> & { name: string; zone: string })[];
  biggest_changes: { rid: number; name: string; lead: number; p_bust: number; change_vs_prev: number; confidence: Band }[];
  regime: string | null;
}
export interface RegionDay {
  lead: number; valid_date: string; p_bust: number | null; p_b0: number | null; p_b2: number | null; confidence: Band;
  f_rain: number | null; ens_mean: number | null; ens_q10: number | null; ens_q90: number | null;
  err_q50: number | null; err_q90: number | null; obs_lo_mm: number | null; obs_hi_mm: number | null;
  spread_anom: number | null; novelty: number | null; hi_risk: boolean | null; hi_type_fcst: string;
  regime: string | null; rev12: number | null; ffi4: number | null;
}
export interface RegionResp { rid: number; name: string; zone: string; days: RegionDay[] }
export interface Analog { init: string; lead?: number; f_rain?: number; o_rain?: number; log_err: number; bust: number; dist?: number; similarity?: number }
export interface Explain {
  reasons_en: string[]; reasons_hi: string[]; groups: string[]; source: "shap" | "rule";
  contrib: Record<string, number>; analogs: Analog[]; regime: string | null;
  spread_anom: number | null; novelty: number | null; p_bust: number | null; confidence: Band; }
export interface RevRow { init: string; lead: number; f_rain: number; ens_mean: number; ens_q10: number; ens_q90: number;
  p_bust: number | null; rev12: number | null; ffi4: number | null }
export interface VerifyRow { lead: number; valid_date: string; f_rain: number; o_rain: number | null; abs_err_mm: number | null;
  log_err: number | null; thr: number | null; bust: number | null; p_bust: number | null; confidence: Band;
  hi_bust: number | null; outcome: Outcome | null }
export interface Contingency { season: string; event: string;
  by_lead: { lead: number; n: number; n_obs_events: number; n_fcst_events: number; pod: number | null; far: number | null; csi: number | null; ets: number | null }[] }
export interface VerifyResp { days: VerifyRow[]; contingency: Contingency }
export interface EventCase { id: string; name: string; init: string; regions: string[]; split: string; available: boolean }
export interface ReplayResp { event: { id: string; name: string }; init: string; cells: Cell[];
  ticker: { day: number; hits: number; misses: number; false_alarms: number; n: number; brier: number | null; brier_b2: number | null }[] }
export interface Ledger {
  available: boolean; version: string; reason?: string;
  split?: string; years?: number[]; gate?: { passed: boolean; text: string };
  headline?: string;
  reliability?: { bin_lo: number; bin_hi: number; n: number; mean_p: number | null; obs_freq: number | null }[];
  skill_by_lead?: { lead: number; model: string; bss_vs_b0: number; lo: number; hi: number }[];
  scores?: Record<string, Record<string, number>>;
  shipped?: string;
}

const opts = { staleTime: 5 * 60_000, placeholderData: keepPreviousData } as const;
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => get<Health>("/health"), staleTime: 30_000 });
export const useRegions = () => useQuery({ queryKey: ["regions"], queryFn: () => get<Region[]>("/regions"), staleTime: Infinity });
export const useCycles = () => useQuery({ queryKey: ["cycles"], queryFn: () => get<{ init: string }[]>("/cycles"), staleTime: 60_000 });
export const useMatrix = (init?: string) =>
  useQuery({ queryKey: ["matrix", init], queryFn: () => get<Cell[]>(`/matrix?init=${init}`), enabled: !!init, ...opts });
export const useBrief = (init?: string) =>
  useQuery({ queryKey: ["brief", init], queryFn: () => get<Brief>(`/brief?init=${init}`), enabled: !!init, ...opts });
export const useRegion = (rid?: number, init?: string) =>
  useQuery({ queryKey: ["region", rid, init], queryFn: () => get<RegionResp>(`/region/${rid}?init=${init}`), enabled: rid != null && !!init, ...opts });
export const useExplain = (rid?: number, init?: string, lead?: number) =>
  useQuery({ queryKey: ["explain", rid, init, lead], queryFn: () => get<Explain>(`/explain/${rid}?init=${init}&lead=${lead}`), enabled: rid != null && !!init && !!lead, ...opts });
export const useRevision = (rid?: number, valid?: string, upto?: string) =>
  useQuery({ queryKey: ["revision", rid, valid, upto], queryFn: () => get<RevRow[]>(`/revision/${rid}?valid=${valid}&upto=${upto}`), enabled: rid != null && !!valid, ...opts });
export const useVerify = (rid?: number, init?: string) =>
  useQuery({ queryKey: ["verify", rid, init], queryFn: () => get<VerifyResp>(`/verify/${rid}?init=${init}`), enabled: rid != null && !!init, ...opts });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: () => get<EventCase[]>("/events") });
export const useReplay = (ev?: string) =>
  useQuery({ queryKey: ["replay", ev], queryFn: () => get<ReplayResp>(`/replay/${encodeURIComponent(ev!)}`), enabled: !!ev, ...opts });
export const useLedger = () => useQuery({ queryKey: ["ledger"], queryFn: () => get<Ledger>("/ledger") });
