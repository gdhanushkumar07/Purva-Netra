import { useTranslation } from "react-i18next";
import { useMatrix } from "@/api/client";
import { useInit, useRegionMap, prettyName, pct, pts, fmtDate, ZONE_ORDER, useMediaQuery } from "@/lib/hooks";
import { FieldView } from "@/components/matrix/FieldView";
import { useSettings, useView } from "@/store";
import { ReliabilityMatrix, type SortKey } from "@/components/matrix/ReliabilityMatrix";
import { DataTable, ErrorState, Loading, PbustLegend, ExportButton } from "@/components/common";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export default function Matrix() {
  const { t } = useTranslation();
  const { init } = useInit();
  const m = useMatrix(init);
  const regions = useRegionMap();
  const v = useView();
  const s = useSettings();
  const sort = (v.get("sort") ?? "zone") as SortKey;
  const view = v.get("view") ?? "grid";
  const zone = v.get("zone");
  const onlyLow = v.get("low") === "1";
  const phone = useMediaQuery("(max-width: 599px)");
  if (m.isLoading || !init) return <Loading />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  const cells = m.data!;
  return (
    <div className="space-y-3" id="matrix-export">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("matrix.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("matrix.subtitle")}</p>
        </div>
        <ExportButton targetId="matrix-export" filename={`purva-netra-matrix-${init}`} />
      </div>
      <div className="no-print flex flex-wrap items-center gap-3 text-sm" role="toolbar" aria-label={t("common.filter")}>
        <label className="flex items-center gap-1">{t("common.sort")}
          <select className="h-8 rounded-md border bg-card px-2" value={sort} onChange={(e) => v.set({ sort: e.target.value })}>
            <option value="zone">{t("matrix.sort_zone")}</option>
            <option value="worst">{t("matrix.sort_worst")}</option>
            <option value="change">{t("matrix.sort_change")}</option>
          </select>
        </label>
        <label className="flex items-center gap-1">{t("common.zone")}
          <select className="h-8 rounded-md border bg-card px-2" value={zone ?? ""} onChange={(e) => v.set({ zone: e.target.value })}>
            <option value="">{t("common.all")}</option>
            {ZONE_ORDER.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2"><Switch checked={onlyLow} onCheckedChange={(c) => v.set({ low: c ? 1 : undefined })} />{t("matrix.only_low")}</label>
        <label className="flex items-center gap-2"><Switch checked={s.showNumbers} onCheckedChange={(c) => s.set({ showNumbers: c })} />{t("common.show_numbers")}</label>
        <Button size="sm" variant="outline" aria-pressed={view === "table"} onClick={() => v.set({ view: view === "table" ? undefined : "table" })}>
          {view === "table" ? t("common.chart_view") : t("common.table_view")}
        </Button>
      </div>
      <PbustLegend />
      {phone && view !== "table" ? <FieldView cells={cells.filter((c) => !zone || regions.get(c.rid)?.zone === zone)} regions={regions} /> : view === "table" ? (
        <div className="max-h-[70vh] overflow-auto rounded-lg border">
          <DataTable
            cols={[
              { key: "rid", label: t("common.region"), fmt: (x) => prettyName(regions.get(x as number)?.name) },
              { key: "lead", label: t("common.day") },
              { key: "valid_date", label: t("common.valid"), fmt: (x) => fmtDate(x as string) },
              { key: "p_bust", label: "P(bust)", fmt: (x) => pct(x as number, 1) },
              { key: "confidence", label: t("common.confidence") },
              { key: "change_vs_prev", label: "Δ", fmt: (x) => pts(x as number) },
              { key: "hi_risk", label: "▲", fmt: (x) => (x ? "▲" : "") },
              { key: "top_reason_en", label: "Top reason", fmt: (x) => (x as string) ?? "" },
            ]}
            rows={cells.filter((c) => (!zone || regions.get(c.rid)?.zone === zone)) as unknown as Record<string, unknown>[]}
          />
        </div>
      ) : (
        <ReliabilityMatrix cells={cells} regions={regions} sort={sort} zone={zone} onlyLow={onlyLow} />
      )}
    </div>
  );
}
