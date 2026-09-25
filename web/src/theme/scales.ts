// Colour roles (spec §13.8). Every value here was run through the dataviz palette validator
// (see README → "Colour validation"). One job per scale; status colours never reused as series.

export type Theme = "light" | "dark";

// P(bust) diverging scale, midpoint = 10% base rate. Bins (upper edges, fraction):
export const PBUST_EDGES = [0.03, 0.06, 0.09, 0.12, 0.18, 0.25, 0.35, 1.0001];
export const PBUST_LABELS = ["< 3%", "3–6%", "6–9%", "9–12%", "12–18%", "18–25%", "25–35%", "> 35%"];
const DIV: Record<Theme, string[]> = {
  //       blue arm (more trustworthy) ← neutral →  red arm (less trustworthy)
  light: ["#2a78d6", "#6da7ec", "#b7d3f6", "#f0efec", "#f5c0b3", "#eb8a75", "#d4493d", "#9c2723"],
  dark: ["#5b97e3", "#2f6fc0", "#1f4f8f", "#383835", "#94342c", "#b8433a", "#dc5f51", "#f29a8a"],
};
// Ink that stays legible on each bin (for numbers inside cells)
const DIV_INK: Record<Theme, string[]> = {
  light: ["#ffffff", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#ffffff"],
  dark: ["#0b0b0b", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0b0b0b", "#0b0b0b"],
};
export const pbustBin = (p: number) => PBUST_EDGES.findIndex((e) => p < e);
export const pbustColor = (p: number | null | undefined, t: Theme) =>
  p == null || Number.isNaN(p) ? "transparent" : DIV[t][pbustBin(p)];
export const pbustInk = (p: number | null | undefined, t: Theme) =>
  p == null || Number.isNaN(p) ? "inherit" : DIV_INK[t][pbustBin(p)];
export const pbustPalette = (t: Theme) => DIV[t];

// Change-vs-previous (Compare difference matrix): diverging on zero, same two hues.
export const DIFF_EDGES = [-0.1, -0.05, -0.02, 0.02, 0.05, 0.1, 9];
export const DIFF_LABELS = ["≤ −10 pts", "−10…−5", "−5…−2", "±2", "+2…+5", "+5…+10", "≥ +10 pts"];
const DIFF: Record<Theme, string[]> = {
  light: ["#2a78d6", "#6da7ec", "#b7d3f6", "#f0efec", "#f5c0b3", "#eb8a75", "#d4493d"],
  dark: ["#5b97e3", "#2f6fc0", "#1f4f8f", "#383835", "#94342c", "#b8433a", "#dc5f51"],
};
export const diffColor = (d: number | null | undefined, t: Theme) =>
  d == null ? "transparent" : DIFF[t][DIFF_EDGES.findIndex((e) => d < e)];
export const diffPalette = (t: Theme) => DIFF[t];
const DIFF_INK: Record<Theme, string[]> = {
  light: ["#ffffff", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b"],
  dark: ["#0b0b0b", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0b0b0b"],
};
export const diffInk = (d: number | null | undefined, t: Theme) =>
  d == null ? "inherit" : DIFF_INK[t][DIFF_EDGES.findIndex((e) => d < e)];

// Sequential blue (forecast rain, spread) and the second sequential hue, orange (when shown beside the diverging map).
export const SEQ_BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
export const SEQ_BLUE_DARK = ["#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];
export const SEQ_ORANGE = ["#fde0d2", "#f8bb9f", "#f29470", "#eb6834", "#c9501f", "#a03e16", "#76300f"];
export const SEQ_ORANGE_DARK = ["#76300f", "#a03e16", "#c9501f", "#eb6834", "#f29470", "#f8bb9f", "#fde0d2"];
export const RAIN_EDGES = [1, 2.5, 7.5, 15, 35, 64.5, 1e9];
export const RAIN_LABELS = ["< 1", "1–2.5", "2.5–7.5", "7.5–15", "15–35", "35–64.5", "≥ 64.5 mm"];
export const SPREAD_EDGES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 1e9];
export const SPREAD_LABELS = ["< 0.5×", "0.5–0.75×", "0.75–1×", "1–1.25×", "1.25–1.5×", "1.5–2×", "≥ 2×"];
export const seqColor = (v: number | null | undefined, edges: number[], ramp: string[]) =>
  v == null || Number.isNaN(v) ? "transparent" : ramp[edges.findIndex((e) => v < e)];

// Evolution chart: ordered steps of one hue (oldest light → newest dark), blue 250 → 650.
export const CYCLE_STEPS = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#104281"];
export const CYCLE_STEPS_DARK = ["#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#b7d3f6"];

// Proof chart: categorical, fixed order — B0 slot 1, B2 slot 2, model slot 3.
export const SERIES: Record<Theme, { b0: string; b2: string; model: string }> = {
  light: { b0: "#2a78d6", b2: "#eb6834", model: "#1baf7a" },
  dark: { b0: "#3987e5", b2: "#d95926", model: "#199e70" },
};

// Confidence bands: status colour + icon + text, always together.
export type Band = "High" | "Normal" | "Reduced" | "Low" | "Not assessed";
export const BAND: Record<Band, { color: string; icon: string }> = {
  High: { color: "#0ca30c", icon: "✓" },
  Normal: { color: "#898781", icon: "○" },
  Reduced: { color: "#fab219", icon: "▲" },
  Low: { color: "#d03b3b", icon: "◆" },
  "Not assessed": { color: "#898781", icon: "–" },
};

export const chartInk = (t: Theme) =>
  t === "dark"
    ? { text: "#ffffff", text2: "#c3c2b7", muted: "#b5b4aa", grid: "#2c2c2a", axis: "#383835", surface: "#1a1a19" }
    : { text: "#0b0b0b", text2: "#52514e", muted: "#5c5b57", grid: "#e1e0d9", axis: "#c3c2b7", surface: "#fcfcfb" };
