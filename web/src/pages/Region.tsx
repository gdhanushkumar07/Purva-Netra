import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pin, Share2 } from "lucide-react";
import { useEffect } from "react";
import { post, useExplain, useMatrix, useRegion, useVerify, type RegionDay } from "@/api/client";
import { ForecastDNA } from "@/components/region/ForecastDNA";
import { RegionHeader } from "@/components/region/RegionHeader";
import { EvolutionView } from "@/components/region/EvolutionView";
import { useInit, useResolvedTheme, prettyName, pct, mm, fmtDate, fmtInit, useLang } from "@/lib/hooks";
import { useSettings, useView } from "@/store";
import { ChartTable, ConfidenceBadge, DataTable, EmptyState, ErrorState, Loading, StatTile, ExportButton } from "@/components/common";
import { EChart } from "@/components/common/EChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BAND, CYCLE_STEPS, CYCLE_STEPS_DARK, chartInk } from "@/theme/scales";

const TABS = ["overview", "why", "evolution", "verify", "history"] as const;

function DnaFor({ rid, init, day }: { rid: number; init: string; day: number }) {
  const e = useExplain(rid, init, day);
  if (e.isLoading) return <Loading />;
  if (e.error) return <ErrorState error={e.error} />;
  return <ForecastDNA ex={e.data!} />;
}

function Overview({ days, day, rid, init }: { days: RegionDay[]; day: number; rid: number; init: string }) {
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
      {sel?.obs_lo_mm != null && (
        <p className="text-sm" data-testid="obs-range">{t("common.obs_range")} (q90): <strong className="tnum">{sel.obs_lo_mm.toFixed(0)}–{sel.obs_hi_mm!.toFixed(0)} mm</strong>
          <span className="text-muted-foreground"> — observed rain consistent with the 90th-percentile expected error around HRES {sel.f_rain?.toFixed(1)} mm</span></p>
      )}
      <DnaFor rid={rid} init={init} day={day} />
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
      <ForecastDNA ex={d} />
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
  const m = useMatrix(init);
  // Pin the cycle in the URL: a new NRT cycle must never swap the data under an ongoing analysis.
  useEffect(() => { if (init && !v.get("init")) v.set({ init }); }, [init, v]);
  if (r.isLoading || !init) return <Loading />;
  if (r.error) return <ErrorState error={r.error} onRetry={() => r.refetch()} />;
  const d = r.data!;
  const sel = d.days.find((x) => x.lead === day);
  const pinned = s.watch.some((w) => w.rid === rid);
  const assessed = d.days.some((x) => x.p_bust != null);
  return (
    <div className="space-y-2" id="region-export">
      <RegionHeader name={d.name} zone={d.zone} days={d.days} day={day} cells={(m.data ?? []).filter((c) => c.rid === rid)}
        onDay={(x) => v.set({ day: x })}
        actions={<>
          {sel?.hi_risk && <span className="self-center text-xs">▲ {t("common.heavy_risk")}</span>}
          <Button size="sm" variant="outline" onClick={() => s.set({ watch: pinned ? s.watch.filter((w) => w.rid !== rid) : [...s.watch, { rid, from: 3, to: 5, threshold: 0.25 }] })}>
            <Pin className="size-4" aria-hidden />{pinned ? t("common.unpin") : t("common.pin")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 className="size-4" aria-hidden />{t("common.share")}</Button>
          <ExportButton targetId="region-export" filename={`purva-netra-${d.name}-${init}`} />
        </>} />
      {!assessed ? <EmptyState title={t("band.Not assessed")}>{t("common.not_assessed_help")}</EmptyState> : (
        <Tabs value={tab} onValueChange={(x) => v.set({ tab: x })}>
          <TabsList className="no-print">
            {TABS.map((x) => <TabsTrigger key={x} value={x} data-testid={`tab-${x}`}>{t(`region.${x}`)}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview"><Overview days={d.days} day={day} rid={rid} init={init} /></TabsContent>
          <TabsContent value="why"><Why rid={rid} init={init} day={day} /></TabsContent>
          <TabsContent value="evolution">{sel && <EvolutionView rid={rid} valid={sel.valid_date} upto={init} />}</TabsContent>
          <TabsContent value="verify"><Verify rid={rid} init={init} /></TabsContent>
          <TabsContent value="history"><EmptyState title={t("region.history")}>{t("region.history_na")}</EmptyState></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
