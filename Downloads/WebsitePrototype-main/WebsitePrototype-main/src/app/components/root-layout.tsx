import { useEffect, useRef, Suspense } from "react";
import { Outlet, useLocation } from "react-router";
import { DiceAnimationOverlay } from "./dice-animation";
import { playNavClick } from "./sound-effects";
import { ErrorBoundary } from "./error-boundary";
import { pruneIfNeeded } from "./safe-storage";
import { DISPLAY_CONTENTS } from "./shared-styles";

function RouteFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#050508" }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-6 h-6"
          style={{
            border: "2px solid #2A2A5B",
            borderTop: "2px solid #6A6ACA",
            borderRadius: "50%",
            animation: "route-spin 0.8s linear infinite",
          }}
        />
        <span
          className="text-[11px] font-mono tracking-widest uppercase"
          style={{ color: "#4A4A7A" }}
        >
          Loading...
        </span>
        <style>{`@keyframes route-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

// Run a single prune check on first load
const _pruneOnce = (() => { try { pruneIfNeeded(); } catch {} return true; })();

export function RootLayout() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);

  // Play navigation sound on route change (not on initial mount)
  useEffect(() => {
    if (prevPath.current !== pathname) {
      playNavClick();
      prevPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div style={DISPLAY_CONTENTS}>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
      <DiceAnimationOverlay />
    </div>
  );
}