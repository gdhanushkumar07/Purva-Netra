import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Moon, Sun, Monitor, Search, Compass, Menu } from "lucide-react";
import { useHealth, useRegions } from "@/api/client";
import { useInit, fmtInit, prettyName } from "@/lib/hooks";
import { useSettings, useView } from "@/store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { startTour } from "@/tour/demoTour";
import { cn } from "@/lib/utils";

const NAV = ["brief", "matrix", "map", "replay", "compare", "ledger", "watchlist", "method", "settings"] as const;

export function ModeBadge() {
  const { t } = useTranslation();
  const h = useHealth();
  const mode = h.data?.mode ?? "REPLAY";
  const live = mode === "NEAR-REAL-TIME";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="mode-badge"
          data-tour="mode"
          tabIndex={0}
          className={cn(
            "rounded border px-2 py-0.5 text-xs font-bold tracking-wide",
            live ? "border-[#0ca30c] text-[#006300] dark:text-[#0ca30c]" : "border-[#fab219] bg-[#fab219]/15",
          )}
        >
          {live ? t("shell.mode_nrt") : t("shell.mode_replay")}
        </span>
      </TooltipTrigger>
      <TooltipContent>{live ? "" : t("shell.mode_replay_help")}</TooltipContent>
    </Tooltip>
  );
}

function FreshnessDot() {
  const { t } = useTranslation();
  const h = useHealth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const ok = online && h.isSuccess;
  const label = ok ? t("shell.fresh") : t("shell.offline");
  return (
    <span className="flex items-center gap-1 text-xs" role="status" aria-label={label} title={label}>
      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: ok ? "#0ca30c" : "#fab219" }} />
      {!ok && <span>offline</span>}
    </span>
  );
}

function CyclePicker() {
  const { t } = useTranslation();
  const { init, cycles, prev, next, setInit } = useInit();
  return (
    <div className="flex items-center gap-1" data-tour="cycle">
      <Button size="icon" variant="ghost" aria-label="Previous cycle" disabled={!prev} onClick={() => prev && setInit(prev)}>
        <ChevronLeft className="size-4" />
      </Button>
      <label className="sr-only" htmlFor="cycle-select">{t("shell.cycle")}</label>
      <select
        id="cycle-select"
        className="tnum h-8 rounded-md border bg-card px-2 text-sm"
        value={init ?? ""}
        onChange={(e) => setInit(e.target.value)}
      >
        {cycles.map((c) => <option key={c} value={c}>{t("shell.init")} {fmtInit(c)}</option>)}
      </select>
      <Button size="icon" variant="ghost" aria-label="Next cycle" disabled={!next} onClick={() => next && setInit(next)}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function ModelBadge() {
  const h = useHealth();
  const { t } = useTranslation();
  const v = h.data?.model_version ?? "–";
  const placeholder = v.startsWith("thinslice");
  const yrs = h.data?.model_meta?.threshold_meta?.years;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="hidden rounded border px-2 py-0.5 text-xs md:inline" data-testid="model-badge">
          ECMWF IFS · {yrs ? `trained ${yrs[0]}–${yrs[yrs.length - 1]}` : v}
          {placeholder && <span className="ml-1 font-semibold text-[#9c2723] dark:text-[#f29a8a]">· PLACEHOLDER</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{v}{placeholder ? ` — ${t("shell.placeholder_model")}` : ""}</TooltipContent>
    </Tooltip>
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
          {(regions.data ?? []).flatMap((r) =>
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
              <CommandItem key={`${r.rid}-${d}`} value={`${r.name} day ${d}`} onSelect={() => go(`/region/${r.rid}?${keep({ day: String(d), tab: "overview" })}`)}>
                {prettyName(r.name)} · Day {d}
              </CommandItem>
            )),
          )}
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
  const [cmd, setCmd] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  useEffect(() => { void i18n.changeLanguage(s.lang); document.documentElement.lang = s.lang; }, [s.lang, i18n]);

  const carry = new URLSearchParams();
  for (const k of ["init", "day"]) { const v = params.get(k); if (v) carry.set(k, v); }
  const qs = carry.toString() ? `?${carry}` : "";
  const ThemeIcon = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : Monitor;
  const nextTheme = s.theme === "system" ? "light" : s.theme === "light" ? "dark" : "system";

  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2">Skip to content</a>
      <header className="no-print sticky top-0 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-card/95 px-3 py-2 backdrop-blur">
        <Button size="icon" variant="ghost" className="md:hidden" aria-label="Menu" onClick={() => setMenu(!menu)}><Menu className="size-4" /></Button>
        <NavLink to={`/brief${qs}`} className="flex items-baseline gap-2">
          <span className="font-bold tracking-tight">{t("app.name")}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">· {t("app.console")}</span>
        </NavLink>
        <CyclePicker />
        <ModelBadge />
        <ModeBadge />
        <FreshnessDot />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCmd(true)} aria-label={t("shell.search")}>
            <Search className="size-4" aria-hidden /><span className="hidden lg:inline">{t("shell.search")}</span>
            <kbd className="hidden rounded border px-1 text-[10px] lg:inline">Ctrl K</kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => startTour()} aria-label={t("shell.tour")} data-testid="tour-btn">
            <Compass className="size-4" aria-hidden /><span className="hidden lg:inline">{t("shell.tour")}</span>
          </Button>
          <Button size="sm" variant="ghost" aria-label={`${t("shell.language")}: ${s.lang === "en" ? "English" : "हिन्दी"}`}
            onClick={() => s.set({ lang: s.lang === "en" ? "hi" : "en" })}>
            {s.lang === "en" ? "हि" : "EN"}
          </Button>
          <Button size="icon" variant="ghost" aria-label={`${t("shell.theme")}: ${s.theme}`} onClick={() => s.set({ theme: nextTheme })}>
            <ThemeIcon className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex flex-1">
        <nav aria-label="Main" className={cn("no-print w-44 shrink-0 border-r bg-sidebar p-2 md:block", menu ? "fixed inset-y-12 z-30 block" : "hidden")}>
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n}>
                <NavLink
                  to={`/${n}${qs}`}
                  onClick={() => setMenu(false)}
                  data-tour={`nav-${n}`}
                  className={({ isActive }) =>
                    cn("block rounded-md px-3 py-1.5 text-sm hover:bg-sidebar-accent",
                      (isActive || (n === "matrix" && loc.pathname.startsWith("/region"))) && "bg-sidebar-accent font-semibold")}
                >
                  {t(`nav.${n}`)}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-3 text-xs text-muted-foreground">{t("app.tagline")}</p>
        </nav>
        <main id="main" className="min-w-0 flex-1 p-3 md:p-4">{children}</main>
      </div>
      <CommandPalette open={cmd} setOpen={setCmd} />
    </div>
  );
}
