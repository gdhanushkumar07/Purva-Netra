// Status → icon + label + colour. Colour is never the only signal, and anything not measured is
// "Unknown" / "Not monitored" — it never maps to the success style.
export type Tone = "good" | "warn" | "bad" | "neutral" | "busy";
export interface StatusView { icon: string; label: string; tone: Tone }

export const TONE_COLOR: Record<Tone, string> = { good: "#0ca30c", warn: "#fab219", bad: "#d03b3b", neutral: "#898781", busy: "#3987e5" };

const MAP: Record<string, StatusView> = {
  ok: { icon: "✓", label: "OK", tone: "good" },
  up: { icon: "✓", label: "Up", tone: "good" },
  done: { icon: "✓", label: "Done", tone: "good" },
  healthy: { icon: "✓", label: "Healthy", tone: "good" },
  fresh: { icon: "✓", label: "Fresh", tone: "good" },
  reachable: { icon: "✓", label: "Reachable", tone: "good" },
  published: { icon: "✓", label: "Published", tone: "good" },
  running: { icon: "⟳", label: "Running", tone: "busy" },
  queued: { icon: "⟳", label: "Queued", tone: "busy" },
  reused: { icon: "↺", label: "Reused", tone: "neutral" },
  warn: { icon: "▲", label: "Warning", tone: "warn" },
  stale: { icon: "▲", label: "Stale", tone: "warn" },
  degraded: { icon: "▲", label: "Degraded", tone: "warn" },
  insufficient: { icon: "○", label: "Insufficient data", tone: "neutral" },
  noop: { icon: "–", label: "No-op", tone: "neutral" },
  fail: { icon: "✗", label: "Failed", tone: "bad" },
  failed: { icon: "✗", label: "Failed", tone: "bad" },
  down: { icon: "◆", label: "Down", tone: "bad" },
  old: { icon: "◆", label: "Old", tone: "bad" },
  unreachable: { icon: "◆", label: "Upstream unreachable", tone: "bad" },
  pending: { icon: "○", label: "Pending", tone: "neutral" },
  skipped: { icon: "–", label: "Skipped", tone: "neutral" },
  disabled: { icon: "–", label: "Disabled", tone: "neutral" },
  not_monitored: { icon: "?", label: "Not monitored", tone: "neutral" },
  not_in_model: { icon: "–", label: "Not in this model version", tone: "neutral" },
  unknown: { icon: "?", label: "Unknown", tone: "neutral" },
};

export function statusView(s: string | null | undefined): StatusView {
  if (s == null || s === "") return MAP.unknown;
  return MAP[s.toLowerCase()] ?? { icon: "?", label: s, tone: "neutral" };
}

export const isSuccess = (s: string | null | undefined) => statusView(s).tone === "good";

/** Freshness class from data age (hours), same thresholds as the API (18 h / 36 h). */
export function freshnessOf(ageH: number | null | undefined): "fresh" | "stale" | "old" | "unknown" {
  if (ageH == null || Number.isNaN(ageH)) return "unknown";
  return ageH < 18 ? "fresh" : ageH < 36 ? "stale" : "old";
}
