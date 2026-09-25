import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play, RotateCcw } from "lucide-react";
import { useEvents, useReplay } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, fmtInit, fmtDate, linkTo } from "@/lib/hooks";
import { useView } from "@/store";
import { ReliabilityMatrix } from "@/components/matrix/ReliabilityMatrix";
import { RiskMap } from "@/components/map/RiskMap";
import { ErrorState, Loading, PbustLegend } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function Replay() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const nav = useNavigate();
  const v = useView();
  const { cycles } = useInit();
  const events = useEvents();
  const ev = v.get("event") ?? v.get("init") ?? cycles[0];
  const r = useReplay(ev);
  const regions = useRegionMap();
  const reveal = Number(v.get("reveal") ?? 0);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      const cur = Number(new URLSearchParams(window.location.search).get("reveal") ?? 0);
      if (cur >= 10) { setAuto(false); return; }
      v.set({ reveal: cur + 1 });
    }, 1200);
    return () => clearInterval(id);
  }, [auto, v]);

  return (
    <div className="space-y-3" data-tour="replay">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t("replay.title")}</h1>
        <label className="flex items-center gap-1 text-sm">{t("replay.pick")}
          <select className="h-8 max-w-80 rounded-md border bg-card px-2" value={ev ?? ""} data-testid="event-picker"
            onChange={(e) => v.set({ event: e.target.value, reveal: undefined })}>
            <optgroup label="Frozen case list (configs/cases.yaml)">
              {(events.data ?? []).map((c) => (
                <option key={c.id} value={c.id} disabled={!c.available}>
                  {c.name} [{c.split}]{c.available ? "" : ` — ${t("replay.unavailable")}`}
                </option>
              ))}
            </optgroup>
            <optgroup label="Any cycle in the replay store">
              {cycles.map((c) => <option key={c} value={c}>{fmtInit(c)}</option>)}
            </optgroup>
          </select>
        </label>
      </div>
      {r.isLoading ? <Loading /> : r.error ? <ErrorState error={r.error} /> : r.data && (
        <>
          <div role="status" className="rounded-md border border-[#fab219] bg-[#fab219]/10 px-3 py-2 text-sm font-medium" data-testid="replay-banner">
            REPLAY · {t("replay.banner", { init: fmtInit(r.data.init) })} · {r.data.event.name}
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => v.set({ reveal: Math.min(10, reveal + 1) })} disabled={reveal >= 10} data-testid="advance">
              <Play className="size-4" aria-hidden />{t("replay.play")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAuto(!auto)} aria-pressed={auto}>{auto ? "⏸" : "▶▶"} auto</Button>
            <Button size="sm" variant="outline" onClick={() => v.set({ reveal: undefined })}><RotateCcw className="size-4" aria-hidden />{t("replay.reset")}</Button>
            <span className="tnum text-sm" aria-live="polite">
              {reveal === 0 ? "Issue time — no observations yet" : `Truth revealed through Day ${reveal} (${fmtDate(r.data.cells.find((c) => c.lead === reveal)?.valid_date)})`}
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ReliabilityMatrix cells={r.data.cells} regions={regions} reveal={reveal} compact
              onCell={(rid, d) => nav(linkTo(`/region/${rid}`, { init: r.data!.init, day: d, tab: "why" }, []))} />
            <div className="flex h-[520px] flex-col gap-1">
              <span className="text-xs text-muted-foreground">Map: P(bust) at issue time for Day {Math.max(1, reveal)}</span>
              <RiskMap cells={r.data.cells} day={Math.max(1, reveal)} layer="pbust" theme={theme} label={`Replay P(bust) map, day ${Math.max(1, reveal)}`} />
            </div>
          </div>
          <PbustLegend compact />
          <section className="sticky bottom-0 rounded-lg border bg-card p-3" aria-label={t("replay.ticker")} data-testid="ticker">
            {(() => {
              const tk = r.data.ticker.find((x) => x.day === reveal);
              if (!tk) return <p className="text-sm text-muted-foreground">{t("replay.ticker")}: advance a day to start scoring.</p>;
              return (
                <div className="flex flex-wrap gap-6 text-sm">
                  <span><strong className="tnum text-lg">{tk.hits}</strong> {t("replay.hits")} ✓</span>
                  <span><strong className="tnum text-lg">{tk.misses}</strong> {t("replay.misses")} ✗</span>
                  <span><strong className="tnum text-lg">{tk.false_alarms}</strong> {t("replay.fas")} !</span>
                  <span>{t("replay.brier")}: <strong className="tnum">{tk.brier?.toFixed(4) ?? "–"}</strong> · {t("replay.vs_b2")} <span className="tnum">{tk.brier_b2?.toFixed(4) ?? "–"}</span></span>
                  <span className="text-muted-foreground">n = {tk.n} cells</span>
                </div>
              );
            })()}
          </section>
        </>
      )}
    </div>
  );
}
