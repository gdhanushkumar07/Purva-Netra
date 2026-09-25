import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Moon, Sun, Monitor, Search, Compass, Menu, Settings2, LogIn, LogOut, User } from "lucide-react";
import { useHealth, useRegions, useMe, canOperate, post, sendHeartbeat } from "@/api/client";
import { useInit, fmtInit, prettyName } from "@/lib/hooks";
import { useSettings, useView } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { startTour } from "@/tour/demoTour";
import { cn } from "@/lib/utils";

const NAV = ["brief", "matrix", "map", "replay", "compare", "ledger", "watchlist", "method", "settings"] as const;

export function fmtAge(h?: number | null) {
  if (h == null) return "–";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${Math.round(h / 24)} d`;
}
export function fmtUtc(s?: string | null) {
  if (!s) return "never";
  const d = new Date(s.endsWith("Z") ? s : s + "Z");
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** Mode badge: REPLAY or NEAR-REAL-TIME, never mixed; NRT shows data age + last successful update;
 *  the pulsing dot appears only when NRT data is fresh (< 18 h). */
export function ModeBadge() {
  const { t } = useTranslation();
  const h = useHealth();
  const d = h.data;
  const live = d?.mode === "NEAR-REAL-TIME";
  const fresh = live && d?.freshness === "fresh";
  const dot = !live ? null : fresh ? "#0ca30c" : d?.freshness === "stale" ? "#fab219" : "#d03b3b";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="mode-badge-wrap" data-tour="mode"
          className={cn("flex items-center gap-2 rounded border px-2 py-0.5 text-xs",
            live ? "border-[#0ca30c]/60" : "border-[#fab219] bg-[#fab219]/15")}>
          {live && <span aria-hidden className={cn("inline-block size-2 rounded-full", fresh && "pulse-dot")} style={{ background: dot!, color: dot! }} />}
          <span data-testid="mode-badge" className="font-bold tracking-wide">{live ? t("shell.mode_nrt") : t("shell.mode_replay")}</span>
          {live ? (
            <span className="tnum text-muted-foreground" data-testid="data-age">
              age {fmtAge(d?.data_age_h)} · updated {fmtUtc(d?.last_update)}
              {d?.source === "mock" && <strong className="ml-1 text-[#9c2723] dark:text-[#f29a8a]">· MOCK UPSTREAM</strong>}
            </span>
          ) : (
            <span className="tnum hidden text-muted-foreground sm:inline" data-testid="data-age">historical · built {fmtUtc(d?.last_update)}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        {live
          ? `Near-real-time: latest published cycle ${d?.last_cycle ?? "–"}; data age = now − init. Upstream ${d?.upstream?.status ?? "unknown"} (checked ${fmtUtc(d?.upstream?.checked_at)}).`
          : t("shell.mode_replay_help")}
      </TooltipContent>
    </Tooltip>
  );
}

/** Issue (a): the label states what the shipped model actually is. */
export function modelLabel(h?: ReturnType<typeof useHealth>["data"]) {
  if (!h) return { short: "–", long: "" };
  const b = h.model_bundle;
  if (h.model_kind === "placeholder") {
    return {
      short: "PLACEHOLDER · B2 fitted Jul 2020 (in-sample)",
      long: `${b?.version ?? h.model_version}: ${b?.note ?? ""} Spec target: train ${b?.spec_training_period ?? "2018–2020"}, calibrate ${b?.spec_calibration_period ?? "2021"} — not trained yet (2018–2022 archive not extracted).`,
    };
  }
  return {
    short: `IFS · train ${b?.training_period ?? "?"} · calib ${b?.calibration_period ?? "?"}`,
    long: `${b?.version ?? h.model_version} — forecast model ${b?.forecast_model ?? "ECMWF IFS"}`,
  };
}

function ModelBadge() {
  const h = useHealth();
  const m = modelLabel(h.data);
  const placeholder = h.data?.model_kind === "placeholder";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-testid="model-badge" className="hidden max-w-56 truncate rounded border px-2 py-0.5 text-xs lg:inline">
          {placeholder ? <><span className="font-semibold text-[#9c2723] dark:text-[#f29a8a]">PLACEHOLDER</span> · B2 fitted Jul 2020 (in-sample)</> : m.short}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-96">{m.long}</TooltipContent>
    </Tooltip>
  );
}

function CyclePicker() {
  const { t } = useTranslation();
  const { init, cycles, prev, next, setInit } = useInit();
  return (
    <div className="flex items-center gap-1" data-tour="cycle">
      <Button size="icon" variant="ghost" aria-label="Previous cycle" disabled={!prev} onClick={() => prev && setInit(prev)}><ChevronLeft className="size-4" /></Button>
      <label className="sr-only" htmlFor="cycle-select">{t("shell.cycle")}</label>
      <select id="cycle-select" className="tnum h-8 rounded-md border bg-card px-2 text-sm" value={init ?? ""} onChange={(e) => setInit(e.target.value)}>
        {cycles.map((c) => <option key={c} value={c}>{t("shell.init")} {fmtInit(c)}</option>)}
      </select>
      <Button size="icon" variant="ghost" aria-label="Next cycle" disabled={!next} onClick={() => next && setInit(next)}><ChevronRight className="size-4" /></Button>
    </div>
  );
}

/** NRT data-quality banner: amber when stale (18–36 h), red when old (> 36 h), unreachable, or nothing published. */
function StaleBanner() {
  const h = useHealth().data;
  if (!h || h.mode !== "NEAR-REAL-TIME") return null;
  const unreachable = h.upstream?.status === "unreachable";
  const none = !h.last_cycle;
  if (h.freshness === "fresh" && !unreachable) return null;
  const red = none || h.freshness === "old";
  const msg = none ? "No NRT cycle has been published yet."
    : `Data is ${h.freshness}: latest cycle ${fmtInit(h.last_cycle ?? undefined)} is ${fmtAge(h.data_age_h)} old.`;
  return (
    <div role="alert" data-testid="stale-banner"
      className={cn("no-print flex items-center gap-2 px-4 py-1.5 text-sm", red ? "bg-[#d03b3b]/15" : "bg-[#fab219]/20")}>
      <span aria-hidden>{red ? "◆" : "▲"}</span>
      <span>{msg}{unreachable && ` Upstream unreachable (last checked ${fmtUtc(h.upstream?.checked_at)}).`}</span>
    </div>
  );
}

/** NRT: announce new cycles. Following "latest" (no ?init) → switch + toast; pinned cycle → toast with Switch. */
function NewCycleWatcher() {
  const h = useHealth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const seen = useRef<string | null>(null);
  const last = h.data?.mode === "NEAR-REAL-TIME" ? h.data.last_cycle : null;
  useEffect(() => {
    if (!last) return;
    if (seen.current && seen.current !== last) {
      const iso = last.replace(" ", "T").slice(0, 16);
      const label = `New cycle ${fmtInit(iso)} available`;
      const pinned = new URLSearchParams(loc.search).has("init");
      void qc.invalidateQueries({ queryKey: ["cycles"] });
      if (pinned) {
        toast(label, { duration: Infinity, action: { label: "Switch", onClick: () => {
          const p = new URLSearchParams(window.location.search); p.set("init", iso);
          nav(`${window.location.pathname}?${p}`);
        } } });
      } else {
        toast(`${label} — now showing`, { duration: 8000 });
      }
    }
    seen.current = last;
  }, [last, loc.search, nav, qc]);
  return null;
}

function UserMenu() {
  const me = useMe().data;
  const qc = useQueryClient();
  const nav = useNavigate();
  if (!me || me.anonymous)
    return <Button size="sm" variant="ghost" asChild><Link to="/login" data-testid="sign-in"><LogIn className="size-4" aria-hidden /><span className="hidden lg:inline">Sign in</span></Link></Button>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" data-testid="user-menu"><User className="size-4" aria-hidden /><span className="hidden lg:inline">{me.username}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{me.username} · {me.role}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canOperate(me) && <DropdownMenuItem onSelect={() => nav("/ops")}><Settings2 className="size-4" />Operations</DropdownMenuItem>}
        <DropdownMenuItem onSelect={async () => { await post("/auth/logout", {}); await qc.invalidateQueries(); nav("/brief"); }}>
          <LogOut className="size-4" />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  const regions = useRegions();
  const { params } = useView();
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  const go = (to: string) => { setOpen(false); nav(to); };
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t("shell.search")} description="Regions, days and screens">
      <CommandInput placeholder="e.g. Telangana day 5, replay, ledger…" />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        <CommandGroup heading="Screens">
          {NAV.map((n) => <CommandItem key={n} onSelect={() => go(`/${n}?${keep({})}`)}>{t(`nav.${n}`)}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Regions">
          {(regions.data ?? []).flatMap((r) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <CommandItem key={`${r.rid}-${d}`} value={`${r.name} day ${d}`} onSelect={() => go(`/region/${r.rid}?${keep({ day: String(d), tab: "overview" })}`)}>
              {prettyName(r.name)} · Day {d}
            </CommandItem>
          )))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const s = useSettings();
  const loc = useLocation();
  const { params } = useView();
  const me = useMe().data;
  const [cmd, setCmd] = useState(false);
  const [menu, setMenu] = useState(false);
  const hdr = useRef<HTMLElement>(null);
  useEffect(() => {                        // expose the real header height so full-height screens fit exactly
    const el = hdr.current; if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--hdr", `${el.offsetHeight}px`));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); } };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => { void i18n.changeLanguage(s.lang); document.documentElement.lang = s.lang; }, [s.lang, i18n]);
  useEffect(() => { void sendHeartbeat(); const id = setInterval(sendHeartbeat, 120_000); return () => clearInterval(id); }, []);

  const carry = new URLSearchParams();
  for (const k of ["init", "day"]) { const v = params.get(k); if (v) carry.set(k, v); }
  const qs = carry.toString() ? `?${carry}` : "";
  const ThemeIcon = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : Monitor;
  const nextTheme = s.theme === "system" ? "light" : s.theme === "light" ? "dark" : "system";
  const bare = loc.pathname === "/login";

  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2">Skip to content</a>
      <header ref={hdr} className="no-print sticky top-0 z-40 flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-card/95 px-2 py-1 backdrop-blur">
        <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Menu" onClick={() => setMenu(!menu)}><Menu className="size-4" /></Button>
        <NavLink to={`/brief${qs}`} className="flex items-baseline gap-2 pr-2">
          <span className="font-bold tracking-tight">{t("app.name")}</span>
          <span className="hidden text-xs text-muted-foreground 2xl:inline">{t("app.console")}</span>
        </NavLink>
        <ModeBadge />
        <CyclePicker />
        <ModelBadge />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCmd(true)} aria-label={t("shell.search")}>
            <Search className="size-4" aria-hidden /><kbd className="hidden rounded border px-1 text-[10px] lg:inline">Ctrl K</kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => startTour()} aria-label={t("shell.tour")} data-testid="tour-btn"><Compass className="size-4" aria-hidden /></Button>
          <Button size="sm" variant="ghost" aria-label={`${t("shell.language")}: ${s.lang === "en" ? "English" : "हिन्दी"}`} onClick={() => s.set({ lang: s.lang === "en" ? "hi" : "en" })}>{s.lang === "en" ? "हि" : "EN"}</Button>
          <Button size="icon" variant="ghost" aria-label={`${t("shell.theme")}: ${s.theme}`} onClick={() => s.set({ theme: nextTheme })}><ThemeIcon className="size-4" /></Button>
          <UserMenu />
        </div>
      </header>
      <StaleBanner />
      <NewCycleWatcher />
      <div className="flex min-h-0 flex-1">
        {!bare && (
          <nav aria-label="Main" className={cn("no-print w-40 shrink-0 border-r bg-sidebar p-1 lg:block", menu ? "fixed inset-y-10 z-30 block" : "hidden")}>
            <ul>
              {NAV.map((n) => (
                <li key={n}>
                  <NavLink to={`/${n}${qs}`} onClick={() => setMenu(false)} data-tour={`nav-${n}`}
                    className={({ isActive }) => cn("block rounded px-3 py-1.5 text-sm hover:bg-sidebar-accent",
                      (isActive || (n === "matrix" && loc.pathname.startsWith("/region"))) && "bg-sidebar-accent font-semibold")}>
                    {t(`nav.${n}`)}
                  </NavLink>
                </li>
              ))}
              {canOperate(me) && (
                <li className="mt-1 border-t pt-1">
                  <NavLink to="/ops" data-testid="nav-ops" onClick={() => setMenu(false)}
                    className={({ isActive }) => cn("flex items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-sidebar-accent", isActive && "bg-sidebar-accent font-semibold")}>
                    <Settings2 className="size-4" aria-hidden />{t("nav.ops")}
                  </NavLink>
                </li>
              )}
            </ul>
            <p className="mt-4 px-3 text-xs text-muted-foreground">{t("app.tagline")}</p>
          </nav>
        )}
        <main id="main" className="min-w-0 flex-1 p-2 md:p-3">{children}</main>
      </div>
      <CommandPalette open={cmd} setOpen={setCmd} />
    </div>
  );
}
