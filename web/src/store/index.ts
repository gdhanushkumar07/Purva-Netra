import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Per-user preferences (not view state). View state lives in the URL — see useView(). */
interface Settings {
  theme: "light" | "dark" | "system";
  lang: "en" | "hi";
  texture: boolean;
  showNumbers: boolean;
  landing: string;
  watch: { rid: number; from: number; to: number; threshold: number }[];
  set: (p: Partial<Omit<Settings, "set">>) => void;
}
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: "system", lang: "en", texture: false, showNumbers: false, landing: "/brief", watch: [],
      set: (p) => set(p),
    }),
    { name: "purva-netra-settings" },
  ),
);

/** URL-backed view state: init (cycle), day, rid, tab, layer, … — every view is a shareable link. */
export function useView() {
  const [sp, setSp] = useSearchParams();
  const get = useCallback((k: string) => sp.get(k) ?? undefined, [sp]);
  const set = useCallback(
    (patch: Record<string, string | number | undefined | null>, replace = true) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "") n.delete(k);
            else n.set(k, String(v));
          }
          return n;
        },
        { replace },
      ),
    [setSp],
  );
  return { get, set, params: sp };
}
