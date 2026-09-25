import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Play, RotateCcw, RefreshCw, ScrollText } from "lucide-react";
import {
  API_BASE, HttpError, get, post, useMe, canOperate, useOpsJobs, useOpsJob, useOpsStatus, type Job, type LogLine, type OpsStatus, type Stage,
} from "@/api/client";
import { statusView, TONE_COLOR } from "@/lib/status";
import { fmtAge, fmtUtc } from "@/components/shell/Shell";
import { useMediaQuery } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, Loading } from "@/components/common";
import { cn } from "@/lib/utils";

const STAGE_ORDER = ["discover", "fetch", "validate", "extract", "features", "inference", "explain", "publish"];

/** Status chip: icon + label + colour (never colour alone). */
export function StatusChip({ s, label, testid }: { s: string | null | undefined; label?: string; testid?: string }) {
  const v = statusView(s);
  return (
    <span data-testid={testid} data-status={s ?? "unknown"} className="inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs"
      style={{ borderColor: TONE_COLOR[v.tone] }}>
      <span aria-hidden style={{ color: TONE_COLOR[v.tone] }}>{v.icon}</span>{label ?? v.label}
    </span>
  );
}

function Checked({ at }: { at?: string | null }) {
  return <span className="text-[11px] text-muted-foreground">last checked {fmtUtc(at)}</span>;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-1 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{children}</span></div>;
}

function StageRow({ stages, job }: { stages: Stage[]; job: Job | null }) {
  const by = new Map(stages.map((s) => [s.name, s]));
  return (
    <section className="panel" aria-label="Pipeline stages" data-testid="stage-row">
      <div className="panel-sec flex flex-wrap items-center gap-2">
        <h2 className="panel-title">Pipeline · latest job</h2>
        {job ? <span className="text-xs text-muted-foreground">#{job.id} · {job.type} · {job.init ?? "init pending"} · {job.source ?? ""} · by {job.triggered_by} · attempt {job.attempt}</span>
          : <span className="text-xs text-muted-foreground">No job has run yet</span>}
        {job && <span className="ml-auto"><StatusChip s={job.status} testid="job-status" /></span>}
      </div>
      <ol className="panel-sec grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-8">
        {STAGE_ORDER.map((n, i) => {
          const s = by.get(n);
          const v = statusView(s?.status ?? "pending");
          return (
            <li key={n} data-testid={`stage-${n}`} data-status={s?.status ?? "pending"} className="rounded border px-2 py-1.5" style={{ borderColor: TONE_COLOR[v.tone] }} title={s?.message ?? ""}>
              <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">{i + 1}</span>
                <span aria-hidden style={{ color: TONE_COLOR[v.tone] }} className={cn(s?.status === "running" && "motion-safe:animate-spin")}>{v.icon}</span>
                <span className="font-semibold">{n}</span></div>
              <div className="text-[11px] text-muted-foreground">{v.label}{s?.duration_s != null ? ` · ${s.duration_s}s` : ""}{s?.rows != null ? ` · ${s.rows.toLocaleString()} rows` : ""}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DataPanel({ s }: { s: OpsStatus }) {
  const d = s.data;
  if (s.mode === "REPLAY") {
    const r = s.replay;
    return (
      <section className="panel" aria-label="Data status" data-testid="panel-data">
        <div className="panel-sec flex items-center justify-between"><h2 className="panel-title">Data · replay store</h2><Checked at={r.checked_at} /></div>
        <div className="panel-sec">
          <Row k="Active replay store">{r.active ?? "–"}</Row>
          <Row k="Cycles">{r.cycles}</Row>
          <Row k="First / last cycle">{r.first ?? "–"} → {r.last ?? "–"}</Row>
          <Row k="Upstream (ECMWF)"><StatusChip s="disabled" label="Not used in REPLAY" /></Row>
        </div>
      </section>
    );
  }
  return (
    <section className="panel" aria-label="Data status" data-testid="panel-data">
      <div className="panel-sec flex items-center justify-between"><h2 className="panel-title">Data status</h2><Checked at={d.upstream.checked_at} /></div>
      <div className="panel-sec">
        <div className="flex items-end gap-3 pb-1">
          <div><div className="kpi" data-testid="data-age-kpi">{fmtAge(d.data_age_h)}</div><div className="text-xs text-muted-foreground">data age (now − init of latest published)</div></div>
          <StatusChip s={d.freshness} testid="freshness" />
        </div>
        <Row k={`Upstream latest (${d.upstream.source ?? s.upstream_kind})`}>
          {d.upstream.status === "reachable" ? d.upstream.init : <StatusChip s={d.upstream.status} testid="upstream-status" label={d.upstream.status === "unknown" ? "Unknown (never checked)" : undefined} />}
        </Row>
        <Row k="Latest processed">{d.latest_processed ?? "–"}{d.processed_source === "mock" && <strong className="ml-1 text-[#9c2723] dark:text-[#f29a8a]">MOCK</strong>}</Row>
        <Row k="Last successful fetch">{d.last_fetch ? `${d.last_fetch.init} at ${fmtUtc(d.last_fetch.at)}` : "never"}</Row>
        <Row k="IMD truth: latest verified date">{d.truth.latest_valid_date ?? "none yet"}</Row>
        <Row k="Predictions waiting for truth">{d.truth.waiting ?? "–"}</Row>
        {d.upstream.error && <p className="text-xs text-muted-foreground">Upstream error: {d.upstream.error}</p>}
      </div>
    </section>
  );
}

function ModelPanel({ s }: { s: OpsStatus }) {
  const m = s.model;
  if (!m.available) return <section className="panel" aria-label="Model status"><div className="panel-sec"><h2 className="panel-title">Model</h2><p className="text-sm">{m.reason}</p></div></section>;
  const drift = m.drift;
  return (
    <section className="panel" aria-label="Model status" data-testid="panel-model">
      <div className="panel-sec flex items-center justify-between"><h2 className="panel-title">Model status</h2><Checked at={drift?.checked_at} /></div>
      <div className="panel-sec">
        <div className="pb-1"><div className="kpi-sm">{m.version}</div>
          <div className="text-xs text-muted-foreground">{m.kind === "placeholder" ? <strong className="text-[#9c2723] dark:text-[#f29a8a]">PLACEHOLDER · </strong> : null}{m.model_type} · git {m.git ?? "?"}</div></div>
        <Row k="Training period">{m.training_period ?? "–"}{m.spec_training_period && m.kind === "placeholder" && <span className="block text-xs text-muted-foreground">spec: {m.spec_training_period} (not trained yet)</span>}</Row>
        <Row k="Calibration">{m.calibration_period ?? "none"}{m.calibration_date ? ` · ${m.calibration_date}` : ""}{m.kind === "placeholder" && <span className="block text-xs text-muted-foreground">spec: {m.spec_calibration_period}</span>}</Row>
        <Row k="Test 2022: BSS vs B2">{m.test_result ? `${m.test_result.bss_vs_b2.toFixed(3)} [${m.test_result.lo.toFixed(3)}, ${m.test_result.hi.toFixed(3)}]` : <StatusChip s="unknown" label="Not available (no held-out test)" />}</Row>
        <Row k="Trained for">{m.forecast_model ?? "–"}</Row>
      </div>
      <div className="panel-sec" data-testid="drift">
        <div className="panel-title mb-1">Drift</div>
        {drift?.features.map((f) => (
          <Row key={f.feature} k={`PSI ${f.feature}`}><StatusChip s={f.status} label={f.psi != null ? `${f.psi} (n=${f.n})` : undefined} /> </Row>
        ))}
        <Row k="Calibration drift"><StatusChip s={drift?.calibration.status} label={drift?.calibration.text} testid="cal-drift" /></Row>
      </div>
    </section>
  );
}

function SystemPanel({ s, onLogs }: { s: OpsStatus; onLogs: (id: number) => void }) {
  const y = s.system;
  return (
    <section className="panel" aria-label="System health" data-testid="panel-system">
      <div className="panel-sec flex items-center justify-between"><h2 className="panel-title">System health</h2><Checked at={y.api.checked_at} /></div>
      <div className="panel-sec">
        <div className="flex items-end gap-4 pb-1">
          <div><div className="kpi">{y.api.p95_ms == null ? "–" : `${Math.round(y.api.p95_ms)} ms`}</div><div className="text-xs text-muted-foreground">API p95 (1 h, n={y.api.requests})</div></div>
          <StatusChip s="up" label={`API up · v${y.api.version}`} />
        </div>
        <Row k="p50 latency / error rate">{y.api.p50_ms == null ? "–" : `${Math.round(y.api.p50_ms)} ms`} · {y.api.error_rate == null ? "–" : `${(y.api.error_rate * 100).toFixed(2)}%`}</Row>
        <Row k="Last prediction generated">{y.last_prediction ? `${y.last_prediction.init} at ${fmtUtc(y.last_prediction.at)}` : "never"}</Row>
        <Row k="Worker heartbeat"><StatusChip s={y.worker.status} label={y.worker.last_heartbeat ? `${statusView(y.worker.status).label} · ${fmtUtc(y.worker.last_heartbeat)}` : "Unknown (no heartbeat)"} testid="worker-status" /></Row>
        <Row k="Disk: data/">{y.disk.data_gb != null ? `${y.disk.data_gb} GB used · ${y.disk.free_gb} GB free` : <StatusChip s="unknown" />}</Row>
      </div>
      <div className="panel-sec">
        <div className="panel-title mb-1">Processing time per stage (last run · 7-day median)</div>
        <table className="w-full text-xs"><tbody className="tnum">
          {y.stage_times.map((r) => <tr key={r.stage}><td className="py-0.5 text-muted-foreground">{r.stage}</td><td className="text-right">{r.last_s ?? "–"} s</td><td className="text-right text-muted-foreground">{r.median_7d_s ?? "–"} s</td></tr>)}
        </tbody></table>
      </div>
      <div className="panel-sec">
        <div className="panel-title mb-1">Failed jobs (7 days)</div>
        {y.failed_jobs_7d.length === 0 ? <p className="text-xs text-muted-foreground">None</p> : (
          <ul className="space-y-1 text-xs">{y.failed_jobs_7d.slice(0, 5).map((j) => (
            <li key={j.id} className="flex items-baseline gap-2"><StatusChip s="failed" label={`#${j.id}`} /><span className="min-w-0 flex-1 truncate" title={j.error ?? ""}>{j.error}</span>
              <button className="underline" onClick={() => onLogs(j.id)}>logs</button></li>))}</ul>
        )}
      </div>
    </section>
  );
}

type Action = { kind: "run" | "retry" | "refresh"; jobId?: number; init?: string };

function ControlsPanel({ s, jobs, onAction, onLogs }: { s: OpsStatus; jobs: Job[]; onAction: (a: Action) => void; onLogs: (id: number) => void }) {
  const c = s.controls;
  const failed = jobs.find((j) => j.status === "failed" && j.type !== "verify");
  const inits = [...new Set(jobs.filter((j) => j.status === "done" && j.init).map((j) => j.init!))];
  const [init, setInit] = useState<string>("");
  const dis = !c.enabled;
  return (
    <section className="panel" aria-label="NRT controls" data-testid="panel-controls">
      <div className="panel-sec flex items-center justify-between"><h2 className="panel-title">NRT controls</h2>{c.running_job && <StatusChip s="running" label={`job #${c.running_job} running`} />}</div>
      <div className="panel-sec space-y-2">
        {c.reason && <p className="text-sm" data-testid="controls-reason">– {c.reason}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={dis} onClick={() => onAction({ kind: "run" })} data-testid="btn-run-latest"><Play className="size-4" aria-hidden />Run latest cycle</Button>
          <Button size="sm" variant="outline" disabled={dis || !failed} onClick={() => failed && onAction({ kind: "retry", jobId: failed.id })} data-testid="btn-retry">
            <RotateCcw className="size-4" aria-hidden />Retry failed ingestion{failed ? ` (#${failed.id})` : ""}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="refresh-init">Refresh predictions for</label>
          <select id="refresh-init" className="h-8 rounded-md border bg-card px-2 text-sm" value={init} onChange={(e) => setInit(e.target.value)} disabled={dis}>
            <option value="">choose a processed cycle…</option>{inits.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={dis || !init} onClick={() => onAction({ kind: "refresh", init })} data-testid="btn-refresh"><RefreshCw className="size-4" aria-hidden />Refresh</Button>
        </div>
        <Button size="sm" variant="ghost" disabled={!jobs[0]} onClick={() => jobs[0] && onLogs(jobs[0].id)} data-testid="btn-logs"><ScrollText className="size-4" aria-hidden />View processing logs</Button>
      </div>
    </section>
  );
}

const ACTION_TEXT: Record<Action["kind"], (a: Action) => { title: string; body: string }> = {
  run: () => ({ title: "Run latest cycle", body: "Queries the upstream for the latest 00/12 UTC cycle and runs discover → fetch → validate → extract → features → inference → explain → publish. If that cycle is already published this is a no-op. The new cycle is published atomically." }),
  retry: (a) => ({ title: `Retry job #${a.jobId}`, body: "Starts a new attempt for the same cycle, resuming at the stage that failed and reusing the outputs of earlier stages." }),
  refresh: (a) => ({ title: `Refresh predictions for ${a.init}`, body: "Re-runs inference → explain → publish for this cycle from its saved features (e.g. after a model or calibrator change). Fetched data is not downloaded again." }),
};

function LogsDrawer({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState("ALL");
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const job = useOpsJob(jobId, live);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!jobId) return;
    setLines([]);
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      const j = await get<Job>(`/ops/jobs/${jobId}`);
      if (cancelled) return;
      if (j.status === "running" || j.status === "queued") {
        setLive(true);
        es = new EventSource(`${API_BASE}/ops/jobs/${jobId}/logs`, { withCredentials: true });
        es.onmessage = (e) => setLines((l) => [...l, JSON.parse(e.data)]);
        es.addEventListener("end", () => { setLive(false); es?.close(); });
        es.onerror = () => { setLive(false); es?.close(); };
      } else {
        setLive(false);
        setLines(await get<LogLine[]>(`/ops/jobs/${jobId}/logs?stream=false`));
      }
    })();
    return () => { cancelled = true; es?.close(); };
  }, [jobId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [lines]);
  const shown = useMemo(() => lines.filter((l) => (level === "ALL" || l.level === level) && (!q || l.msg.toLowerCase().includes(q.toLowerCase()))), [lines, level, q]);
  const download = () => {
    const txt = lines.map((l) => `${l.ts} ${l.level.padEnd(5)} ${l.msg}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); a.download = `purva-netra-job-${jobId}.txt`; a.click();
  };
  return (
    <Sheet open={jobId != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl" data-testid="logs-drawer">
        <SheetHeader>
          <SheetTitle>Processing logs · job #{jobId}</SheetTitle>
          <SheetDescription>{live ? "Live (Server-Sent Events)" : "Complete log"} · {job.data ? `${job.data.type} ${job.data.init ?? ""} · ${statusView(job.data.status).label}` : ""}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-center gap-2 px-4">
          <label className="text-sm">Level <select className="h-8 rounded-md border bg-card px-2" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="log-level">
            {["ALL", "INFO", "WARN", "ERROR"].map((l) => <option key={l}>{l}</option>)}</select></label>
          <label className="sr-only" htmlFor="log-q">Search logs</label>
          <input id="log-q" className="h-8 flex-1 rounded-md border bg-background px-2 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="log-search" />
          <Button size="sm" variant="outline" onClick={download} data-testid="log-download"><Download className="size-4" aria-hidden />.txt</Button>
        </div>
        <div className="m-4 h-[70vh] overflow-auto rounded border bg-background p-2 font-mono text-xs" role="log" aria-live="polite" data-testid="log-lines">
          {shown.length === 0 && <p className="text-muted-foreground">No log lines{q || level !== "ALL" ? " match the filter" : ""}.</p>}
          {shown.map((l) => (
            <div key={l.id} className="whitespace-pre-wrap"><span className="text-muted-foreground">{l.ts}</span>{" "}
              <span className={cn(l.level === "ERROR" && "text-[#d03b3b]", l.level === "WARN" && "text-[#fab219]")}>{l.level.padEnd(5)}</span> {l.msg}</div>
          ))}
          <div ref={bottom} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Ops() {
  const { t } = useTranslation();
  const me = useMe();
  const allowed = canOperate(me.data);
  const st = useOpsStatus(allowed);
  const jobs = useOpsJobs(allowed);
  const qc = useQueryClient();
  const phone = useMediaQuery("(max-width: 599px)");
  const [pending, setPending] = useState<Action | null>(null);
  const [logs, setLogs] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (me.isLoading) return <Loading />;
  if (!allowed)
    return <EmptyState title="Operations console — operators only">
      {me.data?.anonymous ? <>Please <Link className="underline" to="/login?next=/ops">sign in</Link> with an operator account.</> : "Your role is viewer. Ask an admin for operator access."}
    </EmptyState>;
  if (st.isLoading) return <Loading />;
  if (st.error) return <EmptyState title="Could not load operations status">{(st.error as HttpError).message}</EmptyState>;
  const s = st.data!;
  const ov = statusView(s.overall.state);

  const confirm = async () => {
    if (!pending) return;
    const a = pending; setPending(null);
    try {
      const path = a.kind === "run" ? "/ops/run-latest" : a.kind === "retry" ? `/ops/jobs/${a.jobId}/retry` : `/ops/refresh?init=${encodeURIComponent(a.init!)}`;
      const r = await post<{ job_id: number }>(path, {});
      setMsg(`Started job #${r.job_id}.`); setLogs(r.job_id);
    } catch (e) {
      const x = e as HttpError;
      setMsg(x.status === 409 ? `Refused: ${x.message}` : `Failed: ${x.message}`);
    }
    void qc.invalidateQueries({ queryKey: ["ops"] });
  };

  return (
    <div className="space-y-2" data-testid="ops">
      <section className="panel flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2" aria-label="Overall state" data-testid="overall">
        <h1 className="sr-only">{t("nav.ops")}</h1>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl" style={{ color: TONE_COLOR[ov.tone] }}>{ov.icon}</span>
          <span className="kpi" data-testid="overall-state">{s.overall.state}</span>
        </div>
        <div className="min-w-0 flex-1 text-sm">{s.overall.reasons.join(" · ")}</div>
        <div className="text-right text-xs">
          <div><strong>{s.mode}</strong>{s.mode === "NEAR-REAL-TIME" && <> · NRT {s.nrt_enabled ? "enabled" : <strong>disabled</strong>} · upstream {s.upstream_kind}{s.upstream_kind === "mock" && <strong className="ml-1 text-[#9c2723] dark:text-[#f29a8a]">(SYNTHETIC)</strong>}</>}</div>
          <div className="text-muted-foreground">last checked {fmtUtc(s.checked_at)} · {s.elapsed_ms} ms · auto-refresh 15 s</div>
        </div>
      </section>
      {msg && <p role="status" className="text-sm" data-testid="action-msg">{msg}</p>}
      <StageRow stages={s.pipeline.stages} job={s.pipeline.latest_job} />
      <section className="panel" aria-label="Component health">
        <div className="panel-sec grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-5">
          {s.pipeline.components.map((c) => (
            <div key={c.name} className="py-1" data-testid={`comp-${c.name}`}>
              <div className="flex items-center justify-between gap-2 text-sm"><span>{c.name}</span><StatusChip s={c.status} /></div>
              <div className="truncate text-[11px] text-muted-foreground" title={c.detail}>{c.detail}</div>
              <Checked at={c.checked_at} />
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-2 lg:grid-cols-2">
        <DataPanel s={s} />
        <ModelPanel s={s} />
        <SystemPanel s={s} onLogs={setLogs} />
        {phone ? <section className="panel panel-sec text-sm text-muted-foreground">Controls are available on tablet and desktop.</section>
          : <ControlsPanel s={s} jobs={jobs.data ?? []} onAction={setPending} onLogs={setLogs} />}
      </div>
      {!phone && (
        <section className="panel" aria-label="Recent jobs">
          <div className="panel-sec"><h2 className="panel-title">Recent jobs</h2></div>
          <div className="panel-sec overflow-x-auto">
            <table className="w-full text-xs" data-testid="jobs-table">
              <thead><tr className="text-left text-muted-foreground">{["#", "Type", "Cycle", "Status", "Started", "Duration", "By", "Attempt", "Error", ""].map((h) => <th key={h} scope="col" className="py-1 pr-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="tnum">
                {(jobs.data ?? []).map((j) => (
                  <tr key={j.id} className="border-t border-border/60">
                    <td className="py-1 pr-2">{j.id}</td><td className="pr-2">{j.type}</td><td className="pr-2">{j.init ?? "–"}</td>
                    <td className="pr-2"><StatusChip s={j.status} /></td><td className="pr-2">{fmtUtc(j.started_at)}</td>
                    <td className="pr-2">{j.duration_s != null ? `${j.duration_s}s` : "–"}</td><td className="pr-2">{j.triggered_by}</td><td className="pr-2">{j.attempt}</td>
                    <td className="max-w-72 truncate pr-2" title={j.error ?? ""}>{j.error ?? ""}</td>
                    <td><button className="underline" onClick={() => setLogs(j.id)} data-testid={`logs-${j.id}`}>logs</button></td>
                  </tr>
                ))}
                {(jobs.data ?? []).length === 0 && <tr><td colSpan={10} className="py-2 text-muted-foreground">No jobs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Dialog open={pending != null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent data-testid="confirm-dialog">
          {pending && <>
            <DialogHeader><DialogTitle>{ACTION_TEXT[pending.kind](pending).title}</DialogTitle>
              <DialogDescription>{ACTION_TEXT[pending.kind](pending).body} Upstream: {s.upstream_kind}. This action is written to the audit log.</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setPending(null)}>Cancel</Button><Button onClick={confirm} data-testid="confirm-run">Confirm</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
      <LogsDrawer jobId={logs} onClose={() => setLogs(null)} />
    </div>
  );
}
