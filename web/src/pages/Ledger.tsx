import { useTranslation } from "react-i18next";
import type { EChartsOption, CustomSeriesRenderItemAPI, CustomSeriesRenderItemReturn } from "echarts";
import { useLedger } from "@/api/client";
import { useResolvedTheme, pct } from "@/lib/hooks";
import { ChartTable, DataTable, EmptyState, ErrorState, Loading } from "@/components/common";
import { EChart } from "@/components/common/EChart";
import { SERIES, chartInk } from "@/theme/scales";

const MODEL_LABEL: Record<string, string> = { b0: "B0 climatology", b2: "B2 ensemble spread", model: "PURVA-NETRA model" };

export default function Ledger() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const ink = chartInk(theme);
  const l = useLedger();
  if (l.isLoading) return <Loading />;
  if (l.error) return <ErrorState error={l.error} />;
  const d = l.data!;
  if (!d.available)
    return (
      <div data-tour="ledger">
        <h1 className="mb-2 text-xl font-semibold">{t("ledger.title")}</h1>
        <EmptyState title={t("ledger.unavailable")}>{d.reason} (model version: {d.version})</EmptyState>
      </div>
    );
  const rel = d.reliability ?? [];
  const sk = d.skill_by_lead ?? [];
  const models = [...new Set(sk.map((s) => s.model))];
  const colors = SERIES[theme];
  return (
    <div className="space-y-3" data-tour="ledger">
      <h1 className="text-xl font-semibold">{t("ledger.title")}</h1>
      {d.headline && <p className="text-sm">{d.headline}</p>}
      {d.gate && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: d.gate.passed ? "#0ca30c" : "#d03b3b" }}>
          <span aria-hidden>{d.gate.passed ? "✓ " : "◆ "}</span>{d.gate.text}
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        <ChartTable
          title={`${t("ledger.reliability")} (${d.split ?? ""} ${d.years?.join(", ") ?? ""})`}
          chart={
            <EChart
              height={320}
              label="Reliability diagram: forecast probability vs observed bust frequency"
              option={{
                xAxis: { type: "value", min: 0, max: 1, name: "forecast P(bust)", nameLocation: "middle", nameGap: 24, axisLabel: { formatter: (v: number) => `${v * 100}%` } },
                yAxis: { type: "value", min: 0, max: 1, name: "observed frequency", axisLabel: { formatter: (v: number) => `${v * 100}%` } },
                tooltip: { trigger: "item", formatter: (p: unknown) => { const x = (p as { data: [number, number, number] }).data; return `forecast ${pct(x[0], 1)} → observed ${pct(x[1], 1)}<br/>n = ${x[2]}`; } },
                series: [
                  { type: "line", data: [[0, 0], [1, 1]], symbol: "none", lineStyle: { type: "dashed", color: ink.muted, width: 1 }, silent: true, tooltip: { show: false } },
                  { type: "line", name: "model", data: rel.filter((r) => r.n > 0).map((r) => [r.mean_p, r.obs_freq, r.n]), symbolSize: (v: number[]) => Math.max(8, Math.min(22, Math.sqrt(v[2]) / 3)), lineStyle: { width: 2, color: colors.model }, itemStyle: { color: colors.model, borderColor: ink.surface, borderWidth: 2 } },
                ],
              }}
            />
          }
          table={<DataTable cols={[{ key: "bin_lo", label: "bin", fmt: (v, r) => `${pct(v as number)}–${pct(r.bin_hi as number)}` }, { key: "n", label: "n" }, { key: "mean_p", label: "mean forecast", fmt: (v) => pct(v as number, 1) }, { key: "obs_freq", label: "observed", fmt: (v) => pct(v as number, 1) }]} rows={rel as unknown as Record<string, unknown>[]} />}
        />
        <ChartTable
          title={t("ledger.skill")}
          chart={
            <EChart
              height={320}
              label="Brier skill score by lead day with 95% confidence intervals"
              option={{
                legend: { data: models.map((m) => MODEL_LABEL[m] ?? m) },
                xAxis: { type: "category", data: [...Array(10)].map((_, i) => `D${i + 1}`) },
                yAxis: { type: "value", name: "BSS vs B0" },
                tooltip: { trigger: "axis", valueFormatter: (v) => (v as number)?.toFixed(3) },
                series: models.flatMap((m) => {
                  const c = colors[m as keyof typeof colors] ?? ink.text;
                  const rows = sk.filter((s) => s.model === m).sort((a, b) => a.lead - b.lead);
                  return [
                    { name: MODEL_LABEL[m] ?? m, type: "line" as const, data: rows.map((r) => r.bss_vs_b0), lineStyle: { width: 2, color: c }, itemStyle: { color: c }, symbolSize: 8,
                      endLabel: { show: true, formatter: MODEL_LABEL[m] ?? m, color: ink.text2, fontSize: 11 } },
                    { name: `${m} CI`, type: "custom" as const, silent: true, tooltip: { show: false },
                      renderItem: (_p: unknown, api: CustomSeriesRenderItemAPI) => {
                        const x = Number(api.value(0)), lo = api.coord([x, Number(api.value(1))]), hi = api.coord([x, Number(api.value(2))]);
                        return { type: "group", children: [
                          { type: "line", shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style: { stroke: c, lineWidth: 1.5 } },
                          { type: "line", shape: { x1: lo[0] - 4, y1: lo[1], x2: lo[0] + 4, y2: lo[1] }, style: { stroke: c, lineWidth: 1.5 } },
                          { type: "line", shape: { x1: hi[0] - 4, y1: hi[1], x2: hi[0] + 4, y2: hi[1] }, style: { stroke: c, lineWidth: 1.5 } },
                        ] } as CustomSeriesRenderItemReturn;
                      },
                      data: rows.map((r) => [r.lead - 1, r.lo, r.hi]) },
                  ];
                }) as EChartsOption["series"],
                grid: { right: 120, left: 48, top: 36, bottom: 32 },
              }}
            />
          }
          table={<DataTable cols={[{ key: "model", label: "model", fmt: (v) => MODEL_LABEL[v as string] ?? String(v) }, { key: "lead", label: t("common.day") }, { key: "bss_vs_b0", label: "BSS", fmt: (v) => (v as number).toFixed(3) }, { key: "lo", label: "95% lo", fmt: (v) => (v as number).toFixed(3) }, { key: "hi", label: "95% hi", fmt: (v) => (v as number).toFixed(3) }]} rows={sk as unknown as Record<string, unknown>[]} />}
        />
      </div>
      {d.scores && (
        <section className="rounded-lg border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Scores ({d.split} {d.years?.join(", ")})</h2>
          <DataTable
            cols={[{ key: "model", label: "model" }, ...Object.keys(Object.values(d.scores)[0] ?? {}).map((k) => ({ key: k, label: k, fmt: (v: unknown) => (typeof v === "number" ? v.toFixed(4) : String(v)) }))]}
            rows={Object.entries(d.scores).map(([m, s]) => ({ model: MODEL_LABEL[m] ?? m, ...s }))}
          />
        </section>
      )}
    </div>
  );
}
