import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Shell } from "@/components/shell/Shell";
import { Loading } from "@/components/common";
import { useResolvedTheme } from "@/lib/hooks";
import { useSettings } from "@/store";
import { registerNavigate } from "@/tour/demoTour";
import Brief from "@/pages/Brief";
import Matrix from "@/pages/Matrix";
import { Method, Settings, Watchlist } from "@/pages/Misc";

const MapPage = lazy(() => import("@/pages/MapPage"));
const Region = lazy(() => import("@/pages/Region"));
const Replay = lazy(() => import("@/pages/Replay"));
const Compare = lazy(() => import("@/pages/Compare"));
const Ledger = lazy(() => import("@/pages/Ledger"));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function ThemeSync() {
  const t = useResolvedTheme();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.dataset.theme = t;
  }, [t]);
  return null;
}
function NavBridge() {
  const nav = useNavigate();
  useEffect(() => registerNavigate(nav), [nav]);
  return null;
}
function Landing() {
  const landing = useSettings((s) => s.landing);
  return <Navigate to={landing + window.location.search} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <BrowserRouter>
          <ThemeSync />
          <NavBridge />
          <Shell>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/brief" element={<Brief />} />
                <Route path="/matrix" element={<Matrix />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/region/:rid" element={<Region />} />
                <Route path="/replay" element={<Replay />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/ledger" element={<Ledger />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/method" element={<Method />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/brief" replace />} />
              </Routes>
            </Suspense>
          </Shell>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
