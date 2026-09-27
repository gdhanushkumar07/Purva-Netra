import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Cell } from "@/api/client";
import { fmtDate } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Clean D1–D10 timeline. One marker per day: ◆ any region at Low, ▲ any at Reduced, ○ neither. */
export function DayScrubber({ cells, day, onDay, playing, onPlay }: {
  cells: Cell[]; day: number; onDay: (d: number) => void; playing: boolean; onPlay: () => void;
}) {
  const days = useMemo(() => [...Array(10)].map((_, i) => {
    const dc = cells.filter((c) => c.lead === i + 1);
    return { d: i + 1, date: dc[0]?.valid_date, low: dc.filter((c) => c.confidence === "Low").length,
      reduced: dc.filter((c) => c.confidence === "Reduced").length };
  }), [cells]);
  const cur = days[day - 1];
  return (
    <div className="flex items-center gap-3 border-t px-2 py-1.5" data-tour="scrubber" data-testid="day-scrubber">
      <div className="flex items-center">
        <button type="button" aria-label="Previous day" disabled={day <= 1} onClick={() => onDay(day - 1)} data-testid="day-prev"
          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={onPlay} aria-label={playing ? "Pause (Space)" : "Play Day 1 → 10 (Space)"} data-testid="play"
          className="rounded-full border p-1.5 hover:bg-accent">{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
        <button type="button" aria-label="Next day" disabled={day >= 10} onClick={() => onDay(day + 1)} data-testid="day-next"
          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronRight className="size-4" /></button>
      </div>
      <div className="relative grid min-w-0 flex-1 grid-cols-10" role="radiogroup" aria-label="Lead day" data-testid="low-sparkline">
        <span aria-hidden className="absolute inset-x-[5%] top-[9px] h-px bg-border" />
        {days.map((x) => {
          const on = x.d === day;
          const mark = x.low ? { g: "◆", c: "text-[#d03b3b]" } : x.reduced ? { g: "▲", c: "text-[#b07a00] dark:text-[#fab219]" } : { g: "○", c: "text-muted-foreground" };
          return (
            <button key={x.d} type="button" role="radio" aria-checked={on} onClick={() => onDay(x.d)} data-testid={`day-${x.d}`}
              title={`Day ${x.d} · ${fmtDate(x.date)} — ${x.low} at Low, ${x.reduced} at Reduced`}
              aria-label={`Day ${x.d}, ${fmtDate(x.date)}: ${x.low} at Low, ${x.reduced} at Reduced`}
              className="group relative flex flex-col items-center gap-0.5">
              <span className={cn("relative z-10 flex size-[18px] items-center justify-center rounded-full bg-background text-[10px] leading-none",
                on && "ring-2 ring-foreground", mark.c)}>{mark.g}</span>
              <span className={cn("text-[11px]", on ? "font-semibold" : "text-muted-foreground group-hover:text-foreground")}>D{x.d}</span>
            </button>
          );
        })}
      </div>
      <div className="w-36 shrink-0 text-right">
        <div aria-live="polite" data-testid="day-label" className="text-xs font-semibold uppercase tracking-wide">Day {day} · {fmtDate(cur?.date)}</div>
        <div className="text-[10px] text-muted-foreground">◆ Low · ▲ Reduced · ←/→ · Space</div>
      </div>
    </div>
  );
}
