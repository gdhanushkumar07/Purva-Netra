import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { Shell } from "@/components/shell/Shell";
import { CycleGate, Loading } from "@/components/common";
import { HttpError } from "@/api/client";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
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
const Ops = lazy(() => import("@/pages/Ops"));
const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));

// One retry for transient failures; a 4xx will not fix itself, so it surfaces immediately.
const qc = new QueryClient({ defaultOptions: { queries: {
  retry: (n, e) => n < 1 && !(e instanceof HttpError && e.status >= 400 && e.status < 500),
  refetchOnWindowFocus: false,
} } });

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
function Screens({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return <ErrorBoundary resetKey={loc.pathname + loc.search}>{children}</ErrorBoundary>;
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
            <Screens><Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                {/* screens that need a forecast cycle wait for it here, once, with explicit states */}
                <Route path="/brief" element={<CycleGate><Brief /></CycleGate>} />
                <Route path="/matrix" element={<CycleGate><Matrix /></CycleGate>} />
                <Route path="/map" element={<CycleGate><MapPage /></CycleGate>} />
                <Route path="/region/:rid" element={<CycleGate><Region /></CycleGate>} />
                <Route path="/replay" element={<CycleGate><Replay /></CycleGate>} />
                <Route path="/compare" element={<CycleGate><Compare /></CycleGate>} />
                <Route path="/ledger" element={<Ledger />} />
                <Route path="/watchlist" element={<CycleGate><Watchlist /></CycleGate>} />
                <Route path="/method" element={<Method />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/ops" element={<Ops />} />
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/brief" replace />} />
              </Routes>
            </Suspense></Screens>
          </Shell>
          <Toaster position="bottom-right" theme="system" closeButton richColors={false} />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
