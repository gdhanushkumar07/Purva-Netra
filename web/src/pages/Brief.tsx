import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBrief } from "@/api/client";
import { useInit, pct, pts, prettyName, fmtInit, linkTo, useLang } from "@/lib/hooks";
import { ConfidenceBadge, ErrorState, Loading, StatTile, ExportButton, PbustLegend } from "@/components/common";
import { Button } from "@/components/ui/button";

export default function Brief() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const { init } = useInit();
  const b = useBrief(init);
  if (b.isLoading || !init) return <Loading />;
  if (b.error) return <ErrorState error={b.error} onRetry={() => b.refetch()} />;
  const d = b.data!;
  const text = [
    `PURVA-NETRA briefing — cycle ${fmtInit(d.init)} (REPLAY)`,
    t("brief.summary", { low: d.counts.low_regions, day: d.counts.most_uncertain_day }),
    ...d.top_risks.slice(0, 5).map((r, i) => `${i + 1}. ${prettyName(r.name)} · Day ${r.lead} · ${pct(r.p_bust)} · ${r.confidence}`),
  ].join("\n");
  return (
    <div id="brief-export" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("brief.title")}</h1>
        <ExportButton targetId="brief-export" filename={`purva-netra-brief-${init}`} text={text} />
      </div>
      <p className="text-sm" data-testid="brief-summary">{t("brief.summary", { low: d.counts.low_regions, day: d.counts.most_uncertain_day })}</p>
      <div className="flex flex-wrap gap-2" data-tour="brief-tiles">
        <StatTile value={d.counts.low_regions} label={t("brief.low_regions")} onClick={() => nav(linkTo("/matrix", { low: 1 }))} />
        <StatTile value={d.counts.heavy_risk_regions} label={t("brief.heavy")} onClick={() => nav(linkTo("/matrix", { sort: "worst" }))} />
        <StatTile value={`${t("common.day")} ${d.counts.most_uncertain_day ?? "–"}`} label={t("brief.most_uncertain")} onClick={() => nav(linkTo("/map", { day: d.counts.most_uncertain_day ?? 1 }))} />
        <StatTile value={`${d.counts.assessed_regions}/${d.counts.total_regions}`} label={t("brief.assessed")} hint={t("common.not_assessed_help")} />
        <div className="flex min-w-60 flex-1 items-center rounded-lg border bg-card p-3 text-sm text-muted-foreground">{d.regime ?? t("brief.regime_na")}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-3" aria-labelledby="top-h">
          <h2 id="top-h" className="mb-2 text-sm font-semibold">{t("brief.top_risks")}</h2>
          <ol className="space-y-1.5">
            {d.top_risks.map((r, i) => (
              <li key={`${r.rid}-${r.lead}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tnum w-5 text-muted-foreground">{i + 1}</span>
                <Link className="font-medium underline-offset-2 hover:underline" to={linkTo(`/region/${r.rid}`, { day: r.lead, tab: "why" })}>
                  {prettyName(r.name)}
                </Link>
                <span className="tnum">· {t("common.day")} {r.lead} · {pct(r.p_bust)}</span>
                <ConfidenceBadge band={r.confidence} />
                {r.hi_risk && <span title={t("common.heavy_risk")} aria-label={t("common.heavy_risk")}>▲</span>}
                {(lang === "hi" ? r.top_reason_hi : r.top_reason_en) && (
                  <span className="basis-full pl-7 text-xs text-muted-foreground">{lang === "hi" ? r.top_reason_hi : r.top_reason_en}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-lg border bg-card p-3" aria-labelledby="chg-h">
          <h2 id="chg-h" className="mb-2 text-sm font-semibold">{t("brief.changes")}</h2>
          {d.biggest_changes.length === 0 ? <p className="text-sm text-muted-foreground">{t("brief.no_prev")}</p> : (
            <ul className="space-y-1.5">
              {d.biggest_changes.map((c) => (
                <li key={`${c.rid}-${c.lead}`} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="w-4">{c.change_vs_prev > 0 ? "↑" : "↓"}</span>
                  <Link className="hover:underline" to={linkTo(`/region/${c.rid}`, { day: c.lead, tab: "evolution" })}>{prettyName(c.name)} {t("common.day")} {c.lead}</Link>
                  <span className="tnum font-medium">{pts(c.change_vs_prev)}</span>
                  <span className="tnum text-muted-foreground">→ {pct(c.p_bust)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild><Link to={linkTo("/matrix")}>{t("brief.open_matrix")}</Link></Button>
        <Button asChild variant="outline"><Link to={linkTo("/map")}>{t("brief.open_map")}</Link></Button>
        <div className="ml-auto"><PbustLegend compact /></div>
      </div>
    </div>
  );
}
