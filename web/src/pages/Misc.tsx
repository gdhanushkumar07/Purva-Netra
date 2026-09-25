import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHealth, useMatrix } from "@/api/client";
import { useInit, useRegionMap, prettyName, pct, linkTo } from "@/lib/hooks";
import { useSettings } from "@/store";
import { ConfidenceBadge, EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function Watchlist() {
  const { t } = useTranslation();
  const s = useSettings();
  const { init } = useInit();
  const m = useMatrix(init);
  const regions = useRegionMap();
  const upd = (i: number, p: Partial<(typeof s.watch)[number]>) => s.set({ watch: s.watch.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t("watch.title")}</h1>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="add-region">{t("watch.add")}</label>
        <select id="add-region" className="h-8 rounded-md border bg-card px-2" value="" onChange={(e) => e.target.value && s.set({ watch: [...s.watch, { rid: Number(e.target.value), from: 3, to: 5, threshold: 0.25 }] })}>
          <option value="">—</option>
          {[...regions.values()].filter((r) => !s.watch.some((w) => w.rid === r.rid)).map((r) => <option key={r.rid} value={r.rid}>{prettyName(r.name)}</option>)}
        </select>
      </div>
      {s.watch.length === 0 ? <EmptyState title={t("watch.none")} /> : (
        <ul className="space-y-2">
          {s.watch.map((w, i) => {
            const hits = (m.data ?? []).filter((c) => c.rid === w.rid && c.lead >= w.from && c.lead <= w.to && (c.p_bust ?? 0) > w.threshold);
            return (
              <li key={w.rid} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
                <Link className="font-medium hover:underline" to={linkTo(`/region/${w.rid}`)}>{prettyName(regions.get(w.rid)?.name)}</Link>
                <label className="flex items-center gap-1">{t("watch.days")}
                  <input type="number" min={1} max={10} value={w.from} onChange={(e) => upd(i, { from: Number(e.target.value) })} className="w-12 rounded border bg-card px-1" aria-label="from day" />–
                  <input type="number" min={1} max={10} value={w.to} onChange={(e) => upd(i, { to: Number(e.target.value) })} className="w-12 rounded border bg-card px-1" aria-label="to day" />
                </label>
                <label className="flex items-center gap-1">{t("watch.threshold")}
                  <input type="number" min={1} max={99} value={Math.round(w.threshold * 100)} onChange={(e) => upd(i, { threshold: Number(e.target.value) / 100 })} className="w-14 rounded border bg-card px-1" />%
                </label>
                <span role="status" className="ml-auto">
                  {hits.length ? <span>◆ {t("watch.triggered")}: {hits.map((h) => `D${h.lead} ${pct(h.p_bust)}`).join(", ")}</span> : <span className="text-muted-foreground">○ —</span>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => s.set({ watch: s.watch.filter((_, j) => j !== i) })}>{t("common.unpin")}</Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Alerts are in-app only; Web Push is Phase 2.</p>
    </div>
  );
}

export function Method() {
  const h = useHealth();
  return (
    <article className="prose-sm max-w-3xl space-y-4 text-sm leading-relaxed">
      <header data-tour="method-hero" className="rounded-lg border bg-card p-4">
        <h1 className="text-2xl font-semibold">PURVA-NETRA · Forecast Trust Console</h1>
        <p className="text-lg">Know when to trust the forecast.</p>
        <p>A forecast-trust layer, not a weather model. For each of India's 36 IMD meteorological subdivisions and each lead day (Day 1–10) it estimates the probability that the ECMWF IFS rainfall forecast will <em>bust</em>, with a confidence band, the expected error, up to three plain-language reasons and the most similar past forecasts. SIH 2026 · PS 26079 (MoES / NCMRWF).</p>
      </header>
      <section>
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>WeatherBench 2: ECMWF IFS HRES (0.25°, the forecast judged) and IFS ENS (50 members, 1.5°), 2018–2022, 00/12 UTC.</li>
          <li>Truth: IMD 0.25° gridded daily rainfall. Land-only, area-weighted means over IMD subdivision polygons; the forecast is averaged over exactly the same land cells.</li>
          <li>Labels, features (ensemble spread, revision, Flip-Flop Index, …), baselines and model, fitted on 2018–2020; calibration 2021; test 2022.</li>
          <li>Predictions are precomputed per cycle into Parquet; this app replays them.</li>
        </ol>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Bust definition</h2>
        <p className="rounded-md bg-muted p-3 font-mono text-xs">log_err = | ln(1+F) − ln(1+O) |<br />bust = log_err &gt; Q90(log_err | region, lead, day-of-year ±15 d; train years) AND |F − O| ≥ 5 mm</p>
        <p>F = HRES 24-h rain, O = IMD observed, both subdivision means. Confidence bands from calibrated P(bust): High &lt; 5%, Normal 5–15%, Reduced 15–30%, Low &gt; 30%. Heavy-rain risk ▲ = HRES and ensemble disagree on ≥ 64.5 mm coverage (fixed rule).</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Currently shipped model</h2>
        <p>Version <code>{h.data?.model_version ?? "–"}</code>{h.data?.model_meta?.kind ? ` — ${h.data.model_meta.kind}` : ""}. The Trust Ledger shows held-out results when they exist; it never shows in-sample numbers.</p>
      </section>
      <section data-tour="limits" className="rounded-lg border border-[#fab219] p-4">
        <h2 className="text-lg font-semibold">Limitations</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>IFS, not NCUM.</strong> Trained and evaluated on ECMWF IFS from WeatherBench 2. NCMRWF's NCUM / NEPS-G is the Phase 2 adapter (via TIGGE); the method is model-agnostic but untested there.</li>
          <li><strong>Five seasons.</strong> 2018–2022 only: three training years, one calibration year, one test year. Rare regimes are thinly sampled.</li>
          <li><strong>Time offset.</strong> IMD's rain day ends 03 UTC; 00 UTC forecasts end 3 h earlier, 12 UTC forecasts 9 h later.</li>
          <li><strong>Land-only truth.</strong> IMD gridded rain covers land only. A &amp; N Islands and Lakshadweep have no IMD land cells and are shown as “Not assessed”.</li>
          <li><strong>Replay only.</strong> This build serves precomputed history. It is never live; near-real-time is Phase 2.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Data sources &amp; licences</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>WeatherBench 2 (Rasp et al. 2024), gs://weatherbench2 — ECMWF IFS HRES/ENS. See the dataset LICENSE file in the bucket; ECMWF data terms apply.</li>
          <li>IMD 0.25° gridded rainfall (Pai et al. 2014), imdpune.gov.in, read with imdlib. IMD terms of use apply.</li>
          <li>IMD subdivision boundaries, mausam.imd.gov.in (sd_boundary.json). Licence not stated; IMD cited as source.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Methods reused</h2>
        <p>Metrics: <code>scores</code> (Brier, Flip-Flop Index), <code>xskillscore</code> (reliability), scikit-learn (Brier, ROC/PR-AUC, isotonic), <code>nwpeval</code> (categorical). Masks: <code>regionmask</code>. Explanations: fixed templates only; no generated text.</p>
      </section>
    </article>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
      <label className="flex items-center justify-between gap-2 text-sm">{t("shell.language")}
        <select className="h-8 rounded-md border bg-card px-2" value={s.lang} onChange={(e) => s.set({ lang: e.target.value as "en" | "hi" })}>
          <option value="en">English</option><option value="hi">हिन्दी</option>
        </select>
      </label>
      {s.lang === "hi" && <p className="text-xs text-muted-foreground">{t("settings.hindi_note")}</p>}
      <label className="flex items-center justify-between gap-2 text-sm">{t("shell.theme")}
        <select className="h-8 rounded-md border bg-card px-2" value={s.theme} onChange={(e) => s.set({ theme: e.target.value as "light" | "dark" | "system" })}>
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark (ops room)</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">{t("settings.texture")}<Switch checked={s.texture} onCheckedChange={(c) => s.set({ texture: c })} /></label>
      <label className="flex items-center justify-between gap-2 text-sm">{t("common.show_numbers")}<Switch checked={s.showNumbers} onCheckedChange={(c) => s.set({ showNumbers: c })} /></label>
      <label className="flex items-center justify-between gap-2 text-sm">{t("settings.landing")}
        <select className="h-8 rounded-md border bg-card px-2" value={s.landing} onChange={(e) => s.set({ landing: e.target.value })}>
          {["/brief", "/matrix", "/map"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <div className="text-sm"><div className="font-medium">{t("settings.data_source")}</div><p className="text-muted-foreground">{t("settings.replay_only")}</p></div>
      <p className="text-sm">Units: mm per 24 h (IMD convention). Confidence: <ConfidenceBadge band="High" /> <ConfidenceBadge band="Normal" /> <ConfidenceBadge band="Reduced" /> <ConfidenceBadge band="Low" /></p>
    </div>
  );
}
