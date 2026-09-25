import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Cell, Region } from "@/api/client";
import { pbustColor } from "@/theme/scales";
import { useResolvedTheme, prettyName, pct, linkTo } from "@/lib/hooks";
import { ConfidenceBadge } from "@/components/common";

/** Phone field view (< 600 px, spec §13.6): regions sorted by risk, each with a Day 1–10 colour strip. */
export function FieldView({ cells, regions }: { cells: Cell[]; regions: Map<number, Region> }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const by = new Map<number, Cell[]>();
  for (const c of cells) by.set(c.rid, [...(by.get(c.rid) ?? []), c]);
  const rows = [...by.entries()]
    .map(([rid, cs]) => ({ rid, cs: cs.sort((a, b) => a.lead - b.lead), worst: Math.max(...cs.map((c) => c.p_bust ?? -1)) }))
    .sort((a, b) => b.worst - a.worst);
  return (
    <ul className="space-y-2" data-tour="matrix" aria-label={t("matrix.title")}>
      {rows.map(({ rid, cs, worst }) => {
        const w = cs.find((c) => c.p_bust === worst);
        return (
          <li key={rid}>
            <Link to={linkTo(`/region/${rid}`, { day: w?.lead ?? 1, tab: "overview" })} className="block rounded-lg border bg-card p-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{prettyName(regions.get(rid)?.name)}</span>
                {w?.p_bust != null ? <span className="flex items-center gap-1 text-xs">{t("common.day")} {w.lead} · {pct(w.p_bust)} <ConfidenceBadge band={w.confidence} /></span>
                  : <ConfidenceBadge band="Not assessed" />}
              </div>
              <div className="mt-1 flex gap-[2px]" aria-label={cs.map((c) => `Day ${c.lead} ${pct(c.p_bust)}`).join(", ")}>
                {cs.map((c) => (
                  <span key={c.lead} className="tnum flex h-5 flex-1 items-center justify-center rounded-[3px] border border-black/10 text-[9px] dark:border-white/10"
                    style={{ background: pbustColor(c.p_bust, theme) }}>{c.lead}</span>
                ))}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
