import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pause, Play, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { useEvents, useReplay, type Cell } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, fmtInit, fmtDate, linkTo, prettyName, pct, mm } from "@/lib/hooks";
import { useView } from "@/store";
import { ReliabilityMatrix } from "@/components/matrix/ReliabilityMatrix";
import { RiskMap } from "@/components/map/RiskMap";
import { EvolutionView } from "@/components/region/EvolutionView";
import { ConfidenceBadge, ErrorState, Loading, PbustLegend } from "@/components/common";
import { Button } from "@/components/ui/button";
import { pbustColor, seqColor, RAIN_EDGES, SEQ_BLUE, SEQ_BLUE_DARK } from "@/theme/scales";
import { cn } from "@/lib/utils";

const ACTS = [
  { n: 1, title: "What we predicted", sub: "The matrix and map exactly as issued" },
  { n: 2, title: "How the forecast evolved", sub: "Cycle-by-cycle history for the key valid dates" },
  { n: 3, title: "What actually happened", sub: "IMD truth arrives day by day" },
] as const;

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
  const act = Math.min(3, Math.max(1, Number(v.get("act") ?? (v.get("reveal") ? 3 : 1))));
  const reveal = act === 3 ? Number(v.get("reveal") ?? 0) : 0;
  const day = Number(v.get("day") ?? 1);
  const key = Number(v.get("key") ?? 0);
  const [auto, setAuto] = useState(false);

  // read the live URL (not the last render) so rapid clicks each move exactly one day
  const cur = () => Number(new URLSearchParams(window.location.search).get("reveal") ?? 0);
  const step = (dlt: number) => v.set({ act: 3, reveal: Math.min(10, Math.max(0, cur() + dlt)) });
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { const c = cur(); if (c >= 10) { setAuto(false); return; } v.set({ act: 3, reveal: c + 1 }); }, 1400);
    return () => clearInterval(id);
  }, [auto, v]);

  const keyCells = useMemo(() => (r.data?.cells ?? []).filter((c) => c.p_bust != null)
    .sort((a, b) => (b.p_bust ?? 0) - (a.p_bust ?? 0)).slice(0, 3), [r.data]);
  const obsOf = useMemo(() => (c?: Cell) => {
    if (!c || c.p_bust == null) return theme === "dark" ? "#262625" : "#e8e7e1";
    return c.o_rain == null ? "transparent" : seqColor(c.o_rain, RAIN_EDGES, theme === "dark" ? SEQ_BLUE_DARK : SEQ_BLUE);
  }, [theme]);
  const obsTip = useMemo(() => (c?: Cell) => (c?.o_rain == null ? "No IMD truth" : `IMD observed ${mm(c.o_rain)} · forecast ${mm(c.f_rain)}${c.outcome ? ` · ${c.outcome}` : ""}`), []);
  const pOf = useMemo(() => (c?: Cell) => pbustColor(c?.p_bust, theme), [theme]);

  const mapDay = act === 3 ? Math.max(1, reveal) : day;
  const tk = r.data?.ticker.find((x) => x.day === reveal);

  return (
    <div className="space-y-2" data-tour="replay">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{t("replay.title")}</h1>
        <span className="rounded border border-[#fab219] bg-[#fab219]/15 px-2 py-0.5 text-xs font-bold" data-testid="demo-badge">REPLAY · DEMO — not the operational feed</span>
        <label className="ml-auto flex items-center gap-1 text-sm">{t("replay.pick")}
          <select className="h-8 max-w-80 rounded-md border bg-card px-2" value={ev ?? ""} data-testid="event-picker"
            onChange={(e) => v.set({ event: e.target.value, reveal: undefined, act: 1, key: undefined })}>
            <optgroup label="Frozen case list (configs/cases.yaml)">
              {(events.data ?? []).map((c) => (
                <option key={c.id} value={c.id} disabled={!c.available}>{c.name} [{c.split}]{c.available ? "" : ` — ${t("replay.unavailable")}`}</option>
              ))}
            </optgroup>
            <optgroup label="Any cycle in the replay store">{cycles.map((c) => <option key={c} value={c}>{fmtInit(c)}</option>)}</optgroup>
          </select>
        </label>
      </div>

      {/* progress rail */}
      <ol className="panel grid grid-cols-3" aria-label="Story progress" data-testid="progress-rail">
        {ACTS.map((a) => (
          <li key={a.n} className="hair-r last:border-r-0">
            <button type="button" onClick={() => v.set({ act: a.n, reveal: a.n === 3 && reveal > 0 ? reveal : undefined })}
              aria-current={act === a.n ? "step" : undefined} data-testid={`act-${a.n}`}
              className={cn("flex w-full flex-col items-start px-4 py-2 text-left", act === a.n ? "bg-accent" : "hover:bg-accent/60")}>
              <span className="text-xs text-muted-foreground">{act > a.n ? "✓ " : ""}Act {a.n}</span>
              <span className="text-sm font-semibold">{a.title}</span>
              <span className="text-xs text-muted-foreground">{a.sub}</span>
              <span className="mt-1 h-1 w-full rounded-full bg-muted"><span className="block h-1 rounded-full bg-foreground"
                style={{ width: act > a.n ? "100%" : act === a.n ? (a.n === 3 ? `${(reveal / 10) * 100}%` : "50%") : "0%" }} /></span>
            </button>
          </li>
        ))}
      </ol>

      {r.isLoading ? <Loading /> : r.error ? <ErrorState error={r.error} /> : r.data && (
        <>
          <div role="status" className="rounded border border-[#fab219] bg-[#fab219]/10 px-3 py-1.5 text-sm font-medium" data-testid="replay-banner">
            REPLAY · {t("replay.banner", { init: fmtInit(r.data.init) })} · {r.data.event.name}
          </div>

          {act === 1 && (
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="act1">
              <ReliabilityMatrix cells={r.data.cells} regions={regions} compact
                onCell={(rid, d) => nav(linkTo(`/region/${rid}`, { init: r.data!.init, day: d, tab: "why" }, []))} />
              <div className="flex h-[520px] flex-col gap-1">
                <div className="flex items-center gap-1 text-xs"><span className="text-muted-foreground">Issued P(bust), Day</span>
                  {[...Array(10)].map((_, i) => (
                    <button key={i} type="button" onClick={() => v.set({ day: i + 1 })} aria-pressed={day === i + 1}
                      className={cn("tnum rounded px-1.5", day === i + 1 ? "bg-foreground text-background" : "hover:bg-accent")}>{i + 1}</button>
                  ))}</div>
                <RiskMap cells={r.data.cells} day={day} layer="pbust" theme={theme} colorOf={pOf} label={`As issued: P(bust) map, day ${day}`} />
                <PbustLegend compact />
              </div>
            </div>
          )}

          {act === 2 && (
            <div className="space-y-2" data-testid="act2">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Key valid dates">
                {keyCells.map((c, i) => (
                  <button key={`${c.rid}-${c.lead}`} role="tab" aria-selected={key === i} onClick={() => v.set({ key: i })}
                    className={cn("flex items-center gap-2 rounded border px-3 py-1 text-sm", key === i ? "border-foreground bg-accent" : "hover:bg-accent")}>
                    {prettyName(regions.get(c.rid)?.name)} · {fmtDate(c.valid_date)} · {pct(c.p_bust)} <ConfidenceBadge band={c.confidence} />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Key valid dates = the three highest-risk cells at issue time. Cycles shown are those issued up to the valid date.</p>
              {keyCells[key] && <EvolutionView rid={keyCells[key].rid} valid={keyCells[key].valid_date} upto={keyCells[key].valid_date} compact />}
            </div>
          )}

          {act === 3 && (
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" data-testid="act3">
              <ReliabilityMatrix cells={r.data.cells} regions={regions} reveal={reveal} compact
                onCell={(rid, d) => nav(linkTo(`/region/${rid}`, { init: r.data!.init, day: d, tab: "verify" }, []))} />
              <div className="flex h-[520px] gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs text-muted-foreground">Issued P(bust) · Day {mapDay}</span>
                  <RiskMap cells={r.data.cells} day={mapDay} layer="pbust" theme={theme} colorOf={pOf} label={`Issued P(bust), day ${mapDay}`} /></div>
                <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-xs text-muted-foreground">IMD observed rain · Day {mapDay} {reveal === 0 && "(not yet revealed)"}</span>
                  <div key={reveal} className={cn("h-full transition-opacity duration-700 motion-reduce:transition-none", reveal === 0 ? "opacity-0" : "opacity-100")} data-testid="truth-map">
                    <RiskMap cells={r.data.cells} day={mapDay} layer="rain" theme={theme} colorOf={obsOf} tipOf={obsTip} label={`IMD observed rain, day ${mapDay}`} />
                  </div></div>
              </div>
            </div>
          )}

          {/* controls + ticker */}
          <section className="panel sticky bottom-0 z-20 flex flex-wrap items-center gap-3 px-4 py-2 shadow-sm" aria-label={t("replay.ticker")} data-testid="ticker">
            <div className="no-print flex items-center gap-1">
              <Button size="icon" variant="outline" aria-label="Step back" onClick={() => step(-1)} disabled={act === 3 && reveal <= 0}><SkipBack className="size-4" /></Button>
              <Button size="sm" onClick={() => { if (act !== 3) v.set({ act: 3, reveal: Math.max(0, reveal) }); setAuto(!auto); }} aria-pressed={auto} data-testid="play-pause">
                {auto ? <Pause className="size-4" /> : <Play className="size-4" />}{auto ? "Pause" : "Play"}
              </Button>
              <Button size="icon" variant="outline" aria-label="Step forward" onClick={() => step(1)} disabled={act === 3 && reveal >= 10} data-testid="advance"><SkipForward className="size-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={t("replay.reset")} onClick={() => { setAuto(false); v.set({ act: 1, reveal: undefined }); }}><RotateCcw className="size-4" /></Button>
            </div>
            <span className="tnum text-sm" aria-live="polite" data-testid="reveal-label">
              {act !== 3 ? "Truth hidden until Act 3" : reveal === 0 ? "Issue time — no observations yet" : `Truth revealed through Day ${reveal} (${fmtDate(r.data.cells.find((c) => c.lead === reveal)?.valid_date)})`}
            </span>
            {tk ? (
              <div className="ml-auto flex flex-wrap items-baseline gap-5 text-sm">
                <span><strong className="kpi-sm">{tk.hits}</strong> {t("replay.hits")} ✓</span>
                <span><strong className="kpi-sm">{tk.misses}</strong> {t("replay.misses")} ✗</span>
                <span><strong className="kpi-sm">{tk.false_alarms}</strong> {t("replay.fas")} !</span>
                <span>{t("replay.brier")} <strong className="tnum">{tk.brier?.toFixed(4) ?? "–"}</strong> · {t("replay.vs_b2")} <span className="tnum">{tk.brier_b2?.toFixed(4) ?? "–"}</span></span>
                <span className="text-muted-foreground">n = {tk.n}</span>
              </div>
            ) : <span className="ml-auto text-sm text-muted-foreground">{t("replay.ticker")}: advance a day in Act 3 to start scoring.</span>}
          </section>
        </>
      )}
    </div>
  );
}
