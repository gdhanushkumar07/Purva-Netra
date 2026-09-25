import { useTranslation } from "react-i18next";
import { useMatrix } from "@/api/client";
import { useInit, useRegionMap, useResolvedTheme, prettyName, fmtInit, pts, ZONE_ORDER } from "@/lib/hooks";
import { ReliabilityMatrix } from "@/components/matrix/ReliabilityMatrix";
import { EmptyState, ErrorState, Loading, PbustLegend } from "@/components/common";
import { DIFF_LABELS, diffColor, diffInk, diffPalette } from "@/theme/scales";

export default function Compare() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const { init, prev } = useInit();
  const a = useMatrix(init);
  const b = useMatrix(prev);
  const regions = useRegionMap();
  if (a.isLoading || !init) return <Loading />;
  if (a.error) return <ErrorState error={a.error} />;
  if (!prev) return <EmptyState title={t("compare.title")}>{t("brief.no_prev")}</EmptyState>;
  if (b.isLoading) return <Loading />;
  // Difference for the same valid date: this cycle's Day d vs previous cycle (12 h earlier) — use change_vs_prev.
  const rows = [...regions.values()].sort((x, y) => ZONE_ORDER.indexOf(x.zone) - ZONE_ORDER.indexOf(y.zone) || x.name.localeCompare(y.name));
  const diff = new Map(a.data!.map((c) => [`${c.rid}-${c.lead}`, c.change_vs_prev]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("compare.title")}</h1>
      <div className="grid gap-4 2xl:grid-cols-2">
        <section><h2 className="mb-1 text-sm font-semibold">{t("compare.now")} · {fmtInit(init)}</h2><ReliabilityMatrix cells={a.data!} regions={regions} compact /></section>
        <section><h2 className="mb-1 text-sm font-semibold">{t("compare.prev")} · {fmtInit(prev)}</h2>{b.data && <ReliabilityMatrix cells={b.data} regions={regions} compact />}</section>
      </div>
      <PbustLegend compact />
      <section aria-label={t("compare.diff")}>
        <h2 className="mb-1 text-sm font-semibold">{t("compare.diff")} — same valid date</h2>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[2px] text-xs">
            <thead><tr><th scope="col" className="text-left">{t("common.region")}</th>{[...Array(10)].map((_, i) => <th scope="col" key={i}>D{i + 1}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rid}>
                  <th scope="row" className="pr-2 text-left font-normal">{prettyName(r.name)}</th>
                  {[...Array(10)].map((_, i) => {
                    const d = diff.get(`${r.rid}-${i + 1}`) ?? null;
                    return (
                      <td key={i} title={`${prettyName(r.name)} D${i + 1}: ${pts(d)}`} aria-label={`${prettyName(r.name)} day ${i + 1}: ${pts(d)}`}
                        className="tnum h-6 min-w-10 rounded-[3px] border border-black/10 text-center dark:border-white/10" style={{ background: diffColor(d, theme), color: diffInk(d, theme) }}>
                        {d != null && Math.abs(d) >= 0.05 ? Math.round(d * 100) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-[2px] text-xs">
          {diffPalette(theme).map((c, i) => (
            <div key={i} className="flex min-w-16 flex-col items-center"><span className="h-3 w-full rounded-sm border border-black/10" style={{ background: c }} /><span className="text-muted-foreground">{DIFF_LABELS[i]}</span></div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Model-vs-model (IFS vs NEPS-G) is Phase 2 and not built.</p>
      </section>
    </div>
  );
}
