import { useTranslation } from "react-i18next";
import type { Cell, RegionDay } from "@/api/client";
import { pbustColor, pbustInk } from "@/theme/scales";
import { useResolvedTheme, pct, pts, prettyName, fmtDate } from "@/lib/hooks";
import { ConfidenceBadge } from "@/components/common";
import { cn } from "@/lib/utils";

/** Always-visible header strip for the selected day + a clickable Day 1–10 trust strip. */
export function RegionHeader({ name, zone, days, day, cells, onDay, actions }: {
  name: string; zone: string; days: RegionDay[]; day: number; cells: Cell[]; onDay: (d: number) => void; actions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const sel = days.find((d) => d.lead === day);
  const cell = cells.find((c) => c.lead === day);
  const ch = cell?.change_vs_prev ?? null;
  return (
    <section className="panel sticky top-[var(--hdr,48px)] z-20" aria-label="Selected day summary" data-testid="region-header">
      <div className="panel-sec flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-44">
          <h1 className="text-lg font-semibold leading-tight">{prettyName(name)}</h1>
          <div className="text-xs text-muted-foreground">{zone} · {t("common.day")} {day} · {t("common.valid")} {fmtDate(sel?.valid_date)}</div>
        </div>
        {sel?.p_bust == null ? <ConfidenceBadge band="Not assessed" /> : (
          <>
            <div className="flex items-center gap-2" data-testid="hdr-trust"><ConfidenceBadge band={sel.confidence} className="text-sm" /></div>
            <div data-testid="hdr-pbust"><div className="kpi">{pct(sel.p_bust)}</div><div className="text-xs text-muted-foreground">P(bust) {t("region.vs_base")}</div></div>
            <div data-testid="hdr-change"><div className="kpi-sm">{ch == null ? "–" : `${ch > 0 ? "↑" : ch < 0 ? "↓" : "→"} ${pts(ch)}`}</div><div className="text-xs text-muted-foreground">{t("region.change_prev")}</div></div>
            <div data-testid="hdr-spread"><div className="kpi-sm">{sel.spread_anom == null ? "–" : `${sel.spread_anom.toFixed(2)}×`}</div><div className="text-xs text-muted-foreground">{t("common.spread_anom")}</div></div>
            <div data-testid="hdr-novelty"><div className="kpi-sm">{sel.novelty == null ? "n/a" : sel.novelty.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">{t("common.novelty")}{sel.novelty == null && ` · ${t("common.not_available_model")}`}</div></div>
          </>
        )}
        {actions && <div className="no-print ml-auto flex flex-wrap gap-1">{actions}</div>}
      </div>
      <div className="panel-sec" role="radiogroup" aria-label="Day 1–10 trust strip" data-testid="trust-strip">
        <div className="flex gap-0.5">
          {days.map((d) => (
            <button key={d.lead} type="button" role="radio" aria-checked={d.lead === day} onClick={() => onDay(d.lead)}
              data-testid={`strip-${d.lead}`}
              aria-label={`Day ${d.lead}: ${d.p_bust == null ? "not assessed" : `${pct(d.p_bust)}, ${d.confidence}`}`}
              className={cn("tnum flex h-9 flex-1 flex-col items-center justify-center rounded-sm border text-[11px] leading-tight",
                d.lead === day ? "border-foreground ring-2 ring-foreground/60" : "border-black/10 dark:border-white/10")}
              style={{ background: pbustColor(d.p_bust, theme), color: pbustInk(d.p_bust, theme) }}>
              <span>D{d.lead}</span><span className="font-semibold">{d.p_bust == null ? "–" : Math.round(d.p_bust * 100)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
