import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import type { Map as MLMap } from "maplibre-gl";
import { useMatrix } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, prettyName, pct, mm, linkTo, fmtDate } from "@/lib/hooks";
import { useView } from "@/store";
import { RiskMap, type Layer } from "@/components/map/RiskMap";
import { ConfidenceBadge, DataTable, ErrorState, Loading, PbustLegend } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RAIN_LABELS, SEQ_BLUE, SEQ_BLUE_DARK, SEQ_ORANGE, SEQ_ORANGE_DARK, SPREAD_LABELS } from "@/theme/scales";

function SeqLegend({ labels, ramp, title }: { labels: string[]; ramp: string[]; title: string }) {
  return (
    <figure className="text-xs" aria-label={`${title} legend`}>
      <figcaption className="mb-0.5 text-muted-foreground">{title}</figcaption>
      <div className="flex gap-[2px]">
        {ramp.map((c, i) => (
          <div key={i} className="flex min-w-12 flex-col items-center">
            <span className="h-3 w-full rounded-sm border border-black/10 dark:border-white/10" style={{ background: c }} />
            <span className="tnum text-muted-foreground">{labels[i]}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function MapPage() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { init } = useInit();
  const m = useMatrix(init);
  const regions = useRegionMap();
  const v = useView();
  const day = Number(v.get("day") ?? 1);
  const layer = (v.get("layer") ?? "pbust") as Layer;
  const split = v.get("split") === "1";
  const sel = v.get("rid") != null ? Number(v.get("rid")) : undefined;
  const [playing, setPlaying] = useState(false);
  const [table, setTable] = useState(false);
  const sync = useRef<MLMap[]>([]);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const d = Number(new URLSearchParams(window.location.search).get("day") ?? 1);
      if (d >= 10) { setPlaying(false); return; }
      v.set({ day: d + 1 });
    }, reduced ? 1500 : 900);
    return () => clearInterval(id);
  }, [playing, v, reduced]);

  if (m.isLoading || !init) return <Loading />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  const cells = m.data!;
  const selCells = sel != null ? cells.filter((c) => c.rid === sel) : [];
  const selDay = selCells.find((c) => c.lead === day);
  const seqRamp = (orange: boolean) => (orange ? (theme === "dark" ? SEQ_ORANGE_DARK : SEQ_ORANGE) : theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE);

  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("map.title")}</h1>
        <label className="flex items-center gap-1 text-sm">{t("map.layer")}
          <select className="h-8 rounded-md border bg-card px-2" value={layer} onChange={(e) => v.set({ layer: e.target.value })} disabled={split}>
            <option value="pbust">{t("map.layer_pbust")}</option>
            <option value="rain">{t("map.layer_rain")}</option>
            <option value="spread">{t("map.layer_spread")}</option>
            <option value="novelty">{t("map.layer_novelty")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={split} onCheckedChange={(c) => v.set({ split: c ? 1 : undefined })} />{t("map.split")}</label>
        <Button size="sm" variant="outline" onClick={() => setTable(!table)} aria-pressed={table}>{table ? t("common.chart_view") : t("common.table_view")}</Button>
      </div>
      <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2" data-tour="scrubber">
        <Button size="sm" onClick={() => { if (day >= 10) v.set({ day: 1 }); setPlaying(!playing); }} aria-label={playing ? t("map.pause") : t("map.play")} data-testid="play">
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? t("map.pause") : t("map.play")}
        </Button>
        <Slider className="flex-1" min={1} max={10} step={1} value={[day]} onValueChange={([d]) => v.set({ day: d })} aria-label={t("common.day")} />
        <span className="tnum w-36 text-sm font-semibold" aria-live="polite">{t("common.day")} {day} · {fmtDate(cells.find((c) => c.lead === day)?.valid_date)}</span>
      </div>
      {table ? (
        <div className="flex-1 overflow-auto rounded-lg border">
          <DataTable
            cols={[
              { key: "rid", label: t("common.region"), fmt: (x) => prettyName(regions.get(x as number)?.name) },
              { key: "p_bust", label: "P(bust)", fmt: (x) => pct(x as number, 1) },
              { key: "confidence", label: t("common.confidence") },
              { key: "f_rain", label: t("common.forecast_rain"), fmt: (x) => mm(x as number) },
              { key: "spread_anom", label: t("common.spread_anom"), fmt: (x) => (x == null ? "–" : `${(x as number).toFixed(2)}×`) },
            ]}
            rows={cells.filter((c) => c.lead === day) as unknown as Record<string, unknown>[]}
          />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 gap-2">
          {split ? (
            <>
              <div className="flex flex-1 flex-col gap-1"><span className="text-xs font-medium">{t("map.layer_rain")}</span>
                <RiskMap cells={cells} day={day} layer="rain" orange theme={theme} syncRef={sync} selected={sel} onSelect={(rid) => v.set({ rid })} label={`${t("map.layer_rain")} map, day ${day}`} /></div>
              <div className="flex flex-1 flex-col gap-1"><span className="text-xs font-medium">P(bust)</span>
                <RiskMap cells={cells} day={day} layer="pbust" theme={theme} syncRef={sync} selected={sel} onSelect={(rid) => v.set({ rid })} label={`P(bust) map, day ${day}`} /></div>
            </>
          ) : (
            <RiskMap cells={cells} day={day} layer={layer} theme={theme} selected={sel} onSelect={(rid) => v.set({ rid })} label={`${t(`map.layer_${layer}`)} map, day ${day}. ${t("map.click_hint")}`} />
          )}
          {sel != null && (
            <aside className="absolute right-2 top-2 w-72 rounded-lg border bg-card p-3 shadow-lg" aria-label="Region details">
              <div className="flex items-start justify-between">
                <h2 className="font-semibold">{prettyName(regions.get(sel)?.name)}</h2>
                <button className="text-muted-foreground" aria-label="Close" onClick={() => v.set({ rid: undefined })}>×</button>
              </div>
              {selDay?.p_bust == null ? <p className="text-sm text-muted-foreground">{t("common.not_assessed_help")}</p> : (
                <>
                  <p className="text-sm">{t("common.day")} {day}: {pct(selDay.p_bust)} <ConfidenceBadge band={selDay.confidence} /></p>
                  <div className="my-2 flex items-end gap-[2px]" aria-label="P(bust) Day 1–10">
                    {selCells.sort((a, b) => a.lead - b.lead).map((c) => (
                      <div key={c.lead} title={`Day ${c.lead}: ${pct(c.p_bust)}`} className="flex flex-1 flex-col items-center">
                        <div className="w-full rounded-t-sm bg-foreground/60" style={{ height: `${Math.min(60, (c.p_bust ?? 0) * 150)}px` }} />
                        <span className="tnum text-[10px]">{c.lead}</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" asChild className="w-full"><Link to={linkTo(`/region/${sel}`, { day, tab: "overview" })}>{t("common.open_details")}</Link></Button>
                </>
              )}
            </aside>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {(split || layer === "pbust") && <PbustLegend compact />}
        {split && <SeqLegend labels={RAIN_LABELS} ramp={seqRamp(true)} title={t("map.layer_rain")} />}
        {!split && layer === "rain" && <SeqLegend labels={RAIN_LABELS} ramp={seqRamp(false)} title={t("map.layer_rain")} />}
        {!split && layer === "spread" && <SeqLegend labels={SPREAD_LABELS} ramp={seqRamp(false)} title={t("map.layer_spread")} />}
        {!split && layer === "novelty" && <SeqLegend labels={["<0.5", "0.5–1", "1–1.5", "1.5–2", "2–2.5", "2.5–3", "≥3"]} ramp={seqRamp(false)} title={t("map.layer_novelty")} />}
      </div>
    </div>
  );
}
