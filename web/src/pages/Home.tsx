import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  ArrowRight, ShieldCheck, Cpu, Database, Activity, 
  Layers, CheckCircle2, ExternalLink, MapPin, 
  Calendar, Info, RefreshCw, BarChart3, AlertTriangle
} from "lucide-react";
import { useHealth, useMatrix } from "@/api/client";
import { useInit, useResolvedTheme, pct, prettyName } from "@/lib/hooks";
import { pbustPalette, type Theme } from "@/theme/scales";
import { Button } from "@/components/ui/button";

export default function Home() {
  const theme = useResolvedTheme();
  const { init } = useInit();
  const h = useHealth();
  const m = useMatrix(init);

  const [activeSection, setActiveSection] = useState("hero");
  const [selectedDay, setSelectedDay] = useState(5);
  const [hoveredRegion, setHoveredRegion] = useState<{ name: string; p: number; conf: string; lead: number } | null>({
    name: "Vidarbha",
    p: 0.28,
    conf: "Low",
    lead: 5
  });

  // Dedicated section tracker for clean active pill
  useEffect(() => {
    const handleScroll = () => {
      const sections = ["hero", "problem", "how-it-works", "why", "workflow", "map-preview", "tech", "demo"];
      const scrollPos = window.scrollY + 200;
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

  // Concrete sample regions from actual July 2020 thin-slice
  const sampleRegions = [
    { rid: 8, name: "Vidarbha", p: 0.28, conf: "Low", dRain: "42 mm", reason: "Members disagree 4.1× normal spread", dInit: "12 UTC" },
    { rid: 7, name: "Saurashtra & Kutch", p: 0.30, conf: "Low", dRain: "56 mm", reason: "Forecast changed notably vs previous cycle", dInit: "12 UTC" },
    { rid: 2, name: "Gujarat Region", p: 0.22, conf: "Reduced", dRain: "35 mm", reason: "Elevated spread in coastal convection", dInit: "12 UTC" },
    { rid: 33, name: "Kerala", p: 0.04, conf: "High", dRain: "88 mm", reason: "High ensemble convergence & regime alignment", dInit: "12 UTC" },
  ];

  return (
    <div className="min-h-screen bg-[#fcfcfb] dark:bg-[#121211] text-foreground font-sans antialiased selection:bg-primary/20 selection:text-primary">
      
      {/* 1. REFINED EDITORIAL STICKY NAVBAR */}
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-[#fcfcfb]/90 dark:bg-[#121211]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Sub-tag */}
          <Link to="/" className="flex flex-col text-left group">
            <span className="font-black tracking-tight text-lg leading-none text-foreground">
              PURVA NETRA
            </span>
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mt-1">
              FORECAST TRUST INTELLIGENCE
            </span>
          </Link>

          {/* Section Pill Links */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full border border-border/70 bg-secondary/60 p-1 text-xs font-semibold text-muted-foreground">
            {[
              { id: "hero", label: "HOME" },
              { id: "problem", label: "PROBLEM" },
              { id: "how-it-works", label: "HOW IT WORKS" },
              { id: "why", label: "WHY PURVA NETRA" },
              { id: "workflow", label: "WORKFLOW" },
              { id: "map-preview", label: "MAP" },
              { id: "tech", label: "TECHNOLOGY" },
              { id: "demo", label: "LIVE DEMO" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeSection === item.id
                    ? "bg-card text-foreground font-bold shadow-xs border border-border/80"
                    : "hover:text-foreground hover:bg-card/40"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Right Action */}
          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold tracking-tight text-xs px-4 h-9 rounded-md shadow-xs"
            >
              <Link to="/brief" data-testid="landing-launch-btn">
                LAUNCH CONSOLE
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 2. HERO — EDITORIAL COMPOSITION */}
      <section id="hero" className="relative pt-16 pb-24 md:pt-24 md:pb-32 overflow-hidden border-b border-border/70">
        {/* Subtle grid texture */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" 
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            color: theme === "dark" ? "#ffffff0f" : "#0000000a"
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            
            {/* Left Side: Editorial Typography Hierarchy */}
            <div className="lg:col-span-6 space-y-8 text-left">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/80 px-3 py-1 text-xs font-mono font-medium text-foreground tracking-tight">
                <span className="size-2 rounded-full bg-primary" />
                <span>MEDIUM-RANGE WEATHER RISK INTELLIGENCE · PS 26079</span>
              </div>

              {/* Large Editorial Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.04] text-foreground uppercase">
                KNOW WHEN TO <br />
                <span className="text-foreground">TRUST</span> <br />
                <span className="text-primary tracking-normal">THE FORECAST.</span>
              </h1>

              {/* Concise Supporting Copy */}
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl font-normal">
                Purva Netra is a forecast-trust intelligence layer for medium-range weather prediction — 
                revealing when a forecast may fail, why confidence changes, and how it performs against observed rainfall.
              </p>

              {/* Primary & Secondary Action */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold tracking-tight px-7 h-12 shadow-sm text-sm"
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
                  className="border-border hover:bg-accent text-foreground font-semibold px-6 h-12 text-sm"
                >
                  <a href="#how-it-works">SEE HOW IT WORKS</a>
                </Button>
              </div>

              {/* Scientific Metadata Strip */}
              <div className="pt-6 border-t border-border/80 grid grid-cols-3 gap-4 text-left">
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground uppercase">ECMWF IFS</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">HRES + 50-MBR ENS</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground uppercase">TRUTH</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">IMD 0.25° GRIDDED RAIN</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground uppercase">COVERAGE</div>
                  <div className="text-xs font-semibold text-foreground mt-0.5">36 SUBDIVISIONS × D1–10</div>
                </div>
              </div>
            </div>

            {/* Right Side: Product Visual Panel — "Live Scientific Instrument" */}
            <div className="lg:col-span-6">
              <div className="relative rounded-xl border border-border bg-card shadow-2xl p-5 overflow-hidden transition-all duration-300">
                {/* Visual relationship indicator badge */}
                <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-border" />
                    <span className="font-mono text-xs font-bold tracking-wider text-foreground">
                      PURVA NETRA / FORECAST TRUST CONSOLE
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-muted/60 text-muted-foreground font-semibold">
                    PREVIEW · JULY 2020 THIN SLICE
                  </span>
                </div>

                {/* Instrument Layout */}
                <div className="space-y-4">
                  {/* Top Key Signals Strip */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-left">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase block">
                        CALIBRATED TRUST
                      </span>
                      <span className="text-lg font-mono font-black text-destructive">
                        P(BUST) 28%
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5 font-medium">
                        Low Confidence
                      </span>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-left">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase block">
                        HEAVY RAIN RISK
                      </span>
                      <span className="text-lg font-mono font-black text-foreground">
                        6 REGIONS ▲
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5 font-medium">
                        ≥ 64.5 mm / 24h
                      </span>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-left">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase block">
                        SPREAD ANOMALY
                      </span>
                      <span className="text-lg font-mono font-black text-primary">
                        4.1× NORMAL
                      </span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5 font-medium">
                        High Disagreement
                      </span>
                    </div>
                  </div>

                  {/* Main Subdivision Schematic View */}
                  <div className="rounded-lg border border-border/80 bg-background/50 p-4">
                    <div className="flex items-center justify-between text-xs font-mono border-b border-border/60 pb-2 mb-3">
                      <span className="font-semibold text-muted-foreground">
                        SUBDIVISION CHOROPLETH · DAY {selectedDay}
                      </span>
                      <span className="text-primary font-bold">
                        {hoveredRegion ? `${hoveredRegion.name} (${pct(hoveredRegion.p)} ${hoveredRegion.conf})` : "Hover Region"}
                      </span>
                    </div>

                    {/* Clean Scaled SVG India Map Schematic */}
                    <div className="h-48 flex items-center justify-center relative">
                      <svg viewBox="0 0 240 240" className="w-full h-full max-h-48 drop-shadow-xs" aria-label="India meteorological subdivisions forecast trust map">
                        {/* Northern Jammu & Kashmir */}
                        <path d="M 95 25 L 120 20 L 140 38 L 120 55 L 95 45 Z" fill={pal[1]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Jammu & Kashmir", p: 0.05, conf: "High", lead: selectedDay })} />
                        {/* Western Rajasthan */}
                        <path d="M 60 70 L 95 65 L 105 105 L 55 110 Z" fill={pal[6]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "West Rajasthan", p: 0.34, conf: "Low", lead: selectedDay })} />
                        {/* Gujarat & Saurashtra */}
                        <path d="M 45 115 L 75 112 L 80 145 L 40 140 Z" fill={pal[5]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Saurashtra & Kutch", p: 0.30, conf: "Low", lead: selectedDay })} />
                        {/* Central MP */}
                        <path d="M 98 75 L 145 78 L 140 120 L 90 115 Z" fill={pal[3]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Madhya Pradesh", p: 0.11, conf: "Normal", lead: selectedDay })} />
                        {/* Vidarbha & Maharashtra */}
                        <path d="M 85 130 L 135 125 L 130 160 L 75 155 Z" fill={pal[6]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Vidarbha", p: 0.28, conf: "Low", lead: selectedDay })} />
                        {/* East & Odisha */}
                        <path d="M 142 95 L 180 100 L 175 140 L 138 135 Z" fill={pal[4]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Odisha", p: 0.18, conf: "Reduced", lead: selectedDay })} />
                        {/* North East Assam */}
                        <path d="M 185 65 L 225 60 L 220 90 L 180 92 Z" fill={pal[2]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Assam & Meghalaya", p: 0.08, conf: "Normal", lead: selectedDay })} />
                        {/* Southern Peninsula */}
                        <path d="M 88 165 L 125 162 L 115 210 L 80 185 Z" fill={pal[0]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Kerala", p: 0.04, conf: "High", lead: selectedDay })} />
                        {/* Tamil Nadu */}
                        <path d="M 115 170 L 140 172 L 125 215 L 110 212 Z" fill={pal[1]} stroke="currentColor" strokeWidth="0.8" className="text-border hover:opacity-80 transition-opacity cursor-pointer" onMouseEnter={() => setHoveredRegion({ name: "Tamil Nadu", p: 0.05, conf: "High", lead: selectedDay })} />
                      </svg>
                    </div>

                    {/* Compact Scale Legend */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-xs bg-[#256abf]" /> High Trust (&lt; 6%)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-xs bg-[#f0efec] border border-border" /> 10% Base Rate
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-xs bg-[#9c2723]" /> High Bust Risk (&gt; 25%)
                      </span>
                    </div>
                  </div>

                  {/* Day 1–10 Timeline Scrubber */}
                  <div className="pt-2 border-t border-border/80">
                    <div className="flex items-center justify-between text-xs font-mono mb-2">
                      <span className="text-muted-foreground font-semibold">LEAD DAY TIMELINE</span>
                      <span className="text-foreground font-bold">D1 → D10</span>
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedDay(d)}
                          className={`rounded py-1.5 text-xs font-mono transition-all ${
                            selectedDay === d
                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                              : "border border-border/60 bg-muted/40 hover:bg-muted text-foreground"
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

      {/* 3. SCIENTIFIC SPECIFICATION TRANSITION STRIP */}
      <section className="border-b border-border/80 bg-card py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-left divide-y md:divide-y-0 md:divide-x divide-border/70">
            <div className="pt-4 md:pt-0">
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-foreground">36</div>
              <div className="mt-2 text-xs font-mono font-bold tracking-wider uppercase text-muted-foreground">IMD SUBDIVISIONS</div>
              <p className="text-xs text-muted-foreground mt-1">Full polygon masks covering peninsular & continental India</p>
            </div>
            <div className="pt-4 md:pt-0 md:pl-8">
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-foreground">10</div>
              <div className="mt-2 text-xs font-mono font-bold tracking-wider uppercase text-muted-foreground">FORECAST DAYS</div>
              <p className="text-xs text-muted-foreground mt-1">24-hour windows evaluated sequentially from Day 1 to Day 10</p>
            </div>
            <div className="pt-4 md:pt-0 md:pl-8">
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-foreground">50</div>
              <div className="mt-2 text-xs font-mono font-bold tracking-wider uppercase text-muted-foreground">ENSEMBLE MEMBERS</div>
              <p className="text-xs text-muted-foreground mt-1">Perturbed ECMWF IFS trajectories capturing physical divergence</p>
            </div>
            <div className="pt-4 md:pt-0 md:pl-8">
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-primary">P(BUST)</div>
              <div className="mt-2 text-xs font-mono font-bold tracking-wider uppercase text-muted-foreground">FORECAST TRUST SIGNAL</div>
              <p className="text-xs text-muted-foreground mt-1">Calibrated failure likelihood when error exceeds 20 mm / 2×</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. EDITORIAL PROBLEM STATEMENT */}
      <section id="problem" className="py-24 border-b border-border/70 bg-[#fcfcfb] dark:bg-[#121211]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl space-y-6 text-left">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              THE FUNDAMENTAL LIMITATION
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground leading-[1.08]">
              A FORECAST TELLS YOU WHAT MAY HAPPEN. <br />
              <span className="text-muted-foreground">BUT NOT HOW MUCH TO TRUST IT.</span>
            </h2>

            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl font-normal">
              Numerical weather models issue deterministic rainfall predictions. Yet disaster management officials, reservoir operators, and district collectors cannot answer from point forecasts alone: <em>Is this prediction robust or fragile?</em>
            </p>
          </div>

          {/* Editorial Question Cards */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
            {[
              {
                num: "01",
                q: "HOW UNCERTAIN IS IT?",
                detail: "Are the 50 ensemble members clustered around the deterministic run, or does severe spread anomaly indicate atmospheric chaos?"
              },
              {
                num: "02",
                q: "HOW UNUSUAL IS THE REGIME?",
                detail: "Is the current monsoon synoptic state an analog to historical cases where numerical models systematically underpredicted rain?"
              },
              {
                num: "03",
                q: "HAS THE FORECAST CHANGED?",
                detail: "Did the forecast jump or flip-flop across successive cycles, signaling numerical instability before the storm arrives?"
              },
              {
                num: "04",
                q: "HOW MUCH CAN BE TRUSTED?",
                detail: "What is the empirical probability that this specific forecast will bust by more than 20 mm or 2x the predicted volume?"
              }
            ].map((item) => (
              <div key={item.num} className="border-t-2 border-border pt-4 space-y-2">
                <span className="font-mono text-xs font-bold text-primary">{item.num}</span>
                <h3 className="text-sm font-bold tracking-tight text-foreground">{item.q}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>

          {/* Clean Horizontal Progression */}
          <div className="mt-16 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono font-bold text-center">
              <div className="rounded-md border border-border px-4 py-2 bg-secondary/50">RAW FORECAST</div>
              <span className="text-muted-foreground">→</span>
              <div className="rounded-md border border-border px-4 py-2 bg-secondary/50">ENSEMBLE UNCERTAINTY</div>
              <span className="text-muted-foreground">→</span>
              <div className="rounded-md border border-primary/40 bg-primary/10 text-primary px-4 py-2 font-black">
                P(BUST) RISK CALIBRATION
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="rounded-md border border-border px-4 py-2 bg-secondary/50">OPERATIONAL TRUST</div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS — SCIENTIFIC PIPELINE */}
      <section id="how-it-works" className="py-24 border-b border-border/70 bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3 text-left">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              METHODOLOGY & PIPELINE
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground">
              How Purva Netra Works
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              A scientific pipeline converting high-dimensional weather grids into regional, calibrated trust signals with strict leakage guards.
            </p>
          </div>

          {/* Large Connected Scientific Pipeline */}
          <div className="mt-16 relative">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {/* Step 1 */}
              <div className="rounded-xl border border-border bg-background p-6 space-y-3 relative shadow-xs">
                <div className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                  <span>STAGE 01</span>
                  <Database className="size-4" />
                </div>
                <h3 className="font-bold text-base text-foreground">ECMWF HRES + ENS + IMD TRUTH</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Extracts 0.4° deterministic HRES alongside 50-member 1.5° ENS precipitation from WeatherBench 2, matching against gridded 0.25° IMD daily rainfall observations.
                </p>
                <div className="pt-2 text-[10px] font-mono text-muted-foreground border-t border-border/40">
                  Data: WeatherBench 2 · IMD Pune 0.25°
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-xl border border-border bg-background p-6 space-y-3 relative shadow-xs">
                <div className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                  <span>STAGE 02</span>
                  <Layers className="size-4" />
                </div>
                <h3 className="font-bold text-base text-foreground">FEATURE EXTRACTION & SPREAD</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Aggregates rainfall across 36 subdivision polygonal masks. Computes ensemble spread anomalies, 12-hour revision vectors, and Flip-Flop Index (FFI) metrics.
                </p>
                <div className="pt-2 text-[10px] font-mono text-muted-foreground border-t border-border/40">
                  Features: Spread Anomaly · Revision · FFI
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-xl border border-border bg-background p-6 space-y-3 relative shadow-xs">
                <div className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                  <span>STAGE 03</span>
                  <Cpu className="size-4" />
                </div>
                <h3 className="font-bold text-base text-foreground">BUST DETECTION & CALIBRATION</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Labels busts where |F - O| &gt; 20 mm and 2× max(F, O). Trains LightGBM with isotonic calibration heads using Leave-One-Year-Out cross-validation.
                </p>
                <div className="pt-2 text-[10px] font-mono text-muted-foreground border-t border-border/40">
                  Model: LightGBM + Isotonic Calibration
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              {/* Step 4 */}
              <div className="rounded-xl border border-border bg-background p-6 space-y-3 relative shadow-xs">
                <div className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                  <span>STAGE 04</span>
                  <Activity className="size-4" />
                </div>
                <h3 className="font-bold text-base text-foreground">EXPLANATION (FORECAST DNA)</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Decomposes bust risk into physical evidence groups via SHAP TreeExplainer (spread, revision, analogs, novelty, regime, state) with historical analog matching.
                </p>
                <div className="pt-2 text-[10px] font-mono text-muted-foreground border-t border-border/40">
                  Explainability: SHAP TreeExplainer · xeofs EOF Analogs
                </div>
              </div>

              {/* Step 5 */}
              <div className="rounded-xl border border-border bg-background p-6 space-y-3 relative shadow-xs">
                <div className="font-mono text-xs font-bold text-primary flex items-center justify-between">
                  <span>STAGE 05</span>
                  <ShieldCheck className="size-4" />
                </div>
                <h3 className="font-bold text-base text-foreground">VERIFICATION & TRUST LEDGER</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Evaluates contingency scores (POD, FAR, CSI, ETS) and reliability diagrams against observed truth. Freezes models in the immutable Trust Ledger before release.
                </p>
                <div className="pt-2 text-[10px] font-mono text-muted-foreground border-t border-border/40">
                  Verification: nwpeval · scores · Brier Score
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. WHY PURVA NETRA — EDITORIAL FOUR PILLARS */}
      <section id="why" className="py-24 border-b border-border/70 bg-[#fcfcfb] dark:bg-[#121211]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3 text-left">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              CORE CAPABILITIES
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground">
              Why Purva Netra
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Designed specifically for operational meteorologists, water managers, and disaster preparedness coordinators.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            <div className="rounded-xl border border-border bg-card p-8 space-y-4 hover:border-primary/50 transition-colors">
              <span className="font-mono text-xs font-bold text-primary">01</span>
              <h3 className="text-xl font-bold tracking-tight text-foreground">FORECAST TRUST</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Know exactly where and when numerical weather prediction reliability drops across Day 1 to Day 10 leads, classified into four explicit confidence tiers: High, Normal, Reduced, and Low.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 space-y-4 hover:border-primary/50 transition-colors">
              <span className="font-mono text-xs font-bold text-primary">02</span>
              <h3 className="text-xl font-bold tracking-tight text-foreground">ENSEMBLE EVIDENCE</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                See physical disagreement across all 50 ensemble members normalized as spread anomaly against seasonal climatology, catching localized convective breakdowns before deterministic runs notice.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 space-y-4 hover:border-primary/50 transition-colors">
              <span className="font-mono text-xs font-bold text-primary">03</span>
              <h3 className="text-xl font-bold tracking-tight text-foreground">FORECAST EVOLUTION</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Understand when and why confidence changed across successive 12-hour forecast cycles, tracing run-to-run consistency and sudden jumps using stacked evolution timelines.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 space-y-4 hover:border-primary/50 transition-colors">
              <span className="font-mono text-xs font-bold text-primary">04</span>
              <h3 className="text-xl font-bold tracking-tight text-foreground">VERIFICATION AGAINST TRUTH</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transparent verification against actual IMD gridded observation rainfall. Evaluates Probability of Detection (POD) and Critical Success Index (CSI) for heavy rainfall (&ge; 64.5 mm).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. DEDICATED MAP SECTION */}
      <section id="map-preview" className="py-24 border-b border-border/70 bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-5 space-y-6 text-left">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
                SPATIAL TRUST INTELLIGENCE
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground leading-[1.08]">
                SEE WHERE <br />
                <span className="text-primary">TRUST BREAKS DOWN.</span>
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed font-normal">
                An interactive MapLibre GL map of all 36 Indian meteorological subdivisions. Switch effortlessly between Forecast Rainfall and Calibrated P(Bust) to pinpoint regional risks in sub-100 milliseconds.
              </p>
              
              <div className="pt-2">
                <Button 
                  asChild 
                  size="lg" 
                  className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold tracking-tight px-6 h-11 text-sm shadow-xs"
                >
                  <Link to="/map?day=5&layer=pbust">
                    EXPLORE THE MAP
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Map Preview Graphic */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border bg-background p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between text-xs font-mono border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">IMD SUBDIVISIONS CHOROPLETH</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-primary font-semibold">DAY 5 LEAD</span>
                  </div>
                  <span className="text-muted-foreground">SPLIT VIEW: RAIN | P(BUST)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-64">
                  {/* Left panel: Forecast Rain */}
                  <div className="rounded-lg border border-border/70 bg-card p-3 flex flex-col justify-between">
                    <div className="text-[10px] font-mono text-muted-foreground flex justify-between">
                      <span>FORECAST RAINFALL</span>
                      <span className="text-foreground font-semibold">mm / 24h</span>
                    </div>
                    <div className="h-44 flex items-center justify-center">
                      <svg viewBox="0 0 160 160" className="h-full w-full opacity-90">
                        <circle cx="80" cy="80" r="50" fill="none" stroke="#256abf" strokeWidth="1.5" strokeDasharray="3 3" />
                        <path d="M 60 50 L 100 45 L 110 85 L 65 95 Z" fill="#6da7ec" />
                        <path d="M 65 95 L 110 85 L 100 130 L 60 115 Z" fill="#256abf" />
                      </svg>
                    </div>
                    <div className="text-[10px] font-mono text-center text-muted-foreground">
                      Sequential Blue Scale (1 → 65 mm)
                    </div>
                  </div>

                  {/* Right panel: P(Bust) Risk */}
                  <div className="rounded-lg border border-border/70 bg-card p-3 flex flex-col justify-between">
                    <div className="text-[10px] font-mono text-muted-foreground flex justify-between">
                      <span>CALIBRATED P(BUST)</span>
                      <span className="text-destructive font-semibold">Risk Divergence</span>
                    </div>
                    <div className="h-44 flex items-center justify-center">
                      <svg viewBox="0 0 160 160" className="h-full w-full opacity-90">
                        <circle cx="80" cy="80" r="50" fill="none" stroke="#b8322f" strokeWidth="1.5" strokeDasharray="3 3" />
                        <path d="M 60 50 L 100 45 L 110 85 L 65 95 Z" fill="#eb8a75" />
                        <path d="M 65 95 L 110 85 L 100 130 L 60 115 Z" fill="#9c2723" />
                      </svg>
                    </div>
                    <div className="text-[10px] font-mono text-center text-muted-foreground">
                      Diverging Trust Palette (&lt; 3% → &gt; 35%)
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 8. PRODUCT WORKFLOW SEQUENCE */}
      <section id="workflow" className="py-24 border-b border-border/70 bg-[#fcfcfb] dark:bg-[#121211]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3 text-left">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              END-TO-END CONSOLE EXPERIENCE
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground">
              A Complete Operational System
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Every workflow step is fully implemented and accessible in the Purva Netra console.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {[
              { to: "/brief", title: "BRIEFING", desc: "Top-line situational summary: low-confidence subdivisions, heavy-rain alerts, and most uncertain lead day." },
              { to: "/matrix", title: "MATRIX", desc: "36 subdivisions × 10 lead days reliability grid with keyboard arrow navigation and sorting by zone or risk." },
              { to: "/map", title: "MAP VIEW", desc: "Interactive choropleth with synchronized dual-split view and P(Bust), Forecast Rain, and Spread lenses." },
              { to: "/region/8", title: "REGION DETAIL", desc: "10-day subdivision forecast risk timeline, expected error bounds (q50/q90), and historical analog events." },
              { to: "/region/8?tab=why", title: "FORECAST DNA", desc: "SHAP waterfall attribution identifying exact physical contributors: spread anomaly, revision, or novelty." },
              { to: "/replay", title: "TIME MACHINE", desc: "Three-act historical replay with day-by-day truth reveals and automated Brier score ticker against B2 spread baseline." },
            ].map((w, idx) => (
              <Link 
                key={idx} 
                to={w.to} 
                className="group rounded-xl border border-border bg-card p-6 hover:border-primary/60 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-primary">
                    <span>{w.title}</span>
                    <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
                <div className="mt-4 text-[11px] font-mono font-semibold text-foreground group-hover:text-primary transition-colors">
                  Open in Console →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 9. TECHNOLOGY STACK */}
      <section id="tech" className="py-24 border-b border-border/70 bg-card">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-3 text-left">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-primary">
              SCIENTIFIC & SYSTEM ARCHITECTURE
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase text-foreground">
              Technology Stack
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Built on production-grade scientific computing and operational web standards.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="rounded-xl border border-border bg-background p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">DATA INGESTION</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECMWF IFS HRES (0.4°)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECMWF IFS ENS (50 members)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> WeatherBench 2 (GCS)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> IMD 0.25° Gridded Rain</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> xarray & netCDF4</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">SCIENCE & ML</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> LightGBM Quantile Heads</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Isotonic Calibration</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> SHAP TreeExplainer</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> xeofs EOF Error Memory</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> nwpeval & scores</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">SYSTEM & API</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> FastAPI & Uvicorn</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> DuckDB SQL Engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Apache Parquet Partitioning</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> SQLite State Store & Audit</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Docker Containerized</li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-6 space-y-4">
              <div className="font-mono text-xs font-bold text-primary uppercase">FRONTEND & UI</div>
              <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> React 18 & TypeScript</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> MapLibre GL v6</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> ECharts Visualization</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> Tailwind CSS</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-primary" /> TanStack Query & Zustand</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 10. LIVE DEMO SECTION — STRONG CONTRAST */}
      <section id="demo" className="py-28 border-b border-border/80 bg-[#161615] text-[#fcfcfb] relative overflow-hidden">
        {/* Dark subtle grid */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" 
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            color: "#ffffff"
          }}
        />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/20 px-3.5 py-1 text-xs font-mono text-primary font-bold">
            OPERATIONAL VERIFICATION READY
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight uppercase leading-[1.05]">
            SEE THE FORECAST. <br />
            <span className="text-primary">UNDERSTAND THE TRUST.</span>
          </h2>

          <p className="text-base sm:text-lg text-[#a1a19a] max-w-2xl mx-auto leading-relaxed font-normal">
            Follow a forecast from its initial prediction through uncertainty, revision, and verification across 36 meteorological subdivisions.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Button 
              asChild 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-tight px-8 h-12 text-sm shadow-xl"
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
              className="border-[#383835] bg-transparent text-[#fcfcfb] hover:bg-[#252524] font-semibold px-7 h-12 text-sm"
            >
              <Link to="/replay">EXPLORE LIVE DEMO</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 11. FOOTER */}
      <footer className="py-12 bg-[#fcfcfb] dark:bg-[#121211] text-xs text-muted-foreground border-t border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-left">
            <div className="font-extrabold text-foreground tracking-tight text-sm">PURVA NETRA</div>
            <p className="text-muted-foreground mt-0.5">FORECAST TRUST INTELLIGENCE · SIH 2026 PS 26079</p>
          </div>

          <div className="flex items-center gap-6 font-medium">
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
