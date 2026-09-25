import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useResolvedTheme } from "@/lib/hooks";
import { chartInk } from "@/theme/scales";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Theme-aware ECharts: recessive grid/axes, system font, tooltips on, animation respects reduced motion. */
export function EChart({ option, height = 220, label }: { option: EChartsOption; height?: number; label: string }) {
  const theme = useResolvedTheme();
  const ink = chartInk(theme);
  const axis = (a: unknown) =>
    Array.isArray(a) ? a.map(axis) : a && typeof a === "object"
      ? { axisLine: { lineStyle: { color: ink.axis } }, axisTick: { show: false },
          axisLabel: { color: ink.muted, fontSize: 11 }, splitLine: { lineStyle: { color: ink.grid } },
          nameTextStyle: { color: ink.muted, fontSize: 11 }, ...(a as object) }
      : a;
  const opt: EChartsOption = {
    animation: !reduced(),
    animationDuration: 250,
    textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: ink.text },
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", backgroundColor: ink.surface, borderColor: ink.axis, textStyle: { color: ink.text, fontSize: 12 } },
    grid: { left: 48, right: 16, top: 28, bottom: 32 },
    ...option,
    xAxis: axis(option.xAxis) as EChartsOption["xAxis"],
    yAxis: axis(option.yAxis) as EChartsOption["yAxis"],
    legend: option.legend ? { textStyle: { color: ink.text2 }, top: 0, ...(option.legend as object) } : undefined,
  };
  return (
    <div role="img" aria-label={label}>
      <ReactECharts option={opt} style={{ height }} notMerge lazyUpdate />
    </div>
  );
}
