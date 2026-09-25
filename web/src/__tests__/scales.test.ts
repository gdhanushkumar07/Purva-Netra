import { describe, expect, it } from "vitest";
import { pbustBin, pbustColor, PBUST_LABELS, diffColor, BAND } from "@/theme/scales";
import { pct, pts, prettyName, linkTo } from "@/lib/hooks";

describe("P(bust) diverging scale", () => {
  it("is centred on the 10% base rate (9–12% is the neutral bin)", () => {
    expect(PBUST_LABELS[pbustBin(0.10)]).toBe("9–12%");
    expect(pbustColor(0.10, "light")).toBe("#f0efec");
    expect(pbustColor(0.10, "dark")).toBe("#383835");
  });
  it("puts low risk on the blue arm and high risk on the red arm", () => {
    expect(pbustBin(0.01)).toBe(0);
    expect(pbustBin(0.5)).toBe(7);
    expect(pbustColor(null, "light")).toBe("transparent");
  });
  it("difference scale is neutral around zero", () => {
    expect(diffColor(0, "light")).toBe("#f0efec");
  });
  it("every confidence band has an icon (never colour alone)", () => {
    for (const b of Object.values(BAND)) expect(b.icon.length).toBeGreaterThan(0);
  });
});

describe("formatting helpers", () => {
  it("formats percentages and points", () => {
    expect(pct(0.345)).toBe("35%");
    expect(pts(0.12)).toBe("+12 pts");
    expect(pts(-0.05)).toBe("−5 pts");
  });
  it("title-cases IMD names but keeps abbreviations", () => {
    expect(prettyName("GANGETIC WEST BENGAL")).toBe("Gangetic West Bengal");
    expect(prettyName("A & N ISLAND")).toBe("A & N Island");
  });
  it("carries the cycle through links", () => {
    window.history.pushState({}, "", "/matrix?init=2020-07-12T12:00&day=3");
    expect(linkTo("/region/8", { day: 5 })).toBe("/region/8?init=2020-07-12T12%3A00&day=5");
  });
});
