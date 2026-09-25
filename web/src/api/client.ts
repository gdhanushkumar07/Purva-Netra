import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Band } from "@/theme/scales";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "same-origin", cache: "no-store" });   // freshness data must never come from the HTTP cache
  if (r.status === 401 || r.status === 403) throw new HttpError(r.status, (await r.text()) || String(r.status));
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, (data as { detail?: string }).detail ?? String(r.status));
  return data as T;
}

export interface Health {
  status: string;
  mode: "REPLAY" | "NEAR-REAL-TIME";
  model_version: string | null;
  model_meta: { kind?: string; threshold_meta?: { years: number[] } };
  model_kind?: string | null;
  model_bundle?: { version?: string; training_period?: string | null; calibration_period?: string | null;
    spec_training_period?: string | null; spec_calibration_period?: string | null; forecast_model?: string | null; note?: string | null };
  data_age_h?: number | null; freshness?: "fresh" | "stale" | "old" | "unknown" | "replay";
  last_update?: string | null; source?: string | null; api_version?: string;
  upstream?: { status: "reachable" | "unreachable" | "unknown"; checked_at: string | null; init: string | null };
  nrt_enabled?: boolean;
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
  f_rain_prev?: number | null; p_bust_prev?: number | null;
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
  spread_anom: number | null; novelty: number | null; p_bust: number | null; confidence: Band;
  group_contributions?: GroupContributions; }
export interface GroupContribution { group: EvidenceGroup; available: boolean; value: number | null; reason: string | null }
export type EvidenceGroup = "spread" | "revision" | "analogs" | "novelty" | "regime" | "state";
export interface GroupContributions { groups: GroupContribution[]; other_terms: Record<string, number>; units: string; source: string | null }
export interface RevRow { init: string; lead: number; f_rain: number; ens_mean: number; ens_q10: number; ens_q90: number;
  p_bust: number | null; rev12: number | null; ffi4: number | null; spread_anom?: number | null }
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
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => get<Health>("/health"), staleTime: 30_000, refetchInterval: 60_000 });
export const useRegions = () => useQuery({ queryKey: ["regions"], queryFn: () => get<Region[]>("/regions"), staleTime: Infinity });
export const useCycles = () => useQuery({ queryKey: ["cycles"], queryFn: () => get<{ init: string }[]>("/cycles"), staleTime: 60_000, refetchInterval: 120_000 });
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

// ---------------------------------------------------------------- auth
export type Role = "viewer" | "operator" | "admin";
export interface Me { username: string | null; role: Role; anonymous: boolean }
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/auth/me"), staleTime: 60_000 });
export const canOperate = (m?: Me) => !!m && (m.role === "operator" || m.role === "admin");

// ---------------------------------------------------------------- ops
export type Check = "ok" | "warn" | "fail" | "unknown" | "not_monitored" | "disabled" | "down" | "up";
export type StageStatus = "done" | "running" | "failed" | "pending" | "skipped" | "reused";
export interface Stage { name: string; status: StageStatus; started_at?: string | null; finished_at?: string | null;
  duration_s?: number | null; rows?: number | null; message?: string | null }
export interface Job { id: number; type: string; init: string | null; status: string; started_at: string | null;
  finished_at: string | null; duration_s: number | null; triggered_by: string; attempt: number; error: string | null;
  source?: string | null; created_at?: string; stages?: Stage[] }
export interface OpsStatus {
  mode: "REPLAY" | "NEAR-REAL-TIME"; nrt_enabled: boolean; upstream_kind: string; checked_at: string; elapsed_ms: number;
  overall: { state: "Healthy" | "Degraded" | "Down"; reasons: string[] };
  data: { upstream: { status: "reachable" | "unreachable" | "unknown"; init: string | null; checked_at: string | null; error?: string | null; source?: string };
    latest_processed: string | null; processed_source: string | null; last_fetch: { init: string; at: string } | null;
    published: string | null; data_age_h: number | null; freshness: "fresh" | "stale" | "old" | "unknown";
    truth: { latest_valid_date: string | null; verified: number; waiting: number | null; status: string; checked_at: string | null } };
  pipeline: { latest_job: Job | null; stages: Stage[]; components: { name: string; status: Check; detail: string; checked_at: string | null }[] };
  model: { available: boolean; reason?: string; version?: string; kind?: string; model_type?: string; features?: string[]; git?: string;
    created?: string; training_period?: string | null; calibration_period?: string | null; calibration_date?: string | null;
    test_result?: { bss_vs_b2: number; lo: number; hi: number } | null; forecast_model?: string | null;
    spec_training_period?: string | null; spec_calibration_period?: string | null; note?: string | null;
    drift?: { features: { feature: string; status: string; psi: number | null; n: number; note: string }[];
      calibration: { status: string; n: number; text: string }; checked_at: string } };
  system: { api: { status: string; version: string; requests: number; p50_ms: number | null; p95_ms: number | null; error_rate: number | null; checked_at: string };
    stage_times: { stage: string; last_s: number | null; median_7d_s: number | null }[];
    last_prediction: { init: string | null; at: string } | null;
    failed_jobs_7d: { id: number; type: string; init: string | null; error: string | null; finished_at: string | null }[];
    disk: { data_gb?: number | null; free_gb?: number; total_gb?: number; status?: string; checked_at: string | null };
    worker: { status: "ok" | "down" | "unknown"; enabled: boolean | null; last_heartbeat: string | null } };
  controls: { enabled: boolean; reason: string | null; running_job: number | null };
  replay: { versions: string[]; active: string | null; cycles: number; first: string | null; last: string | null; checked_at: string };
  user: Me;
}
export const useOpsStatus = (enabled: boolean) =>
  useQuery({ queryKey: ["ops", "status"], queryFn: () => get<OpsStatus>("/ops/status"), enabled, refetchInterval: 15_000, retry: false });
export const useOpsJobs = (enabled: boolean) =>
  useQuery({ queryKey: ["ops", "jobs"], queryFn: () => get<Job[]>("/ops/jobs?limit=20"), enabled, refetchInterval: 15_000, retry: false });
export const useOpsJob = (id?: number | null, live = false) =>
  useQuery({ queryKey: ["ops", "job", id], queryFn: () => get<Job>(`/ops/jobs/${id}`), enabled: !!id, refetchInterval: live ? 2_000 : false });
export interface LogLine { id: number; ts: string; level: string; msg: string }

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
export const sendHeartbeat = () => post("/ops/heartbeat", { version: APP_VERSION }).catch(() => undefined);
