import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useCycles, useExplain, useRegion, useRevision, type Cell, type Explain } from "@/api/client";
import { dnaBars, chartInk } from "@/theme/scales";
import { momentum, cycleVerdict, evidenceTimeline, isElevated, RULES } from "@/lib/spatial";
import { pct, pts, mm, fmtDate, fmtInit, linkTo, prettyName, useLang, useResolvedTheme } from "@/lib/hooks";
import { ConfidenceBadge, DataTable, Loading } from "@/components/common";
import { EChart } from "@/components/common/EChart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Sec({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return <section className="panel-sec" data-testid={testid}><h4 className="panel-title mb-1">{title}</h4>{children}</section>;
}
const NA_TEXT = "Not available in this model version";

function Trajectory({ traj, day, onDay }: { traj: (number | null)[]; day: number; onDay: (d: number) => void }) {
  const theme = useResolvedTheme();
  const ink = chartInk(theme);
  const mo = momentum(traj);
  const arrow = mo.m === "deteriorating" ? "↓ DETERIORATING" : mo.m === "improving" ? "↑ IMPROVING" : "→ STABLE";
  return (
    <Sec title="Trust trajectory · P(Bust) D1 → D10" testid="trajectory">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="rounded border px-1.5 py-0.5 font-semibold" data-testid="momentum" data-momentum={mo.m}>{arrow}</span>
        <span className="text-muted-foreground">
          {mo.slopePtsPerDay == null ? "too few days" : `${mo.slopePtsPerDay >= 0 ? "+" : ""}${mo.slopePtsPerDay.toFixed(1)} pts/day`} ·
          descriptive rule: least-squares slope &gt; +{RULES.momentumPtsPerDay} pts/day = deteriorating, &lt; −{RULES.momentumPtsPerDay} = improving, else stable. Not an ML prediction.
        </span>
      </div>
      <EChart height={110} label={`P(bust) by lead day: ${traj.map((p, i) => `D${i + 1} ${pct(p)}`).join(", ")}`}
        option={{
          grid: { left: 36, right: 8, top: 8, bottom: 20 },
          xAxis: { type: "category", data: traj.map((_, i) => `D${i + 1}`) },
          yAxis: { type: "value", min: 0, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
          tooltip: { trigger: "axis", valueFormatter: (v) => pct(v as number, 1) },
          series: [{ name: "P(bust)", type: "line", data: traj, lineStyle: { width: 2, color: ink.text }, itemStyle: { color: ink.text }, symbolSize: 6,
            markLine: { silent: true, symbol: "none", label: { formatter: "10%", position: "insideEndTop", color: ink.muted }, lineStyle: { type: "dashed", color: ink.muted }, data: [{ yAxis: 0.1 }] },
            markPoint: { symbol: "circle", symbolSize: 12, itemStyle: { color: "transparent", borderColor: ink.text, borderWidth: 2 }, label: { show: false }, data: [{ name: "day", coord: [`D${day}`, traj[day - 1] ?? 0] }] } }],
        }} />
      <div className="mt-1 flex gap-0.5" role="group" aria-label="Select day from trajectory">
        {traj.map((p, i) => (
          <button key={i} type="button" onClick={() => onDay(i + 1)} aria-pressed={day === i + 1}
            className={cn("tnum flex-1 rounded border py-0.5 text-[10px]", day === i + 1 ? "border-foreground" : "border-transparent hover:border-border")}>
            D{i + 1}<br />{p == null ? "–" : Math.round(p * 100)}
          </button>
        ))}
      </div>
    </Sec>
  );
}

function CycleChange({ cell, cur, prev }: { cell: Cell; cur?: Explain; prev?: Explain }) {
  const { v, deltaPts } = cycleVerdict(cell.p_bust, cell.p_bust_prev);
  const verdict = v === "deteriorated" ? "▼ TRUST DETERIORATED" : v === "improved" ? "▲ TRUST IMPROVED" : v === "unchanged" ? "→ UNCHANGED" : "– NO PREVIOUS CYCLE";
  // Exact attribution of the change in log-odds from the existing per-cycle SHAP values (linear B2).
  const shapDiffs: { k: string; d: number }[] = [];
  const cg = cur?.group_contributions, pg = prev?.group_contributions;
  if (cg && pg && cg.source && pg.source) {
    for (const g of cg.groups) {
      const p = pg.groups.find((x) => x.group === g.group);
      if (g.available && p?.available && g.value != null && p.value != null) shapDiffs.push({ k: g.group, d: g.value - p.value });
    }
    for (const [k, val] of Object.entries(cg.other_terms ?? {})) {
      const p = pg.other_terms?.[k];
      if (p != null) shapDiffs.push({ k: k.replace("term:", "") + " term", d: val - p });
    }
  }
  return (
    <Sec title="Cycle change · same valid date" testid="cycle-change">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-[11px] text-muted-foreground">Previous cycle</div><div className="kpi-sm" data-testid="cc-prev">{pct(cell.p_bust_prev)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Current cycle</div><div className="kpi-sm" data-testid="cc-cur">{pct(cell.p_bust)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Change</div><div className="kpi-sm" data-testid="cc-delta">{deltaPts == null ? "–" : pts(deltaPts / 100)}</div></div>
      </div>
      <p className="mt-1 text-xs font-semibold" data-testid="cc-verdict" data-verdict={v}>{verdict}</p>
      <p className="text-[11px] text-muted-foreground">Verdict from the sign of the change only (|change| &lt; {RULES.cycleUnchangedPts} pts = unchanged).</p>
      <div className="mt-1 text-xs" data-testid="cc-reason">
        {shapDiffs.length > 0 ? (
          <>
            <div className="text-muted-foreground">Change in model evidence (SHAP, log-odds) between the two cycles:</div>
            <ul className="tnum">{shapDiffs.map((x) => <li key={x.k}>{x.k}: {x.d >= 0 ? "+" : ""}{x.d.toFixed(2)} {x.d > 0 ? "(raises risk)" : x.d < 0 ? "(lowers risk)" : ""}</li>)}</ul>
          </>
        ) : v === "unavailable" ? null : <span className="text-muted-foreground">Reason unavailable in this model version.</span>}
      </div>
    </Sec>
  );
}

function WhySection({ cell, ex }: { cell: Cell; ex?: Explain }) {
  const lang = useLang();
  const elevated = isElevated(cell);
  const bars = ex?.group_contributions ? dnaBars(ex.group_contributions.groups) : [];
  const reasons = ex ? (lang === "hi" ? ex.reasons_hi : ex.reasons_en) : [];
  return (
    <Sec title={elevated ? "Why is this region higher risk?" : "Why is trust at this level?"} testid="why-red">
      <ol className="space-y-1.5 text-xs">
        <li><span className="font-semibold">1 · Prediction</span> — P(bust) {pct(cell.p_bust)} <ConfidenceBadge band={cell.confidence} /></li>
        <li>
          <span className="font-semibold">2 · Evidence</span> <span className="text-muted-foreground">(SHAP by evidence group; → raises, ← lowers)</span>
          {!ex ? <Loading /> : (
            <ul className="mt-0.5 space-y-0.5">
              {bars.map((b) => (
                <li key={b.group} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-1" data-testid={`ev-${b.group}`} data-available={b.available}>
                  <span className={b.available ? "" : "text-muted-foreground"}>{b.label}</span>
                  {b.available ? (
                    <span className="relative h-2.5 rounded-sm bg-muted/60" aria-hidden>
                      <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
                      <span className="absolute inset-y-0.5 rounded-sm" style={{ width: `${b.widthPct / 2}%`, left: b.side === "raises" ? "50%" : `${50 - b.widthPct / 2}%`,
                        background: b.side === "raises" ? "var(--dna-up)" : "var(--dna-down)" }} />
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground">{NA_TEXT}</span>}
                  <span className="tnum text-right text-muted-foreground">{b.available ? `${b.value! >= 0 ? "+" : ""}${b.value!.toFixed(2)}` : "–"}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
        <li>
          <span className="font-semibold">3 · Explanation</span> <span className="text-muted-foreground">(fixed templates{ex?.source === "rule" ? ", ranked by fixed rules" : ""})</span>
          {reasons.length ? <ul className="mt-0.5 list-disc pl-4">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            : <p className="text-muted-foreground">No factor raises risk above usual for this cell.</p>}
        </li>
      </ol>
    </Sec>
  );
}

function Timeline({ rid, valid, upto }: { rid: number; valid: string; upto: string }) {
  const r = useRevision(rid, valid, upto);
  if (r.isLoading) return <Sec title="Evidence timeline"><Loading /></Sec>;
  const steps = evidenceTimeline(r.data ?? []);
  return (
    <Sec title={`When did trust change? · valid ${fmtDate(valid)}`} testid="timeline">
      {steps.length <= 1 ? <p className="text-xs text-muted-foreground" data-testid="timeline-na">Only one cycle so far for this valid date — no history to compare.</p> : (
        <ol className="space-y-1 text-xs">
          {steps.map((s, i) => (
            <li key={s.init}>
              {i > 0 && s.changes.length > 0 && <div className="border-l-2 border-dotted pl-2 text-muted-foreground">↓ {s.changes.join(" · ")}</div>}
              <div className="flex items-center justify-between gap-2"><span>{fmtInit(s.init)} · D{s.lead}</span>
                <span className="tnum font-semibold">P(bust) {pct(s.p)}{s.dP != null && <span className="ml-1 font-normal text-muted-foreground">({pts(s.dP)})</span>}</span></div>
            </li>
          ))}
        </ol>
      )}
    </Sec>
  );
}

function Ensemble({ day }: { day?: { ens_q10: number | null; ens_q90: number | null; ens_mean: number | null; f_rain: number | null; spread_anom: number | null } }) {
  if (!day) return null;
  const hi = Math.max(1, day.ens_q90 ?? 0, day.f_rain ?? 0) * 1.1;
  const x = (v: number | null) => `${((v ?? 0) / hi) * 100}%`;
  const s = day.spread_anom;
  const level = s == null ? "unknown" : s < 1 ? "LOW DISAGREEMENT" : s <= 1.5 ? "MODERATE DISAGREEMENT" : "HIGH DISAGREEMENT";
  return (
    <Sec title="Ensemble disagreement" testid="ensemble">
      <p className="text-xs"><strong>{level}</strong> · spread {s == null ? "–" : `${s.toFixed(2)}× normal`} <span className="text-muted-foreground">(&lt;1× low · 1–1.5× moderate · &gt;1.5× high; relative to this region, lead and month)</span></p>
      <div className="relative mt-2 h-6 rounded bg-muted/50" role="img"
        aria-label={`Ensemble q10 ${mm(day.ens_q10)} to q90 ${mm(day.ens_q90)}, mean ${mm(day.ens_mean)}, HRES ${mm(day.f_rain)}`}>
        <span className="absolute inset-y-1 rounded bg-[#3987e5]/40" style={{ left: x(day.ens_q10), width: `calc(${x(day.ens_q90)} - ${x(day.ens_q10)})` }} />
        <span className="absolute inset-y-0 w-0.5 bg-[#256abf]" style={{ left: x(day.ens_mean) }} title="ensemble mean" />
        <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: x(day.f_rain) }} title="HRES" />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground"><span>0 mm</span><span>{hi.toFixed(0)} mm</span></div>
      <p className="text-[11px] text-muted-foreground">Band q10–q90 {mm(day.ens_q10)}–{mm(day.ens_q90)} · ▏ensemble mean {mm(day.ens_mean)} · ▌HRES {mm(day.f_rain)}.
        Individual member values are not stored (only mean, q10, q90, spread) — a member histogram is not available.</p>
    </Sec>
  );
}

function Analogs({ ex, cycles }: { ex?: Explain; cycles: string[] }) {
  const a = ex?.analogs ?? [];
  return (
    <Sec title="Have we seen this before? · analogs" testid="analogs">
      {a.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="analogs-na">No analog cases — the analog memory is {NA_TEXT.toLowerCase()} (needs the 2018–2022 archive). Nothing is shown rather than invented.</p> : (
        <ul className="grid gap-1">
          {a.slice(0, 5).map((c, i) => {
            const inStore = cycles.includes(c.init.slice(0, 16).replace(" ", "T"));
            return (
              <li key={i} className="rounded border p-1.5 text-xs">
                <div className="font-semibold">{fmtInit(c.init)}{c.lead != null && ` · D${c.lead}`}{c.similarity != null && ` · similarity ${(c.similarity * 100).toFixed(0)}%`}</div>
                {c.f_rain != null && <div>forecast {c.f_rain.toFixed(0)} mm → observed {c.o_rain?.toFixed(0)} mm · {c.bust ? "✗ busted" : "✓ no bust"}</div>}
                {inStore ? <Link className="underline" to={`/replay?event=${encodeURIComponent(c.init)}&act=3`}>Replay this case</Link>
                  : <span className="text-muted-foreground">Not in the replay store</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Sec>
  );
}

/** Region investigation panel on the Map: consumes only existing endpoints. */
export function Investigation({ rid, name, day, init, cells, onDay, onClose }: {
  rid: number; name: string; day: number; init: string; cells: Cell[]; onDay: (d: number) => void; onClose: () => void;
}) {
  const rc = cells.filter((c) => c.rid === rid).sort((a, b) => a.lead - b.lead);
  const cell = rc.find((c) => c.lead === day);
  const traj = [...Array(10)].map((_, i) => rc.find((c) => c.lead === i + 1)?.p_bust ?? null);
  const reg = useRegion(rid, init);
  const ex = useExplain(rid, init, day);
  const rev = useRevision(rid, cell?.valid_date, init);
  const prevRow = rev.data && rev.data.length >= 2 ? rev.data[rev.data.length - 2] : undefined;
  const prevInit = prevRow?.init;
  const exPrev = useExplain(prevRow ? rid : undefined, prevInit, prevRow?.lead);
  const cycles = (useCycles().data ?? []).map((c) => c.init);
  const rd = reg.data?.days.find((d) => d.lead === day);
  return (
    <aside className="panel flex h-full flex-col overflow-hidden" aria-label={`${name} investigation`} data-testid="investigation">
      <div className="panel-sec flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold leading-tight" data-testid="inv-name">{prettyName(name)}</h3>
          <p className="text-xs text-muted-foreground">Day {day} · valid {fmtDate(cell?.valid_date)} · cycle {fmtInit(init)}</p>
        </div>
        <button type="button" aria-label="Close investigation" onClick={onClose} className="text-muted-foreground"><X className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!cell || cell.p_bust == null ? (
          <Sec title="Not assessed"><p className="text-xs">No IMD land cells in this subdivision's 0.25° grid, so there is no truth to define a bust. No substitute dataset is used.</p></Sec>
        ) : (
          <>
            <section className="panel-sec grid grid-cols-2 gap-2" data-testid="inv-summary">
              <div><div className="text-[11px] text-muted-foreground">P(BUST)</div><div className="kpi" data-testid="inv-pbust">{pct(cell.p_bust)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">CONFIDENCE</div><div className="pt-2"><ConfidenceBadge band={cell.confidence} /></div></div>
              <div><div className="text-[11px] text-muted-foreground">FORECAST RAIN</div><div className="kpi-sm">{mm(cell.f_rain)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">ENSEMBLE SPREAD</div><div className="kpi-sm">{cell.spread_anom == null ? "–" : `${cell.spread_anom.toFixed(2)}×`}</div></div>
            </section>
            <Trajectory traj={traj} day={day} onDay={onDay} />
            <CycleChange cell={cell} cur={ex.data} prev={exPrev.data} />
            <WhySection cell={cell} ex={ex.data} />
            {cell.valid_date && <Timeline rid={rid} valid={cell.valid_date} upto={init} />}
            <Ensemble day={rd ? { ens_q10: rd.ens_q10, ens_q90: rd.ens_q90, ens_mean: rd.ens_mean, f_rain: rd.f_rain, spread_anom: rd.spread_anom } : undefined} />
            <Analogs ex={ex.data} cycles={cycles} />
            <Sec title="Novelty · regime">
              <p className="text-xs text-muted-foreground">Novelty: {cell.novelty == null ? NA_TEXT : cell.novelty.toFixed(2)} · Regime: {cell.regime ?? NA_TEXT}</p>
            </Sec>
            <details className="panel-sec text-xs">
              <summary className="cursor-pointer">Table view of this panel's values</summary>
              <DataTable cols={[{ key: "k", label: "Item" }, { key: "v", label: "Value" }]} rows={[
                { k: "P(bust)", v: pct(cell.p_bust, 1) }, { k: "Previous cycle P(bust)", v: pct(cell.p_bust_prev, 1) },
                { k: "Confidence", v: cell.confidence }, { k: "Forecast rain", v: mm(cell.f_rain) },
                { k: "Spread anomaly", v: cell.spread_anom?.toFixed(2) ?? "–" }, ...traj.map((p, i) => ({ k: `P(bust) D${i + 1}`, v: pct(p, 1) })),
              ]} />
            </details>
          </>
        )}
      </div>
      <div className="panel-sec flex flex-wrap gap-1 border-t">
        <Button size="sm" asChild><Link to={linkTo(`/region/${rid}`, { day, tab: "overview" })} data-testid="open-region-analysis">Open region analysis</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to={linkTo(`/region/${rid}`, { day, tab: "verify" })} data-testid="inv-verify">Verify</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to={`/replay?event=${encodeURIComponent(init)}&act=3`} data-testid="inv-replay">Time Machine</Link></Button>
      </div>
    </aside>
  );
}
