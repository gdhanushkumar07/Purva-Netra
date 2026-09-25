import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Cell, Outcome, Region } from "@/api/client";
import { pbustColor, pbustInk, type Theme } from "@/theme/scales";
import { useResolvedTheme, prettyName, pct, fmtDate, ZONE_ORDER, useLang, linkTo } from "@/lib/hooks";
import { useSettings } from "@/store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SortKey = "zone" | "worst" | "change";
const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const OUTCOME_GLYPH: Record<Outcome, string> = { hit: "✓", miss: "✗", false_alarm: "!", correct_negative: "·" };

function Sparkline({ vals, theme }: { vals: (number | null)[]; theme: Theme }) {
  const w = 60, h = 16, max = 0.5;
  const pts = vals.map((v, i) => (v == null ? null : [i * (w / 9), h - Math.min(v, max) / max * h] as const));
  const d = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join("");
  const base = h - (0.1 / max) * h;
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <line x1={0} x2={w} y1={base} y2={base} stroke={theme === "dark" ? "#383835" : "#c3c2b7"} strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={theme === "dark" ? "#c3c2b7" : "#52514e"} strokeWidth={1.5} />
    </svg>
  );
}

export function ReliabilityMatrix({
  cells, regions, sort = "zone", onlyLow = false, zone, reveal, onCell, compact = false,
}: {
  cells: Cell[]; regions: Map<number, Region>; sort?: SortKey; onlyLow?: boolean; zone?: string;
  /** replay: show outcome glyphs for days ≤ reveal */ reveal?: number;
  onCell?: (rid: number, day: number) => void; compact?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const lang = useLang();
  const showNumbers = useSettings((s) => s.showNumbers);
  const texture = useSettings((s) => s.texture);
  const nav = useNavigate();
  const grid = useRef<HTMLTableElement>(null);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);

  const byRid = useMemo(() => {
    const m = new Map<number, Map<number, Cell>>();
    for (const c of cells) {
      if (!m.has(c.rid)) m.set(c.rid, new Map());
      m.get(c.rid)!.set(c.lead, c);
    }
    return m;
  }, [cells]);

  const rows = useMemo(() => {
    let rs = [...regions.values()].filter((r) => byRid.has(r.rid));
    if (zone) rs = rs.filter((r) => r.zone === zone);
    if (onlyLow) rs = rs.filter((r) => [...byRid.get(r.rid)!.values()].some((c) => c.confidence === "Low"));
    const worst = (rid: number) => Math.max(...[...byRid.get(rid)!.values()].map((c) => c.p_bust ?? -1));
    const change = (rid: number) => Math.max(...[...byRid.get(rid)!.values()].map((c) => Math.abs(c.change_vs_prev ?? 0)));
    if (sort === "zone") rs.sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone) || a.name.localeCompare(b.name));
    if (sort === "worst") rs.sort((a, b) => worst(b.rid) - worst(a.rid));
    if (sort === "change") rs.sort((a, b) => change(b.rid) - change(a.rid));
    return rs;
  }, [regions, byRid, sort, onlyLow, zone]);

  const open = (rid: number, d: number) => (onCell ? onCell(rid, d) : nav(linkTo(`/region/${rid}`, { day: d, tab: "overview" })));

  const onKey = (e: KeyboardEvent) => {
    const [r, c] = focus;
    const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (mv[e.key]) {
      e.preventDefault();
      const nr = Math.max(0, Math.min(rows.length - 1, r + mv[e.key][0]));
      const nc = Math.max(0, Math.min(9, c + mv[e.key][1]));
      setFocus([nr, nc]);
      grid.current?.querySelector<HTMLElement>(`[data-cell="${nr}-${nc}"]`)?.focus();
    } else if (e.key === "Enter" && rows[r]) {
      open(rows[r].rid, c + 1);
    }
  };

  let lastZone = "";
  return (
    <div className="overflow-x-auto" data-tour="matrix">
      <table ref={grid} role="grid" aria-label={t("matrix.title")} className="border-separate border-spacing-[2px] text-xs" onKeyDown={onKey}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-background px-2 text-left font-medium">{t("common.region")}</th>
            {DAYS.map((d) => <th key={d} scope="col" className="tnum min-w-10 font-medium">{t("common.day")} {d}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const zoneHeader = sort === "zone" && r.zone !== lastZone;
            lastZone = r.zone;
            const rc = byRid.get(r.rid)!;
            return [
              zoneHeader && (
                <tr key={`z-${r.zone}`}><th colSpan={11} scope="colgroup" className="pt-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r.zone}</th></tr>
              ),
              <tr key={r.rid}>
                <th scope="row" className="sticky left-0 z-10 bg-background pr-2 text-left font-normal">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate", compact ? "max-w-28" : "max-w-44")} title={r.name}>{prettyName(r.name)}</span>
                    {!compact && <Sparkline vals={DAYS.map((d) => rc.get(d)?.p_bust ?? null)} theme={theme} />}
                  </span>
                </th>
                {DAYS.map((d, ci) => {
                  const c = rc.get(d);
                  const p = c?.p_bust ?? null;
                  const na = p == null;
                  const out = reveal != null && d <= reveal ? c?.outcome : undefined;
                  const reason = lang === "hi" ? c?.top_reason_hi : c?.top_reason_en;
                  const label = na
                    ? `${prettyName(r.name)}, ${t("common.day")} ${d}: ${t("band.Not assessed")}`
                    : `${prettyName(r.name)}, ${t("common.day")} ${d}: P(bust) ${pct(p)}, ${t(`band.${c!.confidence}`)}${c?.hi_risk ? `, ${t("common.heavy_risk")}` : ""}${out ? `, ${t(`outcome.${out}`)}` : ""}`;
                  const hatched = texture && !na && p! >= 0.12;
                  return (
                    <td key={d} className="p-0">
                      <Tooltip delayDuration={150}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            data-cell={`${ri}-${ci}`}
                            data-testid={`cell-${r.rid}-${d}`}
                            tabIndex={ri === focus[0] && ci === focus[1] ? 0 : -1}
                            aria-label={label}
                            onFocus={() => setFocus([ri, ci])}
                            onClick={() => !na && open(r.rid, d)}
                            className={cn("relative flex h-7 w-full min-w-10 items-center justify-center rounded-[3px] border border-black/10 dark:border-white/10", na && "cursor-not-allowed")}
                            style={{
                              background: na ? undefined : pbustColor(p, theme),
                              color: pbustInk(p, theme),
                              backgroundImage: na
                                ? `repeating-linear-gradient(45deg, transparent 0 4px, ${theme === "dark" ? "#2c2c2a" : "#e1e0d9"} 4px 5px)`
                                : hatched ? `repeating-linear-gradient(${p! >= 0.25 ? 135 : 45}deg, transparent 0 3px, rgba(0,0,0,.35) 3px 4px)` : undefined,
                            }}
                          >
                            {showNumbers && !na && <span className="tnum text-[10px]">{Math.round(p! * 100)}</span>}
                            {c?.hi_risk && <span aria-hidden className="absolute right-0.5 top-0 text-[9px] leading-none">▲</span>}
                            {c?.novelty != null && c.novelty > 2 && <span aria-hidden className="absolute bottom-0 left-0.5 text-[9px] leading-none">◌</span>}
                            {out && <span aria-hidden className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ textShadow: "0 0 3px var(--card)" }}>{OUTCOME_GLYPH[out]}</span>}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold">{prettyName(r.name)} · {t("common.day")} {d}</div>
                            {c && <div>{t("common.valid")} {fmtDate(c.valid_date)}</div>}
                            {na ? <div>{t("common.not_assessed_help")}</div> : (
                              <>
                                <div>P(bust) {pct(p)} · {t(`band.${c!.confidence}`)}</div>
                                {reason && <div className="opacity-80">{reason}</div>}
                                {c?.hi_risk && <div>▲ {t("common.heavy_risk")}</div>}
                                {out && <div className="font-semibold">{t(`outcome.${out}`)}</div>}
                              </>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>,
            ];
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">▲ {t("common.heavy_risk")} · ◌ {t("common.novel")} · {t("matrix.keyboard")}</p>
    </div>
  );
}
