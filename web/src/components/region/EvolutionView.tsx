import { useTranslation } from "react-i18next";
import { useRevision } from "@/api/client";
import { useResolvedTheme, pct, pts, mm, fmtDate, fmtInit } from "@/lib/hooks";
import { ChartTable, DataTable, ErrorState, Loading } from "@/components/common";
import { EChart } from "@/components/common/EChart";
import { CYCLE_STEPS, CYCLE_STEPS_DARK, chartInk } from "@/theme/scales";

export const REVISION_THRESHOLD = 0.4;     // same fixed threshold as the "revision" reason rule (explain.RULES)

/** One screen, four questions, three stacked charts sharing the cycle axis (never dual-axis). */
export function EvolutionView({ rid, valid, upto, compact = false }: { rid: number; valid: string; upto: string; compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const ink = chartInk(theme);
  const r = useRevision(rid, valid, upto);
  if (r.isLoading) return <Loading />;
  if (r.error) return <ErrorState error={r.error} />;
  const rows = r.data!;
  const steps = theme === "dark" ? CYCLE_STEPS_DARK : CYCLE_STEPS;
  const off = steps.length - rows.length;
  const col = (i: number) => steps[Math.max(0, i + off)];
  const cats = rows.map((x) => `${fmtInit(x.init).replace(/ \d{4}$/, "")} · D${x.lead}`);
  const H = compact ? 150 : 170;
  const grid = { left: 56, right: 16, top: 12, bottom: 24 };

  // Q4 tiles
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  let largest: { mm: number; log: number; at: string } | null = null;
  for (let i = 1; i < rows.length; i++) {
    const dmm = rows[i].f_rain - rows[i - 1].f_rain;
    const dlog = Math.abs(Math.log1p(rows[i].f_rain) - Math.log1p(rows[i - 1].f_rain));
    if (!largest || dlog > largest.log) largest = { mm: dmm, log: dlog, at: rows[i].init };
  }
  const significant = rows.some((x) => (x.rev12 ?? 0) > REVISION_THRESHOLD);
  const summary = !prev
    ? t("region.evo_single", { date: fmtDate(valid) })
    : t("region.evo_summary", {
        date: fmtDate(valid), a: prev.f_rain.toFixed(1), b: last.f_rain.toFixed(1),
        d: `${last.f_rain - prev.f_rain >= 0 ? "+" : ""}${(last.f_rain - prev.f_rain).toFixed(1)} mm`,
        dp: pts(last.p_bust != null && prev.p_bust != null ? last.p_bust - prev.p_bust : null),
        s: last.spread_anom?.toFixed(2) ?? "–", s0: prev.spread_anom?.toFixed(2) ?? "–",
      });

  const table = (
    <DataTable cols={[
      { key: "init", label: "Cycle", fmt: (v) => fmtInit(v as string) }, { key: "lead", label: t("common.day") },
      { key: "f_rain", label: "HRES", fmt: (v) => mm(v as number) }, { key: "ens_q10", label: "q10", fmt: (v) => mm(v as number) },
      { key: "ens_q90", label: "q90", fmt: (v) => mm(v as number) }, { key: "p_bust", label: "P(bust)", fmt: (v) => pct(v as number, 1) },
      { key: "spread_anom", label: "Spread ×", fmt: (v) => (v == null ? "–" : (v as number).toFixed(2)) },
      { key: "rev12", label: "rev12", fmt: (v) => (v == null ? "–" : (v as number).toFixed(2)) },
    ]} rows={rows as unknown as Record<string, unknown>[]} />
  );

  return (
    <div className="space-y-2" data-testid="evolution">
      <p className="text-sm" data-testid="evo-summary">{summary}</p>
      <div className="panel flex flex-wrap" aria-label={t("region.evo_q4")}>
        <div className="panel-sec min-w-40 flex-1 hair-r"><div className="kpi-sm">{last?.ffi4 != null ? last.ffi4.toFixed(2) : "–"}</div>
          <div className="text-xs text-muted-foreground">{t("region.ffi")} (4 cycles{last?.ffi4 == null ? "; needs 4 consecutive cycles" : ""})</div></div>
        <div className="panel-sec min-w-40 flex-1 hair-r"><div className="kpi-sm">{largest ? `${largest.mm >= 0 ? "+" : ""}${largest.mm.toFixed(1)} mm` : "–"}</div>
          <div className="text-xs text-muted-foreground">{t("region.largest_rev")}{largest ? ` (${largest.log.toFixed(2)} log-units, ${fmtInit(largest.at)})` : ""}</div></div>
        <div className="panel-sec min-w-56 flex-[2]" data-testid="sig-flag"><div className="text-sm font-semibold">{t("region.sig_change")}</div>
          <div className="text-xs">{significant ? t("region.sig_yes") : t("region.sig_no")}</div></div>
      </div>
      <ChartTable title={`${t("region.evo_q1")} — ${fmtDate(valid)}`} table={table} chart={
        <EChart height={H} label={t("region.evo_q1")} option={{
          grid, xAxis: { type: "category", data: cats, axisLabel: { show: false } }, yAxis: { type: "value", name: "mm", nameGap: 8 },
          legend: { data: ["HRES", "Ensemble q10–q90"], right: 0 },
          tooltip: { trigger: "axis", valueFormatter: (v) => mm(v as number) },
          series: [
            { name: "q10", type: "bar", stack: "e", data: rows.map((x) => x.ens_q10), itemStyle: { color: "transparent" }, tooltip: { show: false }, barWidth: 14 },
            { name: "Ensemble q10–q90", type: "bar", stack: "e", data: rows.map((x, i) => ({ value: x.ens_q90 - x.ens_q10, itemStyle: { color: col(i), opacity: 0.35, borderRadius: 4 } })), barWidth: 14 },
            { name: "HRES", type: "line", data: rows.map((x, i) => ({ value: x.f_rain, itemStyle: { color: col(i) } })), lineStyle: { color: steps[steps.length - 1], width: 2 }, symbolSize: 9 },
          ],
        }} />
      } />
      <ChartTable title={t("region.evo_q2")} table={table} chart={
        <EChart height={H - 20} label={t("region.evo_q2")} option={{
          grid, xAxis: { type: "category", data: cats, axisLabel: { show: false } },
          yAxis: { type: "value", min: 0, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
          tooltip: { trigger: "axis", valueFormatter: (v) => pct(v as number, 1) },
          series: [{ name: "P(bust)", type: "line", step: "middle", data: rows.map((x) => x.p_bust), lineStyle: { width: 2, color: ink.text }, itemStyle: { color: ink.text }, symbolSize: 7,
            markLine: { silent: true, symbol: "none", label: { formatter: "10% base rate", position: "insideEndTop", color: ink.muted }, lineStyle: { type: "dashed", color: ink.muted }, data: [{ yAxis: 0.1 }] } }],
        }} />
      } />
      <ChartTable title={t("region.evo_q3")} table={table} chart={
        <EChart height={H} label={t("region.evo_q3")} option={{
          grid: { ...grid, bottom: 40 }, xAxis: { type: "category", data: cats, axisLabel: { rotate: 0, fontSize: 10 } },
          yAxis: { type: "value", name: "× normal", nameGap: 8 },
          tooltip: { trigger: "axis", valueFormatter: (v) => (v == null ? "–" : `${(v as number).toFixed(2)}×`) },
          series: [{ name: "Spread anomaly", type: "line", data: rows.map((x) => x.spread_anom ?? null), lineStyle: { width: 2, color: "#eb6834" }, itemStyle: { color: "#eb6834" }, symbolSize: 7,
            markLine: { silent: true, symbol: "none", label: { formatter: "1× normal", position: "insideEndTop", color: ink.muted }, lineStyle: { type: "dashed", color: ink.muted }, data: [{ yAxis: 1 }] } }],
        }} />
      } />
      <p className="text-xs text-muted-foreground">Cycles oldest (light) → newest (dark); only cycles issued up to {fmtInit(upto)} are shown. The three charts share the cycle axis.</p>
    </div>
  );
}
