# Map 2.0: Spatial Intelligence Console (2026-09-27)

**The science is untouched.** No change to P(bust), the model, features, labels, calibration, SHAP, the ENS/IMD processing, the NRT or replay pipelines, the API contracts or the database schema. Every new view re-arranges **existing** outputs from `/matrix`, `/region`, `/explain` and `/revision`. The only new files are two display assets **derived from the existing IMD subdivision GeoJSON** (`scripts/build_map_assets.py`): `adjacency.json` and `india_outline.geojson`. Screenshots are in `docs/screens/map2/`.

## What changed on `/map`
- **Basemap selector, kept separate from the evidence layers:**
  - Minimal, Light and Dark work offline (graticule + India outline dissolved from the IMD boundaries).
  - Satellite (NASA Blue Marble true colour) and Terrain (NASA Blue Marble shaded relief + bathymetry) come from NASA GIBS: public domain, attributed, no key. They are labelled **"Context only — not used by the model"** and need a network connection. When their tiles fail, a message says so and the evidence layers are unaffected. Over imagery the evidence fill drops to 82% opacity, and the legend says so.
- **Evidence layer panel:** Category 01 Trust (P(Bust)), 02 Forecast (Forecast Rain), 03 Uncertainty (Ensemble Spread), 04 Pattern (Novelty, Revision, Regime). Each layer has a description, legend, units and semantic scale.
  - One layer at a time, with a show/hide toggle. The P(Bust) blue → grey → red meaning is unchanged.
  - The legend now says "Chance this forecast busts", explains the 10% baseline and the bands, and states what Day N means (the IMD rain day ending on the valid date).
- **D1–D10 scrubber:** date per day, previous/next, play/pause, ←/→ keys, and per-day counts of Low (◆) and Reduced (▲) regions. Changing the day updates the map, legend, ranking, footprints, investigation panel and trajectory marker together.
- **Risk hotspots:** the top 10 by **existing** P(bust), with ties broken by the existing heavy-rain flag. Clicking a row focuses the map on the region, highlights it and opens its investigation.
- **Risk footprint:** subdivisions at the model's own ▲ Reduced or ◆ Low bands that share a boundary are grouped. 1 region = isolated, 2–4 = clustered, ≥5 = widespread. There's an optional dashed outline on the map. It is labelled **"a spatial grouping of the model's bands, not a detected weather event"**.
- **Risk migration:** D1→D10 small multiples (lightweight SVG) of the existing P(bust); clicking one selects that day. The existing play animation is kept.
- **Region investigation panel**, opened by clicking a region, a hotspot or a `?rid=` deep link:
  - P(bust), confidence, forecast rain and spread for the selected day.
  - **Trust trajectory** D1→D10 (chart + table) and **confidence momentum** ↑ Improving / → Stable / ↓ Deteriorating. The rule is the least-squares slope of the existing P(bust) against lead day, ±0.5 pts/day, stated in the UI and labelled "not an ML prediction".
  - **Cycle change** for the same valid date: previous vs current P(bust), the change, and TRUST DETERIORATED/IMPROVED from the sign alone (|Δ| < 0.5 pts = unchanged). The reason shown is the exact change in the model's **existing SHAP** values between the two cycles; otherwise "Reason unavailable in this model version".
  - **"Why is this region higher risk?"** as Prediction → Evidence (SHAP by group) → Explanation (the fixed template sentences).
  - **Evidence timeline** ("When did trust change?"), from the existing per-cycle `/revision` data: rain revisions (flagged above the existing 0.4 log-unit threshold) and spread changes.
  - **Ensemble disagreement:** Low/Moderate/High from the existing spread anomaly (<1×, 1–1.5×, >1.5× normal), plus a q10–q90 band with the ensemble mean and HRES.
  - **Analog explorer**, which links to the replay when a case is in the store.
  - Buttons: Open region analysis (`/region/:rid`), Verify, Time Machine.
- **Full-screen mode** covers the navigation and keeps the layer panel, legend, day control and analysis panel. Esc or the button exits, and the state stays in the URL.
- **URL state** now also holds `basemap`, `fp` (footprint), `ev` (evidence shown), `mig`, `fs`, `ptab`, `layers` and `panel`. Existing deep links (`init`, `day`, `rid`, `layer`, `split`, `view`) behave as before. The one change: `?rid=` now opens the full investigation panel instead of the small popover.
- **Responsive:**
  - desktop: layer panel + map + analysis panel
  - tablet: map first, panels on demand as overlays
  - phone: map → risk list → region analysis, with no horizontal overflow (tested)

## Not available (reported, not faked)
- Analog cases: the analog memory isn't in the shipped model (it needs the 2018–2022 archive). The explorer says so.
- Ensemble member histogram: individual members aren't stored, only mean, q10, q90 and spread. The band view is shown and the histogram is marked unavailable.
- Novelty and Regime layers and evidence rows: not in this model version.
- SHAP attribution for the cycle change is limited to what the model has (the spread group and the lead term).
- Satellite/Terrain need network access. The offline demo uses Minimal/Light/Dark.

## Tests
- Vitest 26/26 (+8: hotspot ranking, footprint grouping/classes, momentum rule, cycle verdict, timeline facts, basemap metadata, projection).
- Playwright replay 70/70 (+17 Map 2.0: basemaps incl. imagery-offline fallback, layer panel, scrubber sync, hotspot focus, footprints, migration, investigation sections, full screen, deep link, phone overflow, axe light+dark on 3 new states); NRT 5/5; offline 2/2.
- pytest 36/36.
- Performance: lens switch ≈ 48 ms, day change ≈ 30 ms (budget 50; slower than before because more panels update in sync), cycle switch ≈ 13 ms.

## Environment note
On this machine ports 8000 and 8001 are now used by other projects, so the test stacks use **8010** (replay API; `PN_API=http://localhost:8010` for `vite preview`) and **8011** (NRT demo API; `PN_NRT_API_PORT`).

---

# Changelog: Forecast Trust Console polish + Operations console (2026-09-25)

Screenshots are in `docs/screens/before/` and `docs/screens/after/` (dark mode, 1440 and 768 px).

## What changed

### Whole app
- **Panels instead of nested cards.** There is one panel style with hairline dividers on an 8-px grid, and one large headline number per panel (`.kpi`, 32 px) with muted secondary text. The existing dark theme and tokens are kept.
- **Top bar.** It is one row at 1440 px and shows:
  - **Mode badge:** REPLAY ("historical · store built …") or NEAR-REAL-TIME ("age X h · updated hh:mm UTC"). A pulsing dot appears only when NRT data is fresh, and `MOCK UPSTREAM` appears whenever the synthetic upstream is in use.
  - The cycle picker, an honest model label, and a user menu (sign in / sign out / Operations).
- **NRT behaviour.**
  - An amber or red stale banner states the actual data age, or that the upstream is unreachable.
  - A new-cycle toast ("New cycle 00 UTC dd Mon available"). If you are following the latest cycle, the view switches and the toast says so. If the cycle is pinned in the URL (the Region page always pins it), you get a **Switch** button and nothing swaps silently.
- **Briefing.**
  - Top risks fit on one line, with the reason truncated and shown in full in a tooltip; on tablet the reason wraps to a second line.
  - The stat tiles are filters: Low → `/matrix?low=1`, heavy-rain risk → `/matrix?heavy=1`, most uncertain day → `/map?day=`.
  - A map thumbnail of that day's P(bust) opens the Map.
- **Map: the hero with the Trust Lens.**
  - It fills the full height with a collapsible side panel.
  - Six lenses, one at a time: **P(Bust)** (diverging on the 10% base rate), **Forecast Rain** (sequential), **Ensemble Spread** (sequential, × normal), **Novelty** (sequential violet), **Revision** (diverging on 0 mm: forecast rain change vs the cycle 12 h earlier for the same valid date) and **Regime**. Each has its own legend with units and a one-line meaning.
  - ←/→ keys, a per-day "regions at Low" sparkline above the scrubber, and play animation.
  - Clicking a region opens a trust popover with P(bust) and its band, the top template reason, the change vs the previous cycle, and **Open analysis** → `/region/:rid?day=`.
  - Split view puts Forecast Rain (orange) left and P(Bust) right, with synced pan, zoom and day. Layer, day, split, panel and selected region are all in the URL.
- **Region view.**
  - A sticky header strip shows the name, Forecast Trust badge, P(bust) in large type vs the 10% base rate, change vs the previous cycle, spread (× normal) and novelty.
  - A clickable Day 1–10 trust strip.
  - The page pins `?init=` so NRT updates never swap data under an analysis.
  - A **Forecast DNA / bust anatomy** panel on Overview and Why has one signed bar per evidence group (Ensemble spread, Revision, Analogs, Novelty, Regime, Forecast state), from summed **SHAP** values. Right raises risk, left lowers it, and hovering shows the matching template sentence. Groups the model lacks are greyed "Not available in this model version".
- **Evolution.**
  - Three stacked charts share the cycle axis, with no dual axes: rain per cycle with the ensemble band (light → dark), P(bust) as a step chart, and spread anomaly.
  - Tiles show the Flip-Flop Index, the largest revision, and a ✓/✗ "significant change" flag using the existing 0.4 log-unit revision threshold.
  - A "what changed" summary line is built from templates (English and Hindi).
- **Time Machine as a story.**
  - Three acts on a progress rail: What we predicted → How the forecast evolved (evolution for the 3 highest-risk valid dates) → What actually happened.
  - In Act 3, IMD truth fades in day by day and matrix cells flip to ✓/✗/!.
  - Play/pause/step controls, the score ticker vs the spread baseline, and a "REPLAY · DEMO — not the operational feed" badge.
- **Operations console** (`/ops`, operators and admins; see README → Operations console):
  - an overall-state strip, the 8-stage pipeline row, and component health
  - Data, Model, System and Controls panels, a recent-jobs table, and a logs drawer (live SSE, level filter, search, .txt download)
  - `/login` and a user menu
  - Tablet collapses to one column; phone is a read-only summary.

### Backend (all additive and backward-compatible)
- `/health`: `data_age_h`, `freshness`, `last_update`, `source`, `upstream`, `model_kind` and `model_bundle` (the actual training and calibration periods).
- `/matrix`: `f_rain_prev` and `p_bust_prev` from the previous cycle for the same valid date (feeds the Revision lens).
- `/explain`: `group_contributions` holds per-group SHAP sums and flags groups the model lacks. For the shipped B2 model these are **exact linear SHAP** (`shap.LinearExplainer`, full background); a LightGBM model would use TreeSHAP.
- `/revision`: `spread_anom`. `/verify`: nwpeval contingency scores (added earlier).
- New: `/auth/*`, `/ops/*`, the NRT runner (`nrt.py`), the worker (`worker.py`), the ops store (`ops/db.py`) and the model bundle (`bundle.py`).
- API data requests use `cache: "no-store"`, because freshness data must never come from the HTTP cache.

### Colour
New scales were validated per arm in light and dark with the dataviz validator:
- **Revision:** orange (drier) ↔ grey ↔ blue (wetter). Each arm passes the monotone, step-gap and single-hue checks. The two ends are CVD-distinct (ΔE 22 light / 18 dark).
- **Novelty:** a violet ramp.

Accepted exceptions: near-zero map steps recede toward the surface (below the ordinal 2:1 light-end floor), and the bright far ends in dark mode sit outside the *categorical* lightness band. The extreme blue P(bust) step moved to `#256abf`, because text on `#2a78d6` fails 4.5:1 in either ink.

## Fixed from issues (a)–(c)
- **(a) "trained 2020–2020".** The **model** is what's wrong, not the label. The shipped model is the July-2020 **in-sample placeholder** (B2 fitted on 1–20 July 2020), and the label was reading its threshold years correctly. The spec's training (2018–2020) and calibration (2021) can't happen until the 2018–2022 archive is extracted. The header now reads "**PLACEHOLDER · B2 fitted Jul 2020 (in-sample)**", and its tooltip and `/ops` show the spec target periods as "not trained yet". A real bundle would display its own `train … · calib …`.
- **(b) "34/36 regions assessed".** The two are **A & N Islands and Lakshadweep**. IMD's 0.25° gridded rainfall has **no land cells** there, so there is no truth to define a bust. Adding one would need another dataset, which the rules forbid. The Briefing tile tooltip names them, a note under the tiles states the reason, and map popovers and legends say "Not assessed — no IMD land cells".
- **(c) Regime.** It is not in the shipped model, so every regime element says **"Not available in this model version"**: the Briefing tile, the Regime lens (with a map banner and legend), the DNA row and the map hover text. No regime is inferred or faked.

## Left as "Not available"
- Regime (lens, tile and DNA row): no regime model in the shipped bundle.
- Novelty lens and the novelty KPI: no analog memory in the shipped bundle.
- DNA rows for Revision, Analogs, Novelty, Regime and Forecast state: B2 has only the spread feature (and lead), so only **Ensemble spread** has a SHAP bar. Lead appears as "other model term".
- Analog cards: the analog memory needs the multi-year archive.
- Trust Ledger and "Test 2022: BSS vs B2": no held-out evaluation exists yet.
- The History tab needs the multi-year archive.
- Calibration drift: "Insufficient verified data (n = X / 200)" until 200 NRT predictions are verified.
- Web Push, IFS-vs-NEPS-G compare, and SSO/OIDC: hooks only.
