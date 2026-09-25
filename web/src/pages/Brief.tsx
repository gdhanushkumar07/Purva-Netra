import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBrief, useMatrix } from "@/api/client";
import { useInit, pct, pts, prettyName, fmtInit, linkTo, useLang, useRegionMap, useResolvedTheme } from "@/lib/hooks";
import { ConfidenceBadge, ErrorState, Loading, ExportButton, PbustLegend } from "@/components/common";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RiskMap } from "@/components/map/RiskMap";
import { cn } from "@/lib/utils";

/** One headline number per tile; the tile is a filter (link) into the Matrix / Map. */
function Tile({ value, label, to, hint, testid }: { value: React.ReactNode; label: string; to?: string; hint?: string; testid?: string }) {
  const body = (
    <>
      <span className="kpi">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );
  const cls = "flex min-w-36 flex-1 flex-col gap-1 px-4 py-2 text-left hair-r last:border-r-0";
  const el = to
    ? <Link to={to} data-testid={testid} className={cn(cls, "hover:bg-accent focus-visible:bg-accent")}>{body}</Link>
    : <div data-testid={testid} className={cls} tabIndex={hint ? 0 : undefined}>{body}</div>;
  return hint ? <Tooltip><TooltipTrigger asChild>{el}</TooltipTrigger><TooltipContent className="max-w-80">{hint}</TooltipContent></Tooltip> : el;
}

export default function Brief() {
  const { t } = useTranslation();
  const lang = useLang();
  const nav = useNavigate();
  const theme = useResolvedTheme();
  const { init } = useInit();
  const b = useBrief(init);
  const m = useMatrix(init);
  const regions = useRegionMap();
  if (b.isLoading || !init) return <Loading />;
  if (b.error) return <ErrorState error={b.error} onRetry={() => b.refetch()} />;
  const d = b.data!;
  const day = d.counts.most_uncertain_day ?? 1;
  // Issue (b): name the unassessed regions and say why.
  const unassessed = [...regions.values()].filter((r) => (m.data ?? []).some((c) => c.rid === r.rid) && !(m.data ?? []).some((c) => c.rid === r.rid && c.p_bust != null));
  const missing = unassessed.map((r) => prettyName(r.name)).join(" and ");
  const text = [
    `PURVA-NETRA briefing — cycle ${fmtInit(d.init)}`,
    t("brief.summary", { low: d.counts.low_regions, day: d.counts.most_uncertain_day }),
    ...d.top_risks.slice(0, 5).map((r, i) => `${i + 1}. ${prettyName(r.name)} · Day ${r.lead} · ${pct(r.p_bust)} · ${r.confidence} — ${(lang === "hi" ? r.top_reason_hi : r.top_reason_en) ?? ""}`),
  ].join("\n");

  return (
    <div id="brief-export" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("brief.title")} · {fmtInit(d.init)}</h1>
          <p className="text-sm text-muted-foreground" data-testid="brief-summary">{t("brief.summary", { low: d.counts.low_regions, day: d.counts.most_uncertain_day })}</p>
        </div>
        <ExportButton targetId="brief-export" filename={`purva-netra-brief-${init}`} text={text} />
      </div>

      <section className="panel flex flex-wrap" data-tour="brief-tiles" aria-label="Summary">
        <Tile testid="tile-low" value={d.counts.low_regions} label={`${t("brief.low_regions")} ◆`} to={linkTo("/matrix", { low: 1 })} />
        <Tile testid="tile-heavy" value={d.counts.heavy_risk_regions} label={`${t("brief.heavy")} ▲`} to={linkTo("/matrix", { heavy: 1 })} />
        <Tile testid="tile-day" value={`${t("common.day")} ${day}`} label={t("brief.most_uncertain")} to={linkTo("/map", { day, layer: "pbust" })} />
        <Tile testid="tile-assessed" value={`${d.counts.assessed_regions}/${d.counts.total_regions}`} label={t("brief.assessed")}
          hint={unassessed.length ? `Not assessed: ${missing}. IMD's 0.25° gridded rainfall has no land cells there, so there is no truth to define a bust. No substitute dataset is used.` : undefined} />
        <Tile testid="tile-regime" value={<span className="block pt-2 text-sm font-medium text-muted-foreground">– {t("common.not_available_model")}</span>} label="Regime"
          hint="Regime detection (§6.4) is not in the shipped model. Nothing is inferred or shown until it exists." />
      </section>
      {unassessed.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="unassessed-note">
          – {missing}: not assessed (no IMD land cells in the 0.25° grid → no truth).
        </p>
      )}

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel" aria-labelledby="top-h">
          <div className="panel-sec flex items-center justify-between gap-2"><h2 id="top-h" className="panel-title">{t("brief.top_risks")}</h2>
            <span className="hidden xl:block"><PbustLegend compact /></span><Link to={linkTo("/matrix")} className="text-xs underline-offset-2 hover:underline">{t("brief.open_matrix")} →</Link></div>
          <ol className="panel-sec divide-y divide-border/60 py-0!">
            {d.top_risks.map((r, i) => {
              const reason = lang === "hi" ? r.top_reason_hi : r.top_reason_en;
              return (
                <li key={`${r.rid}-${r.lead}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm xl:flex-nowrap" data-testid="top-risk">
                  <span className="tnum w-4 text-muted-foreground">{i + 1}</span>
                  <Link className="w-40 shrink-0 truncate font-medium hover:underline sm:w-44" to={linkTo(`/region/${r.rid}`, { day: r.lead, tab: "why" })}>{prettyName(r.name)}</Link>
                  <span className="tnum w-12 shrink-0 text-muted-foreground">D{r.lead}</span>
                  <span className="tnum w-10 shrink-0 text-right font-semibold">{pct(r.p_bust)}</span>
                  <ConfidenceBadge band={r.confidence} className="shrink-0" />
                  {r.hi_risk ? <span className="shrink-0" title={t("common.heavy_risk")} aria-label={t("common.heavy_risk")}>▲</span> : <span className="w-3 shrink-0" />}
                  {reason && (
                    <Tooltip>
                      <TooltipTrigger asChild><span tabIndex={0} className="min-w-0 flex-1 basis-full truncate pl-6 text-xs text-muted-foreground xl:basis-0 xl:pl-0">{reason}</span></TooltipTrigger>
                      <TooltipContent className="max-w-96">{reason}</TooltipContent>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-2">
          <section className="panel" aria-label="Worst-trust regions map">
            <div className="panel-sec flex items-center justify-between">
              <h2 className="panel-title">P(Bust) · Day {day} <span className="font-normal normal-case">· boundaries: IMD</span></h2>
              <Link to={linkTo("/map", { day, layer: "pbust" })} className="text-xs underline-offset-2 hover:underline" data-testid="thumb-open">{t("brief.open_map")} →</Link>
            </div>
            {/* mouse shortcut; the "Open map" link above is the keyboard path */}
            <div className="block h-52 w-full cursor-pointer" onClick={() => nav(linkTo("/map", { day, layer: "pbust" }))} data-testid="map-thumb">
              {m.data && <RiskMap cells={m.data} day={day} layer="pbust" theme={theme} interactive={false} label={`Thumbnail: P(bust) Day ${day}`} />}
            </div>
          </section>
          <section className="panel" aria-labelledby="chg-h">
            <div className="panel-sec"><h2 id="chg-h" className="panel-title">{t("brief.changes")}</h2></div>
            {d.biggest_changes.length === 0 ? <p className="panel-sec text-sm text-muted-foreground">{t("brief.no_prev")}</p> : (
              <ul className="panel-sec divide-y divide-border/60 py-0!">
                {d.biggest_changes.slice(0, 8).map((c) => (
                  <li key={`${c.rid}-${c.lead}`} className="flex items-center gap-2 py-1 text-sm">
                    <span aria-hidden className="w-3">{c.change_vs_prev > 0 ? "↑" : "↓"}</span>
                    <Link className="min-w-0 flex-1 truncate hover:underline" to={linkTo(`/region/${c.rid}`, { day: c.lead, tab: "evolution" })}>{prettyName(c.name)} D{c.lead}</Link>
                    <span className="tnum font-medium">{pts(c.change_vs_prev)}</span>
                    <span className="tnum w-10 text-right text-muted-foreground">{pct(c.p_bust)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
