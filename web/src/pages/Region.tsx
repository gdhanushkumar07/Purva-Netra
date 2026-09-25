import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pin, Share2 } from "lucide-react";
import { post, useExplain, useRegion, useRevision, useVerify, type RegionDay } from "@/api/client";
import { useInit, useResolvedTheme, prettyName, pct, mm, fmtDate, fmtInit, useLang } from "@/lib/hooks";
import { useSettings, useView } from "@/store";
import { ChartTable, ConfidenceBadge, DataTable, EmptyState, ErrorState, Loading, StatTile, ExportButton } from "@/components/common";
import { EChart } from "@/components/common/EChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BAND, CYCLE_STEPS, CYCLE_STEPS_DARK, chartInk } from "@/theme/scales";

const TABS = ["overview", "why", "evolution", "verify", "history"] as const;

function Overview({ days, day }: { days: RegionDay[]; day: number }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const ink = chartInk(theme);
  const x = days.map((d) => `D${d.lead}`);
  const sel = days.find((d) => d.lead === day);
  const bandAreas = [
    { from: 0, to: 0.05, c: BAND.High.color }, { from: 0.05, to: 0.15, c: BAND.Normal.color },
    { from: 0.15, to: 0.3, c: BAND.Reduced.color }, { from: 0.3, to: 1, c: BAND.Low.color },
  ];
  const ymax = Math.max(0.4, ...days.map((d) => d.p_bust ?? 0)) * 1.1;
  return (
    <div className="space-y-3">
      {sel && (
        <div className="flex flex-wrap gap-2">
          <StatTile value={pct(sel.p_bust)} label={`P(bust) · ${t("common.day")} ${day}`} />
          <StatTile value={sel.obs_lo_mm != null ? `${sel.obs_lo_mm.toFixed(0)}–${sel.obs_hi_mm!.toFixed(0)} mm` : "–"} label={`${t("common.obs_range")} (q90)`} hint="Observed rain consistent with the 90th-percentile expected log-error around the HRES forecast" />
          <StatTile value={sel.spread_anom != null ? `${sel.spread_anom.toFixed(2)}×` : "–"} label={t("common.spread_anom")} />
          <StatTile value={sel.novelty != null ? sel.novelty.toFixed(2) : "n/a"} label={t("common.novelty")} hint={sel.novelty == null ? "Analog memory not in this model version" : undefined} />
        </div>
      )}
      <ChartTable
        title={t("region.chart_p")}
        chart={
          <EChart
            label={`${t("region.chart_p")}: ${days.map((d) => `Day ${d.lead} ${pct(d.p_bust)}`).join(", ")}`}
            option={{
              xAxis: { type: "category", data: x },
              yAxis: { type: "value", min: 0, max: Number(ymax.toFixed(2)), axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
              tooltip: { trigger: "axis", valueFormatter: (v) => pct(v as number, 1) },
              series: [{
                name: "P(bust)", type: "line", data: days.map((d) => d.p_bust), symbolSize: 8, lineStyle: { width: 2, color: ink.text },
                itemStyle: { color: ink.text },
                markLine: { silent: true, symbol: "none", label: { formatter: t("common.base_rate"), color: ink.muted }, lineStyle: { type: "dashed", color: ink.muted }, data: [{ yAxis: 0.1 }] },
                markArea: { silent: true, data: bandAreas.map((b) => [{ yAxis: b.from, itemStyle: { color: b.c, opacity: 0.08 } }, { yAxis: Math.min(b.to, ymax) }]) as never },
                markPoint: { symbol: "circle", symbolSize: 14, itemStyle: { color: "transparent", borderColor: ink.text, borderWidth: 2 }, label: { show: false }, data: [{ name: "selected", coord: [`D${day}`, sel?.p_bust ?? 0] }] },
              }],
            }}
          />
        }
        table={<DataTable cols={[{ key: "lead", label: t("common.day") }, { key: "valid_date", label: t("common.valid"), fmt: (v) => fmtDate(v as string) }, { key: "p_bust", label: "P(bust)", fmt: (v) => pct(v as number, 1) }, { key: "confidence", label: t("common.confidence") }]} rows={days as unknown as Record<string, unknown>[]} />}
      />
      <ChartTable
        title={t("region.chart_rain")}
        chart={
          <EChart
            label={t("region.chart_rain")}
            option={{
              legend: { data: [t("region.hres"), t("region.ens_mean"), t("region.band")] },
              xAxis: { type: "category", data: x },
              yAxis: { type: "value", name: "mm / 24 h" },
              tooltip: { trigger: "axis", valueFormatter: (v) => mm(v as number) },
              series: [
                { name: "q10", type: "line", stack: "band", data: days.map((d) => d.ens_q10), lineStyle: { opacity: 0 }, symbol: "none", tooltip: { show: false } },
                { name: t("region.band"), type: "line", stack: "band", data: days.map((d) => (d.ens_q90 ?? 0) - (d.ens_q10 ?? 0)), lineStyle: { opacity: 0 }, symbol: "none", areaStyle: { color: "#3987e5", opacity: 0.2 }, itemStyle: { color: "#86b6ef" }, tooltip: { valueFormatter: () => "" } },
                { name: t("region.ens_mean"), type: "line", data: days.map((d) => d.ens_mean), lineStyle: { width: 2, type: "dashed", color: "#256abf" }, itemStyle: { color: "#256abf" }, symbolSize: 6 },
                { name: t("region.hres"), type: "line", data: days.map((d) => d.f_rain), lineStyle: { width: 2, color: theme === "dark" ? "#cde2fb" : "#0d366b" }, itemStyle: { color: theme === "dark" ? "#cde2fb" : "#0d366b" }, symbolSize: 8 },
              ],
            }}
          />
        }
        table={<DataTable cols={[{ key: "lead", label: t("common.day") }, { key: "f_rain", label: "HRES", fmt: (v) => mm(v as number) }, { key: "ens_mean", label: t("region.ens_mean"), fmt: (v) => mm(v as number) }, { key: "ens_q10", label: "q10", fmt: (v) => mm(v as number) }, { key: "ens_q90", label: "q90", fmt: (v) => mm(v as number) }]} rows={days as unknown as Record<string, unknown>[]} />}
      />
    </div>
  );
}

function Why({ rid, init, day }: { rid: number; init: string; day: number }) {
  const { t } = useTranslation();
  const lang = useLang();
  const e = useExplain(rid, init, day);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  if (e.isLoading) return <Loading />;
  if (e.error) return <ErrorState error={e.error} />;
  const d = e.data!;
  const reasons = lang === "hi" ? d.reasons_hi : d.reasons_en;
  const contrib = Object.entries(d.contrib).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1e-9, ...contrib.map(([, v]) => Math.abs(v)));
  const decide = async (agree: boolean) => {
    await post("/feedback", { rid, init, lead: day, agree, note });
    setSaved(true);
  };
  return (
    <div className="space-y-3" data-tour="why">
      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-1 text-sm font-semibold">{t("region.reasons")} · {t("common.day")} {day} <ConfidenceBadge band={d.confidence} /></h3>
        {reasons.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="reasons">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ol>
        ) : <p className="text-sm text-muted-foreground">{t("region.no_reasons")}</p>}
        <p className="mt-2 text-xs text-muted-foreground">{d.source === "shap" ? t("region.source_shap") : t("region.source_rule")}</p>
      </section>
      {contrib.length > 0 && (
        <section className="rounded-lg border bg-card p-3" aria-label={t("region.contrib")}>
          <h3 className="mb-2 text-sm font-semibold">{t("region.contrib")}</h3>
          <ul className="space-y-1">
            {contrib.map(([g, v]) => (
              <li key={g} className="flex items-center gap-2 text-xs">
                <span className="w-44 shrink-0">{t(`groups.${g}`, { defaultValue: g })}</span>
                <span className="h-3 rounded-r-[4px] bg-foreground/60" style={{ width: `${(Math.abs(v) / max) * 60}%` }} aria-hidden />
                <span className="tnum text-muted-foreground">{v.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("region.analogs")}</h3>
        {d.analogs.length === 0 ? <p className="text-sm text-muted-foreground">{t("region.analogs_none")}</p> : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {d.analogs.slice(0, 5).map((a, i) => (
              <article key={i} className="rounded-md border p-2 text-xs" data-testid="analog-card">
                <div className="font-semibold">{fmtInit(a.init)}</div>
                {a.f_rain != null && <div>forecast {a.f_rain.toFixed(0)} mm → observed {a.o_rain?.toFixed(0)} mm</div>}
                <div>{a.bust ? "✗ busted" : "✓ no bust"} · log-error {a.log_err.toFixed(2)}</div>
                {a.similarity != null && <div className="text-muted-foreground">similarity {(a.similarity * 100).toFixed(0)}%</div>}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="no-print rounded-lg border bg-card p-3">
        <h3 className="mb-2 text-sm font-semibold">{t("region.decide")}</h3>
        {saved ? <p className="text-sm" role="status">{t("region.saved")}</p> : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="fb-note">{t("region.note")}</label>
            <input id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("region.note")} className="h-8 flex-1 rounded-md border bg-card px-2 text-sm" />
            <Button size="sm" onClick={() => decide(true)}>{t("region.agree")}</Button>
            <Button size="sm" variant="outline" onClick={() => decide(false)}>{t("region.disagree")}</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Evolution({ rid, valid, init }: { rid: number; valid: string; init: string }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const r = useRevision(rid, valid, init);
  if (r.isLoading) return <Loading />;
  if (r.error) return <ErrorState error={r.error} />;
  const rows = r.data!;
  const steps = theme === "dark" ? CYCLE_STEPS_DARK : CYCLE_STEPS;
  const off = steps.length - rows.length;
  const last = rows[rows.length - 1];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatTile value={last?.rev12 != null ? last.rev12.toFixed(2) : "–"} label={t("region.rev12")} hint="|log1p(this) − log1p(previous cycle)|" />
        <StatTile value={last?.ffi4 != null ? last.ffi4.toFixed(2) : "–"} label={`${t("region.ffi")} (4 cycles)`} hint="Griffiths et al. 2019, via the `scores` package" />
      </div>
      <ChartTable
        title={t("region.evo_title", { date: fmtDate(valid) })}
        chart={
          <EChart
            label={t("region.evo_title", { date: fmtDate(valid) })}
            option={{
              xAxis: { type: "category", data: rows.map((x) => `${fmtInit(x.init)} (D${x.lead})`), axisLabel: { rotate: 20 } },
              yAxis: { type: "value", name: "mm / 24 h" },
              grid: { bottom: 64, left: 48, right: 16, top: 28 },
              tooltip: { trigger: "axis", valueFormatter: (v) => mm(v as number) },
              legend: { data: ["HRES", "Ensemble q10–q90"] },
              series: [
                { name: "q10", type: "bar", stack: "e", data: rows.map((x) => x.ens_q10), itemStyle: { color: "transparent" }, tooltip: { show: false }, barWidth: 14 },
                { name: "Ensemble q10–q90", type: "bar", stack: "e", data: rows.map((x, i) => ({ value: x.ens_q90 - x.ens_q10, itemStyle: { color: steps[Math.max(0, i + off)], opacity: 0.35, borderRadius: 4 } })), barWidth: 14 },
                { name: "HRES", type: "line", data: rows.map((x, i) => ({ value: x.f_rain, itemStyle: { color: steps[Math.max(0, i + off)] } })), lineStyle: { color: steps[steps.length - 1], width: 2 }, symbolSize: 10 },
              ],
            }}
          />
        }
        table={<DataTable cols={[{ key: "init", label: "Cycle", fmt: (v) => fmtInit(v as string) }, { key: "lead", label: t("common.day") }, { key: "f_rain", label: "HRES", fmt: (v) => mm(v as number) }, { key: "ens_q10", label: "q10", fmt: (v) => mm(v as number) }, { key: "ens_q90", label: "q90", fmt: (v) => mm(v as number) }, { key: "p_bust", label: "P(bust)", fmt: (v) => pct(v as number) }]} rows={rows as unknown as Record<string, unknown>[]} />}
      />
      <p className="text-xs text-muted-foreground">Lines and bars go from light (oldest cycle) to dark (newest). Only cycles issued up to the selected cycle are shown.</p>
    </div>
  );
}

function Verify({ rid, init }: { rid: number; init: string }) {
  const { t } = useTranslation();
  const v = useVerify(rid, init);
  if (v.isLoading) return <Loading />;
  if (v.error) return <ErrorState error={v.error} />;
  const f = (x: unknown) => (x == null ? "–" : (x as number).toFixed(2));
  const c = v.data!.contingency;
  return (
    <div className="space-y-3">
    <div className="rounded-lg border bg-card p-3">
      <DataTable
        cols={[
          { key: "lead", label: t("common.day") },
          { key: "valid_date", label: t("common.valid"), fmt: (x) => fmtDate(x as string) },
          { key: "f_rain", label: "Forecast", fmt: (x) => mm(x as number) },
          { key: "o_rain", label: "IMD observed", fmt: (x, r) => (x == null ? t("region.verify_wait", { date: fmtDate(r.valid_date as string) }) : mm(x as number)) },
          { key: "log_err", label: "log-error", fmt: (x) => (x == null ? "–" : (x as number).toFixed(2)) },
          { key: "thr", label: "bust threshold", fmt: (x) => (x == null ? "–" : (x as number).toFixed(2)) },
          { key: "p_bust", label: "P(bust)", fmt: (x) => pct(x as number) },
          { key: "outcome", label: "Outcome", fmt: (x) => (x ? t(`outcome.${x}`) : "–") },
        ]}
        rows={v.data!.days as unknown as Record<string, unknown>[]}
      />
      <p className="mt-2 text-xs text-muted-foreground">Bust = log-error above the training-year 90th percentile for this region, lead and season, and |error| ≥ 5 mm. “Flagged” = P(bust) ≥ 15% (Reduced or Low).</p>
    </div>
    <section className="rounded-lg border bg-card p-3" aria-label="Heavy-rain contingency scores">
      <h3 className="text-sm font-semibold">Heavy-rain contingency scores · {c.season} (nwpeval)</h3>
      <p className="mb-2 text-xs text-muted-foreground">Event: {c.event}. HRES forecast vs IMD, all cycles in the replay store for this season. Scores are blank when no event occurred.</p>
      <DataTable
        cols={[{ key: "lead", label: t("common.day") }, { key: "n", label: "n" }, { key: "n_obs_events", label: "observed events" },
          { key: "n_fcst_events", label: "forecast events" }, { key: "pod", label: "POD", fmt: f }, { key: "far", label: "FAR", fmt: f },
          { key: "csi", label: "CSI", fmt: f }, { key: "ets", label: "ETS", fmt: f }]}
        rows={c.by_lead as unknown as Record<string, unknown>[]}
      />
    </section>
    </div>
  );
}

export default function Region() {
  const { t } = useTranslation();
  const { rid: ridS } = useParams();
  const rid = Number(ridS);
  const { init } = useInit();
  const v = useView();
  const s = useSettings();
  const day = Number(v.get("day") ?? 1);
  const tab = (v.get("tab") ?? "overview") as (typeof TABS)[number];
  const r = useRegion(rid, init);
  if (r.isLoading || !init) return <Loading />;
  if (r.error) return <ErrorState error={r.error} onRetry={() => r.refetch()} />;
  const d = r.data!;
  const sel = d.days.find((x) => x.lead === day);
  const pinned = s.watch.some((w) => w.rid === rid);
  const assessed = d.days.some((x) => x.p_bust != null);
  return (
    <div className="space-y-3" id="region-export">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{prettyName(d.name)}</h1>
        <span className="text-sm text-muted-foreground">{d.zone}</span>
        {sel && <ConfidenceBadge band={sel.confidence} />}
        {sel?.hi_risk && <span className="text-xs">▲ {t("common.heavy_risk")}</span>}
        <div className="no-print ml-auto flex flex-wrap gap-1">
          <label className="flex items-center gap-1 text-sm">{t("common.day")}
            <select className="h-8 rounded-md border bg-card px-2" value={day} onChange={(e) => v.set({ day: e.target.value })}>
              {d.days.map((x) => <option key={x.lead} value={x.lead}>{x.lead} · {fmtDate(x.valid_date)}</option>)}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={() => s.set({ watch: pinned ? s.watch.filter((w) => w.rid !== rid) : [...s.watch, { rid, from: 3, to: 5, threshold: 0.25 }] })}>
            <Pin className="size-4" aria-hidden />{pinned ? t("common.unpin") : t("common.pin")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 className="size-4" aria-hidden />{t("common.share")}</Button>
          <ExportButton targetId="region-export" filename={`purva-netra-${d.name}-${init}`} />
        </div>
      </header>
      {!assessed ? <EmptyState title={t("band.Not assessed")}>{t("common.not_assessed_help")}</EmptyState> : (
        <Tabs value={tab} onValueChange={(x) => v.set({ tab: x })}>
          <TabsList className="no-print">
            {TABS.map((x) => <TabsTrigger key={x} value={x} data-testid={`tab-${x}`}>{t(`region.${x}`)}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview"><Overview days={d.days} day={day} /></TabsContent>
          <TabsContent value="why"><Why rid={rid} init={init} day={day} /></TabsContent>
          <TabsContent value="evolution">{sel && <Evolution rid={rid} valid={sel.valid_date} init={init} />}</TabsContent>
          <TabsContent value="verify"><Verify rid={rid} init={init} /></TabsContent>
          <TabsContent value="history"><EmptyState title={t("region.history")}>{t("region.history_na")}</EmptyState></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
