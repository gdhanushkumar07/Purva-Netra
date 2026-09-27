import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Cell } from "@/api/client";
import { fmtDate } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** D1…D10 with dates, prev/next, play/pause and the count of regions at Low / Reduced per day. */
export function DayScrubber({ cells, day, onDay, playing, onPlay }: {
  cells: Cell[]; day: number; onDay: (d: number) => void; playing: boolean; onPlay: () => void;
}) {
  const days = useMemo(() => [...Array(10)].map((_, i) => {
    const dc = cells.filter((c) => c.lead === i + 1);
    return { d: i + 1, date: dc[0]?.valid_date, low: dc.filter((c) => c.confidence === "Low").length,
      reduced: dc.filter((c) => c.confidence === "Reduced").length };
  }), [cells]);
  const max = Math.max(1, ...days.map((x) => x.low + x.reduced));
  return (
    <div className="panel px-2 py-1.5" data-tour="scrubber" data-testid="day-scrubber">
      <div className="flex items-stretch gap-1">
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" aria-label="Previous day" disabled={day <= 1} onClick={() => onDay(day - 1)} data-testid="day-prev"><ChevronLeft className="size-4" /></Button>
          <Button size="icon" onClick={onPlay} aria-label={playing ? "Pause" : "Play Day 1 → 10"} data-testid="play">
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" aria-label="Next day" disabled={day >= 10} onClick={() => onDay(day + 1)} data-testid="day-next"><ChevronRight className="size-4" /></Button>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-10 gap-0.5" role="radiogroup" aria-label="Lead day" data-testid="low-sparkline">
          {days.map((x) => (
            <button key={x.d} type="button" role="radio" aria-checked={x.d === day} onClick={() => onDay(x.d)} data-testid={`day-${x.d}`}
              aria-label={`Day ${x.d}, ${fmtDate(x.date)}: ${x.low} at Low, ${x.reduced} at Reduced`}
              className={cn("flex min-w-0 flex-col items-center rounded border px-0.5 pb-0.5 pt-1 transition-colors motion-reduce:transition-none",
                x.d === day ? "border-foreground bg-accent" : "border-transparent hover:bg-accent/60")}>
              <span className="flex h-5 w-full items-end justify-center gap-px" aria-hidden>
                <span className="w-2 rounded-t-xs bg-[#d03b3b]" style={{ height: `${(x.low / max) * 100}%`, minHeight: x.low ? 2 : 0 }} />
                <span className="w-2 rounded-t-xs bg-[#fab219]" style={{ height: `${(x.reduced / max) * 100}%`, minHeight: x.reduced ? 2 : 0 }} />
              </span>
              <span className="text-[11px] font-semibold">D{x.d}</span>
              <span className="tnum hidden text-[10px] text-muted-foreground md:block">{fmtDate(x.date).replace(/ \d{4}$/, "")}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span aria-live="polite" data-testid="day-label" className="font-semibold text-foreground">Day {day} · {fmtDate(days[day - 1]?.date)}</span>
        <span>bars per day: <span className="text-[#d03b3b]">◆</span> regions at Low · <span className="text-[#b07a00] dark:text-[#fab219]">▲</span> at Reduced · ← → keys change day</span>
      </div>
    </div>
  );
}
