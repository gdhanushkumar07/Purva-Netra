import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toPng } from "html-to-image";
import { AlertTriangle, Download, Printer, Table2, BarChart3, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BAND, PBUST_LABELS, pbustPalette, type Band } from "@/theme/scales";
import { useResolvedTheme } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Confidence band: colour + icon + text, always together (never colour alone). */
export function ConfidenceBadge({ band, className }: { band: Band; className?: string }) {
  const { t } = useTranslation();
  const b = BAND[band] ?? BAND["Not assessed"];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", className)}
      style={{ borderColor: b.color }}
      data-band={band}
    >
      <span aria-hidden style={{ color: b.color }}>{b.icon}</span>
      {t(`band.${band}`)}
    </span>
  );
}

/** Legend for the P(bust) diverging scale, with the base-rate midpoint named. */
export function PbustLegend({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const pal = pbustPalette(theme);
  return (
    <figure className="text-xs" aria-label="P(bust) colour legend">
      <div className="flex items-stretch gap-[2px]" role="list">
        {pal.map((c, i) => (
          <div key={i} role="listitem" className="flex flex-col items-center" style={{ minWidth: compact ? 34 : 52 }}>
            <span className="h-3 w-full rounded-sm border border-black/10 dark:border-white/10" style={{ background: c }} />
            <span className="tnum mt-0.5 text-muted-foreground">{PBUST_LABELS[i]}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <figcaption className="mt-1 flex justify-between text-muted-foreground">
          <span>← {t("matrix.more_trust")}</span>
          <span>{t("common.base_rate")}</span>
          <span>{t("matrix.less_trust")} →</span>
        </figcaption>
      )}
    </figure>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm text-muted-foreground" role="status">{t("common.loading")}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="m-4 flex items-start gap-3 rounded-lg border border-destructive/50 p-4 text-sm">
      <AlertTriangle className="size-4 text-destructive" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{t("common.error")}</p>
        <p className="text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-prose text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Chart ↔ table toggle: every chart ships a table view (spec §13.8, §13.12). */
export function ChartTable({ chart, table, title, id }: { chart: ReactNode; table: ReactNode; title: string; id?: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"chart" | "table">("chart");
  return (
    <section className="rounded-lg border bg-card p-3" aria-label={title} id={id}>
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={tab === "table"}
          onClick={() => setTab(tab === "chart" ? "table" : "chart")}
        >
          {tab === "chart" ? <Table2 className="size-4" aria-hidden /> : <BarChart3 className="size-4" aria-hidden />}
          {tab === "chart" ? t("common.table_view") : t("common.chart_view")}
        </Button>
      </header>
      {tab === "chart" ? chart : <div className="max-h-80 overflow-auto">{table}</div>}
    </section>
  );
}

export function DataTable({ cols, rows }: { cols: { key: string; label: string; fmt?: (v: unknown, r: Record<string, unknown>) => ReactNode }[]; rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card">
        <tr>{cols.map((c) => <th key={c.key} scope="col" className="border-b px-2 py-1 text-left font-medium">{c.label}</th>)}</tr>
      </thead>
      <tbody className="tnum">
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50">
            {cols.map((c) => <td key={c.key} className="px-2 py-1">{c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? "–")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Export: PNG of a DOM node (html-to-image) or the browser's print → PDF with print CSS. */
export function ExportButton({ targetId, filename, text }: { targetId: string; filename: string; text?: string }) {
  const { t } = useTranslation();
  const png = async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const url = await toPng(el, { pixelRatio: 2, backgroundColor: getComputedStyle(document.body).backgroundColor });
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.png`; a.click();
  };
  return (
    <div className="no-print flex gap-1" data-tour="export">
      <Button size="sm" variant="outline" onClick={png}><Download className="size-4" aria-hidden />PNG</Button>
      <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" aria-hidden />PDF</Button>
      {text && (
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(text)}>
          {t("common.export")} text
        </Button>
      )}
    </div>
  );
}

export function StatTile({ value, label, onClick, hint }: { value: ReactNode; label: string; onClick?: () => void; hint?: string }) {
  const C = onClick ? "button" : "div";
  return (
    <C
      onClick={onClick}
      title={hint}
      className={cn("flex min-w-32 flex-col items-start rounded-lg border bg-card p-3 text-left", onClick && "hover:bg-accent")}
    >
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </C>
  );
}
