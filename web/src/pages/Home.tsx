import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { 
  ArrowRight, ShieldCheck, Cpu, Database, MapPin, Activity, 
  Layers, BarChart2, CheckCircle2, ChevronRight, Terminal, 
  ExternalLink, Sparkles, AlertCircle, Compass, Radio, FileText
} from "lucide-react";
import { useHealth, useMatrix } from "@/api/client";
import { useInit, useResolvedTheme, pct, prettyName, fmtInit } from "@/lib/hooks";
import { PBUST_LABELS, pbustPalette, type Theme } from "@/theme/scales";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { t } = useTranslation();
  const theme = useResolvedTheme();
  const nav = useNavigate();
  const { init } = useInit();
  const h = useHealth();
  const m = useMatrix(init);

  const [activeSection, setActiveSection] = useState("hero");
  const [selectedDay, setSelectedDay] = useState(5);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Scroll spy for sticky navigation active pill
  useEffect(() => {
    const handleScroll = () => {
      const sections = ["hero", "problem", "how-it-works", "why", "workflow", "tech", "demo"];
      const scrollPos = window.scrollY + 180;
      for (const s of sections) {
        const el = document.getElementById(s);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(s);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const pal = pbustPalette(theme);

  // Sample genuine region subset from real matrix or fallback
  const sampleRegions = [
    { rid: 8, name: "Vidarbha", p: 0.28, conf: "Low", dRain: "42 mm", reason: "Members disagree 4.1x normal spread" },
    { rid: 7, name: "Saurashtra & Kutch", p: 0.32, conf: "Low", dRain: "56 mm", reason: "Forecast changed notably vs previous cycle" },
    { rid: 2, name: "Gujarat Region", p: 0.22, conf: "Reduced", dRain: "35 mm", reason: "Elevated spread in coastal convection" },
    { rid: 33, name: "Kerala", p: 0.04, conf: "High", dRain: "88 mm", reason: "High ensemble convergence & regime alignment" },
    { rid: 14, name: "Jharkhand", p: 0.19, conf: "Reduced", dRain: "24 mm", reason: "Moderate spread anomaly across leads" },
    { rid: 18, name: "Assam & Meghalaya", p: 0.08, conf: "Normal", dRain: "65 mm", reason: "Stable orographic monsoon flow" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary font-sans">
      {/* 1. STICKY TOP NAVIGATION */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="font-extrabold tracking-tight text-base sm:text-lg">PURVA NETRA</span>
            <span className="hidden sm:inline-block h-3.5 w-px bg-border mx-1" />
            <span className="hidden sm:inline-block text-[11px] font-medium uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
              Forecast Trust Intelligence
            </span>
          </Link>

          {/* Navigation Anchors */}
          <nav className="hidden md:flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 text-xs font-medium text-muted-foreground shadow-xs">
            {[
              { id: "hero", label: "HOME" },
              { id: "problem", label: "PROBLEM" },
              { id: "how-it-works", label: "HOW IT WORKS" },
              { id: "why", label: "WHY PURVA NETRA" },
              { id: "tech", label: "TECHNOLOGY" },
              { id: "demo", label: "LIVE DEMO" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeSection === item.id 
                    ? "bg-background text-foreground font-semibold shadow-xs border border-border/40" 
                    : "hover:text-foreground hover:bg-background/40"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Right Action */}
          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm text-xs px-3.5 h-8 rounded-md"
            >
              <Link to="/brief" data-testid="landing-launch-btn">
                LAUNCH CONSOLE
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section id="hero" className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-border/60">
        {/* Subtle grid pattern background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" 
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            color: theme === "dark" ? "#ffffff08" : "#00000008"
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            
            {/* Left Column: Editorial Headline & Actions */}
            <div className="lg:col-span-6 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs font-mono text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                <span>SIH 2026 · PS 26079 · MEDIUM-RANGE RISK INTELLIGENCE</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-foreground uppercase">
                Know When to Trust <br />
                <span className="text-primary underline decoration-border decoration-wavy decoration-1 underline-offset-8">
                  The Forecast.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed font-normal">
                Purva Netra is a forecast-trust intelligence layer for medium-range weather prediction — 
                revealing when a forecast may fail, why confidence changes, and how it performs against observed rainfall.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-6 shadow-md hover:shadow-lg transition-all"
                >
                  <Link to="/brief">
                    LAUNCH PURVA NETRA
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>

                <Button 
                  asChild 
                  variant="outline" 
                  size="lg"
                  className="border-border hover:bg-accent text-foreground font-medium px-5"
                >
                  <a href="#how-it-works">SEE HOW IT WORKS</a>
                </Button>
              </div>

              {/* Factual live indicators */}
              <div className="pt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">ECMWF IFS:</span>
                  <span>0.4° HRES + 1.5° ENS</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">TRUTH:</span>
                  <span>IMD 0.25° Gridded Rain</span>
                </div>
                <div className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">COVERAGE:</span>
                  <span>36 Subdivisions × D1–10</span>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Visual Product Preview (India Map + Timeline + P(Bust)) */}
            <div className="lg:col-span-6">
              <div className="relative rounded-xl border border-border bg-card p-4 shadow-xl overflow-hidden transition-all duration-300 hover:border-primary/40">
                {/* Console Window Header */}
                <div className="flex items-center justify-between border-b border-border/70 pb-3 mb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="size-2.5 rounded-full bg-green-500/80 inline-block" />
                    <span className="font-mono font-semibold ml-2 text-foreground tracking-wide">
                      PURVA-NETRA / FORECAST TRUST CONSOLE
                    </span>
                  </div>
                  <span className="font-mono text-[11px] rounded bg-muted px-2 py-0.5 text-muted-foreground font-medium">
                    CYCLE: 12 UTC
                  </span>
                </div>

                {/* Main Product Preview Frame */}
                <div className="space-y-4">
                  {/* Top Trust KPI Ribbon */}
                  <div className="grid grid-cols-3 gap-2 text-left">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground uppercase font-mono">RISK LEVEL</div>
                      <div className="text-xl font-bold font-mono text-destructive">2 LOW CONF</div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground uppercase font-mono">HEAVY RAIN</div>
                      <div className="text-xl font-bold font-mono text-foreground">6 REGIONS ▲</div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground uppercase font-mono">HIGHEST UNCERTAINTY</div>
                      <div className="text-xl font-bold font-mono text-primary">DAY {selectedDay}</div>
                    </div>
                  </div>

                  {/* Interactive Map & Matrix Preview Representation */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    {/* Simplified Stylized India Subdivision Schematic */}
                    <div className="relative rounded-lg border border-border/60 bg-background/50 p-3 h-52 flex flex-col justify-between overflow-hidden">
                      <div className="flex justify-between items-center text-[11px] font-mono text-muted-foreground border-b border-border/40 pb-1">
                        <span>P(BUST) REGION MAPPING</span>
                        <span className="text-primary font-semibold">DAY {selectedDay}</span>
                      </div>

                      {/* Stylized Geo Hex/Polygon Map of Indian Subdivisions */}
                      <div className="relative h-36 flex items-center justify-center">
                        <svg viewBox="0 0 240 240" className="w-full h-full max-h-36 drop-shadow-xs" aria-label="India meteorological subdivisions forecast trust map">
                          {/* Northern Jammu & Kashmir */}
                          <path d="M 95 25 L 120 20 L 140 38 L 120 55 L 95 45 Z" fill={pal[1]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("J & K (High Trust)")} />
                          {/* Western Rajasthan */}
                          <path d="M 60 70 L 95 65 L 105 105 L 55 110 Z" fill={pal[6]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("West Rajasthan · P(Bust) 34% (Low)")} />
                          {/* Gujarat & Saurashtra */}
                          <path d="M 45 115 L 75 112 L 80 145 L 40 140 Z" fill={pal[5]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Saurashtra & Kutch · P(Bust) 30% (Low)")} />
                          {/* Central MP */}
                          <path d="M 98 75 L 145 78 L 140 120 L 90 115 Z" fill={pal[3]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Madhya Pradesh · P(Bust) 11% (Normal)")} />
                          {/* Vidarbha & Maharashtra */}
                          <path d="M 85 130 L 135 125 L 130 160 L 75 155 Z" fill={pal[6]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Vidarbha · P(Bust) 28% (Low)")} />
                          {/* East & Odisha */}
                          <path d="M 142 95 L 180 100 L 175 140 L 138 135 Z" fill={pal[4]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Odisha · P(Bust) 18% (Reduced)")} />
                          {/* North East Assam */}
                          <path d="M 185 65 L 225 60 L 220 90 L 180 92 Z" fill={pal[2]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Assam & Meghalaya · P(Bust) 8% (Normal)")} />
                          {/* Southern Peninsula */}
                          <path d="M 88 165 L 125 162 L 115 210 L 80 185 Z" fill={pal[0]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Kerala · P(Bust) 4% (High Trust)")} />
                          {/* Tamil Nadu */}
                          <path d="M 115 170 L 140 172 L 125 215 L 110 212 Z" fill={pal[1]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion("Tamil Nadu · P(Bust) 5% (High Trust)")} />
                        </svg>
                      </div>

                      <div className="text-[11px] font-mono text-muted-foreground flex items-center justify-between pt-1 border-t border-border/30">
                        <span>{hoveredRegion ?? "Hover subdivision"}</span>
                        <span className="text-[10px] text-primary">Interactive</span>
                      </div>
                    </div>

                    {/* Subdivision Live Risk Feed */}
                    <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 h-52 flex flex-col justify-between overflow-hidden">
                      <div className="flex justify-between items-center text-[11px] font-mono text-muted-foreground border-b border-border/40 pb-1">
                        <span>SUBDIVISION TRUST MATRIX</span>
                        <span>TOP RISKS</span>
                      </div>

                      <div className="space-y-1.5 overflow-hidden">
                        {sampleRegions.slice(0, 4).map((item) => (
                          <div 
                            key={item.rid} 
                            className="flex items-center justify-between text-xs p-1.5 rounded border border-border/40 bg-card hover:bg-accent/60 transition-colors"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="font-semibold truncate">{item.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.reason}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <span 
                                className="inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-bold"
                                style={{
                                  backgroundColor: item.p > 0.25 ? "#9c272325" : item.p > 0.15 ? "#eb8a7525" : "#256abf25",
                                  color: item.p > 0.25 ? "#b8322f" : item.p > 0.15 ? "#eb6834" : "#1c5cab"
                                }}
                              >
                                {pct(item.p)}
                              </span>
                              <div className="text-[9px] text-muted-foreground">{item.conf}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Day 1 - 10 Timeline Scrubber */}
                  <div className="pt-2 border-t border-border/70 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
                      <span>LEAD TIMELINE (DAYS 1–10)</span>
                      <span>SELECTED: <strong className="text-foreground">DAY {selectedDay}</strong></span>
                    </div>

                    <div className="grid grid-cols-10 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedDay(d)}
                          className={`rounded py-1 text-center font-mono text-xs transition-all ${
                            selectedDay === d
                              ? "bg-primary text-primary-foreground font-bold shadow-xs scale-105"
                              : "border border-border/60 bg-muted/40 hover:bg-accent text-foreground"
                          }`}
                        >
                          D{d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. TRUST METRICS STRIP */}
      <section className="border-b border-border/70 bg-card/60 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center divide-y md:divide-y-0 md:divide-x divide-border/60">
            <div className="pt-2 md:pt-0">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-foreground">36</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground">IMD Subdivisions</div>
            </div>
            <div className="pt-4 md:pt-0 md:pl-6">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-foreground">10</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground">Forecast Lead Days</div>
            </div>
            <div className="pt-4 md:pt-0 md:pl-6">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-foreground">50</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground">Ensemble Members</div>
            </div>
            <div className="pt-4 md:pt-0 md:pl-6">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-primary">P(BUST)</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase text-muted-foreground">Calibrated Trust Signal</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PROBLEM SECTION */}
      <section id="problem" className="py-20 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
              THE OPERATIONAL CHALLENGE
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight uppercase text-foreground">
              The Forecast Is Not The Whole Story.
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              A deterministic forecast predicts what numerical weather models expect to happen. 
              However, for disaster response managers, dam operators, and district officials, rainfall point predictions alone fail to reveal forecast fragility.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: "01",
                label: "HOW UNCERTAIN IS IT?",
                desc: "Does the 50-member ensemble cluster tightly around the forecast, or do members violently diverge with large spread anomalies?"
              },
              {
                step: "02",
                label: "HOW UNUSUAL IS THE PATTERN?",
                desc: "Has the atmospheric regime (low-pressure depression, western disturbance, or monsoonal trough) exhibited historical failure patterns?"
              },
              {
                step: "03",
                label: "HAS THE FORECAST FLIPPED?",
                desc: "Are successive forecast cycles flip-flopping across updates, signaling atmospheric instability and lower reliability?"
              },
              {
                step: "04",
                label: "HOW MUCH CAN BE TRUSTED?",
                desc: "What is the calibrated probability that the forecast will bust, quantified as an absolute error > 20 mm or > 2x the rainfall threshold?"
              }
            ].map((p) => (
              <div key={p.step} className="rounded-xl border border-border/80 bg-card p-6 flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div className="space-y-3">
                  <div className="font-mono text-xs font-bold text-muted-foreground">{p.step}</div>
                  <h3 className="font-bold text-sm text-foreground tracking-tight">{p.label}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Decision Progression Line */}
          <div className="mt-10 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono font-semibold text-center">
              <span className="rounded bg-background px-3 py-1.5 border border-border">RAW FORECAST</span>
              <span className="text-muted-foreground font-bold">↓</span>
              <span className="rounded bg-background px-3 py-1.5 border border-border">ENSEMBLE UNCERTAINTY</span>
              <span className="text-muted-foreground font-bold">↓</span>
              <span className="rounded bg-primary/10 text-primary border border-primary/30 px-3 py-1.5 font-bold">BUST RISK CALIBRATION</span>
              <span className="text-muted-foreground font-bold">↓</span>
              <span className="rounded bg-background px-3 py-1.5 border border-border">INFORMED OPERATIONAL DECISION</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS (PIPELINE) */}
      <section id="how-it-works" className="py-20 border-b border-border/60 bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
              END-TO-END METHODOLOGY
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase text-foreground">
              How Purva Netra Works
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              From global numerical weather prediction data to regional ground-truth verification — engineered with strict leakage guards and zero in-sample contamination.
            </p>
          </div>

          {/* Structured Visual Pipeline Flow */}
          <div className="mt-12 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-mono font-bold text-primary flex items-center gap-2">
                  <Database className="size-4" /> DATA INGESTION
                </div>
                <h4 className="font-bold text-sm text-foreground">ECMWF IFS + IMD Truth</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Extracts 0.4° deterministic HRES alongside 50-member 1.5° ENS precipitation from WeatherBench 2, aligned with IMD 0.25° gridded observation truth.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-mono font-bold text-primary flex items-center gap-2">
                  <Layers className="size-4" /> REGION MAPPING & FEATURES
                </div>
                <h4 className="font-bold text-sm text-foreground">Subdivision Aggregation</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Computes 36 area-weighted meteorological subdivision totals, calculating ensemble spread anomalies, 12-hour cycle revision jumps, and Flip-Flop Index (FFI).
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-mono font-bold text-primary flex items-center gap-2">
                  <Cpu className="size-4" /> BUST DETECTION & ML
                </div>
                <h4 className="font-bold text-sm text-foreground">LightGBM & Isotonic Heads</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Evaluates bust binary criteria (|F - O| &gt; 20 mm and |F - O| &gt; 2 × max(F, O)) and calibrates probabilities against Leave-One-Year-Out folds.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-mono font-bold text-primary flex items-center gap-2">
                  <Activity className="size-4" /> EXPLAINABILITY (FORECAST DNA)
                </div>
                <h4 className="font-bold text-sm text-foreground">SHAP Attribution & Analogs</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Generates transparent evidence groups (spread, revision, analogs, novelty, regime, state) and finds historical top-5 analogs using EOF error memory.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-mono font-bold text-primary flex items-center gap-2">
                  <ShieldCheck className="size-4" /> VERIFICATION & TRUST LEDGER
                </div>
                <h4 className="font-bold text-sm text-foreground">Held-out Brier Skill & NWPEval</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Computes POD, FAR, CSI, ETS contingency scores and enforces strict gates before shipping model versions to operational personnel.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. WHY PURVA NETRA (FEATURE CARDS) */}
      <section id="why" className="py-20 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
              CORE CAPABILITIES
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase text-foreground">
              Why Purva Netra
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Built specifically for the unique convective dynamics and forecast vulnerabilities of the Indian monsoon.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                num: "01",
                title: "FORECAST BUST PROBABILITY",
                desc: "Calibrated probability P(bust) computed for each lead day (1–10) with High, Normal, Reduced, and Low confidence classifications."
              },
              {
                num: "02",
                title: "ENSEMBLE-AWARE TRUST",
                desc: "Direct integration of 50-member ECMWF IFS ensemble spread anomaly against lead-day climatology to catch unpredicted model divergence."
              },
              {
                num: "03",
                title: "REGION-LEVEL INTELLIGENCE",
                desc: "Precise polygonal mask coverage for all 36 IMD meteorological subdivisions, from Western Ghats to Gangetic West Bengal."
              },
              {
                num: "04",
                title: "FORECAST EVOLUTION",
                desc: "Stacked visual timeline tracking when the forecast changed, whether ensemble spread expanded, and whether the model flip-flopped."
              },
              {
                num: "05",
                title: "FORECAST DNA",
                desc: "SHAP-driven explainability identifying the exact physical contributor behind uncertainty: spread anomaly, recent cycle revision, or analog history."
              },
              {
                num: "06",
                title: "VERIFICATION AGAINST TRUTH",
                desc: "Systematic contingency metrics (POD, FAR, CSI, ETS) computed against real IMD gridded observations to prove reliability over time."
              },
            ].map((card) => (
              <div 
                key={card.num} 
                className="rounded-xl border border-border/70 bg-card p-6 space-y-3 hover:border-primary/50 transition-all shadow-xs"
              >
                <div className="font-mono text-xs font-bold text-muted-foreground">{card.num}</div>
                <h3 className="font-bold text-sm tracking-tight text-foreground">{card.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. PRODUCT EXPERIENCE SECTION (WORKFLOW) */}
      <section id="workflow" className="py-20 border-b border-border/60 bg-muted/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
              OPERATIONAL WORKFLOW
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase text-foreground">
              A Complete Operational System
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Purva Netra is not a mock concept. Explore the actual operational workflow provided inside the application console:
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { to: "/brief", title: "BRIEFING", desc: "Top-line summary of low-confidence regions, heavy rain flags, and highest uncertainty days." },
              { to: "/matrix", title: "MATRIX", desc: "36 subdivisions × 10 days interactive reliability table with keyboard arrow navigation." },
              { to: "/map", title: "MAP", desc: "Sub-100ms MapLibre GL choropleth with synchronized dual-split view and trust lenses." },
              { to: "/region/8", title: "REGION", desc: "In-depth 10-day risk profile, expected error ranges, and historical analog events." },
              { to: "/region/8?tab=why", title: "FORECAST DNA", desc: "SHAP waterfall attribution categorizing the physical factors driving bust risk." },
              { to: "/region/8?tab=evolution", title: "EVOLUTION", desc: "Stacked charts answering when the forecast changed and if the spread narrowed." },
              { to: "/replay", title: "TIME MACHINE", desc: "Three-act historical replay with day-by-day truth reveals and live score ticker." },
              { to: "/region/8?tab=verify", title: "VERIFY", desc: "Contingency verification against actual IMD observations with nwpeval scores." },
              { to: "/ledger", title: "TRUST LEDGER", desc: "Formal evaluation ledger auditing model gate criteria and reliability bins." },
              { to: "/ops", title: "OPERATIONS", desc: "Live runner for near-real-time discovery, fetch, inference, and audit trails." },
            ].map((w, idx) => (
              <Link 
                key={idx} 
                to={w.to} 
                className="group rounded-lg border border-border/80 bg-card p-4 hover:border-primary/60 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono font-semibold text-primary">
                    <span>{w.title}</span>
                    <ExternalLink className="size-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
                <div className="mt-3 text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                  Open screen →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 8. TECHNOLOGY STACK */}
      <section id="tech" className="py-20 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
              ENGINEERED FOR RIGOR
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight uppercase text-foreground">
              Technology Architecture
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Every library, database, and computation engine strictly matches the tested implementation code.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">DATA INGESTION</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECMWF IFS HRES (0.4°)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECMWF IFS ENS (50-mbr)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> WeatherBench 2 (GCS)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> IMD 0.25° Gridded Rain</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> xarray & netCDF4</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">SCIENCE & ML</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> LightGBM Quantile Heads</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Isotonic Calibration</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> SHAP TreeExplainer</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> xeofs EOF Error Memory</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> nwpeval & scores</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">SYSTEM & API</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> FastAPI & Uvicorn</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> DuckDB SQL Engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Apache Parquet Partitioning</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> SQLite State Store & Audit</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Docker & Docker Compose</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">FRONTEND & UI</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> React 18 & TypeScript</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> MapLibre GL v6</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECharts Visualization</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Tailwind CSS & Vanilla CSS</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> TanStack Query & Zustand</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 9. LIVE DEMO SECTION */}
      <section id="demo" className="py-24 border-b border-border/60 bg-card">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-mono text-primary font-semibold">
            READY FOR EVALUATION
          </div>

          <h2 className="text-4xl sm:text-5xl font-black tracking-tight uppercase text-foreground leading-tight">
            See The Forecast. <br />
            Understand The Trust.
          </h2>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Explore how Purva Netra tracks forecast uncertainty, explains changing confidence, and verifies outcomes for 36 Indian subdivisions.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button 
              asChild 
              size="lg" 
              className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-8 h-12 shadow-lg"
            >
              <Link to="/brief">
                LAUNCH PURVA NETRA
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>

            <Button 
              asChild 
              variant="outline" 
              size="lg" 
              className="border-border hover:bg-accent font-medium px-6 h-12"
            >
              <Link to="/replay">EXPLORE TIME MACHINE</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 10. FOOTER */}
      <footer className="py-12 bg-background text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border/50 pt-8">
          <div>
            <div className="font-bold text-foreground tracking-tight text-sm">PURVA NETRA</div>
            <p className="text-muted-foreground mt-0.5">Forecast Trust Intelligence · SIH 2026 PS 26079</p>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/brief" className="hover:text-foreground transition-colors">Console</Link>
            <Link to="/method" className="hover:text-foreground transition-colors">Method</Link>
            <a href="#tech" className="hover:text-foreground transition-colors">Technology</a>
            <a 
              href="https://github.com/gdhanushkumar07/Purva-Netra.git" 
              target="_blank" 
              rel="noreferrer" 
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              GitHub <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
