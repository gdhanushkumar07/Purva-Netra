import { useTranslation } from "react-i18next";
import type { Explain } from "@/api/client";
import { dnaBars } from "@/theme/scales";
import { useLang } from "@/lib/hooks";
import { ChartTable, DataTable } from "@/components/common";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Forecast DNA / bust anatomy: one signed bar per evidence group from summed SHAP values.
 *  Right = raises bust risk, left = lowers it, zero line in the middle. Groups the shipped model
 *  does not have are greyed with "Not available in this model version". Hover shows the group's
 *  fixed template sentence (only groups that passed their reason threshold have one). */
export function ForecastDNA({ ex }: { ex: Explain }) {
  const { t } = useTranslation();
  const lang = useLang();
  const gc = ex.group_contributions;
  if (!gc) return null;
  const bars = dnaBars(gc.groups);
  const sentences = lang === "hi" ? ex.reasons_hi : ex.reasons_en;
  const sentenceOf = (g: string) => { const i = ex.groups.indexOf(g); return i >= 0 ? sentences[i] : null; };
  const other = Object.entries(gc.other_terms ?? {});
  const chart = (
    <div data-testid="dna">
      <p className="mb-2 text-xs text-muted-foreground">{t("region.dna_help")}</p>
      <div className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-x-2 gap-y-1 text-xs">
        <span />
        <div className="flex justify-between text-[10px] text-muted-foreground"><span>← {t("region.lowers")}</span><span>{t("region.raises")} →</span></div>
        <span />
        {bars.map((b) => {
          const s = sentenceOf(b.group);
          const tip = b.available ? (s ?? t("region.dna_no_sentence")) : b.reason ?? t("common.not_available_model");
          return [
            <span key={`${b.group}-l`} className={b.available ? "" : "text-muted-foreground"}>{b.label}</span>,
            <Tooltip key={`${b.group}-b`}>
              <TooltipTrigger asChild>
                <div tabIndex={0} role="img" data-testid={`dna-${b.group}`} data-side={b.side} data-available={b.available}
                  aria-label={`${b.label}: ${b.available ? `${b.value!.toFixed(2)} (${b.side === "raises" ? t("region.raises") : b.side === "lowers" ? t("region.lowers") : "0"})` : t("common.not_available_model")}`}
                  className="relative h-5 rounded-sm bg-muted/60">
                  <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-foreground/60" />
                  {b.available ? (
                    <span aria-hidden className="absolute inset-y-1 rounded-sm"
                      style={{ width: `${b.widthPct / 2}%`, left: b.side === "raises" ? "50%" : `${50 - b.widthPct / 2}%`,
                        background: b.side === "raises" ? "var(--dna-up, #d4493d)" : "var(--dna-down, #256abf)" }} />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground"
                      style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, rgba(128,128,128,.18) 4px 5px)" }}>
                      {t("common.not_available_model")}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-80">{tip}</TooltipContent>
            </Tooltip>,
            <span key={`${b.group}-v`} className="tnum text-right text-muted-foreground">
              {b.available ? `${b.value! > 0 ? "+" : ""}${b.value!.toFixed(2)} ${b.side === "raises" ? "▲" : b.side === "lowers" ? "▼" : ""}` : "–"}
            </span>,
          ];
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("region.dna_units")}.
        {other.length > 0 && <> {t("region.dna_other")}: {other.map(([k, v]) => `${k.replace("term:", "")} ${v > 0 ? "+" : ""}${v.toFixed(2)}`).join(", ")}.</>}
      </p>
    </div>
  );
  return (
    <ChartTable title={t("region.dna_title")} id="dna-panel" chart={chart}
      table={<DataTable cols={[{ key: "label", label: "Group" }, { key: "value", label: "SHAP (log-odds)", fmt: (v, r) => (r.available ? (v as number).toFixed(3) : "Not available in this model version") },
        { key: "side", label: "Effect" }]} rows={bars as unknown as Record<string, unknown>[]} />} />
  );
}
