import { describe, expect, it } from "vitest";
import { dnaBars, EVIDENCE_ORDER, revColor, REV_EDGES, LENSES, SEQ_VIOLET } from "@/theme/scales";
import { statusView, isSuccess, freshnessOf } from "@/lib/status";
import { modelLabel } from "@/components/shell/Shell";
import { lensColor } from "@/pages/MapPage";
import type { Cell } from "@/api/client";

describe("Forecast DNA: SHAP groups → signed bars", () => {
  const groups = [
    { group: "spread", available: true, value: 1.2, reason: null },
    { group: "revision", available: true, value: -0.6, reason: null },
    { group: "analogs", available: false, value: null, reason: "Not available in this model version" },
    { group: "regime", available: false, value: null, reason: "Not available in this model version" },
  ];
  const bars = dnaBars(groups);
  it("always returns the six evidence groups in fixed order", () => {
    expect(bars.map((b) => b.group)).toEqual([...EVIDENCE_ORDER]);
  });
  it("right = raises risk, left = lowers risk, scaled to the largest |value|", () => {
    const s = bars.find((b) => b.group === "spread")!, r = bars.find((b) => b.group === "revision")!;
    expect(s.side).toBe("raises"); expect(s.widthPct).toBeCloseTo(100);
    expect(r.side).toBe("lowers"); expect(r.widthPct).toBeCloseTo(50);
  });
  it("groups missing from the response or the model are greyed, never zero-valued bars", () => {
    for (const g of ["analogs", "regime", "novelty", "state"]) {
      const b = bars.find((x) => x.group === g)!;
      expect(b.available).toBe(false); expect(b.value).toBeNull(); expect(b.widthPct).toBe(0);
      expect(b.reason).toBe("Not available in this model version");
    }
  });
});

describe("status mapping never turns unknown into success", () => {
  it("Unknown ≠ OK", () => {
    for (const s of [undefined, null, "", "unknown", "not_monitored", "insufficient", "pending", "skipped", "disabled", "whatever"]) {
      expect(isSuccess(s as string)).toBe(false);
    }
    expect(statusView("unknown").label).toBe("Unknown");
    expect(statusView(null).icon).toBe("?");
    expect(isSuccess("ok")).toBe(true); expect(isSuccess("done")).toBe(true);
  });
  it("every status has an icon and a text label (colour is never alone)", () => {
    for (const s of ["ok", "warn", "fail", "running", "pending", "skipped", "unknown", "down", "reused", "stale", "old"]) {
      const v = statusView(s); expect(v.icon.length).toBeGreaterThan(0); expect(v.label.length).toBeGreaterThan(0);
    }
  });
  it("freshness thresholds match the API (18 h / 36 h)", () => {
    expect(freshnessOf(null)).toBe("unknown");
    expect(freshnessOf(17.9)).toBe("fresh"); expect(freshnessOf(18)).toBe("stale"); expect(freshnessOf(36)).toBe("old");
  });
});

describe("Trust Lens scales", () => {
  it("revision is diverging around 0 with a grey neutral bin", () => {
    expect(REV_EDGES.findIndex((e) => 0 < e)).toBe(3);
    expect(revColor(0, "light")).toBe("#f0efec"); expect(revColor(0, "dark")).toBe("#383835");
    expect(revColor(-25, "light")).not.toBe(revColor(25, "light"));
  });
  it("six lenses, each with units and a one-line meaning", () => {
    expect(LENSES.map((l) => l.id)).toEqual(["pbust", "rain", "spread", "novelty", "revision", "regime"]);
    for (const l of LENSES) { expect(l.units).toBeTruthy(); expect(l.meaning.length).toBeGreaterThan(10); }
  });
  it("regime and missing novelty render as the no-data colour (never a fake category)", () => {
    const c = { rid: 1, lead: 1, p_bust: 0.2, novelty: null } as unknown as Cell;
    expect(lensColor("regime", "light")(c)).toBe("#e8e7e1");
    expect(lensColor("novelty", "light")(c)).toBe("#e8e7e1");
    expect(lensColor("novelty", "light")({ ...c, novelty: 3.5 })).toBe(SEQ_VIOLET[6]);
  });
});

describe("issue (a): the model label reports what the model actually is", () => {
  it("placeholder bundle is labelled as such with the spec periods in the long text", () => {
    const m = modelLabel({ model_kind: "placeholder", model_version: "thinslice-b2-2020-07",
      model_bundle: { version: "thinslice-b2-2020-07", spec_training_period: "2018–2020", spec_calibration_period: "2021", note: "x" } } as never);
    expect(m.short).toContain("PLACEHOLDER");
    expect(m.short).not.toContain("2020–2020");
    expect(m.long).toContain("2018–2020"); expect(m.long).toContain("2021");
  });
  it("a trained bundle shows its own training and calibration periods", () => {
    const m = modelLabel({ model_kind: "trained", model_bundle: { training_period: "2018–2020", calibration_period: "2021" } } as never);
    expect(m.short).toBe("IFS · train 2018–2020 · calib 2021");
  });
});
