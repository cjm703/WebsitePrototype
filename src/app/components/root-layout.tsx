import { useEffect, useRef, Suspense } from "react";
import { Outlet, useLocation } from "react-router";
import { DiceAnimationOverlay } from "./dice-animation";
import { hydrateSoundState, playNavClick, readLegacySoundState } from "./sound-effects";
import { ErrorBoundary } from "./error-boundary";
import { pruneIfNeeded, safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";
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

type PlayerCustomizationSoundDoc = {
  playerId?: string;
  version?: number;
  soundConfig?: Record<string, string>;
  customSounds?: unknown[];
  [key: string]: unknown;
};

export function RootLayout() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  const hydratedPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateInterfaceSoundState = async () => {
      const playerId = (safeGetItem("inet-user-id") || "").trim();
      if (!playerId || hydratedPlayerIdRef.current === playerId) return;

      try {
        const remoteDoc = await appStore.loadPlayerCustomization<PlayerCustomizationSoundDoc | null>(playerId, null);
        if (cancelled) return;

        const legacy = readLegacySoundState();
        const remoteConfig = remoteDoc && typeof remoteDoc.soundConfig === "object" && remoteDoc.soundConfig !== null
          ? remoteDoc.soundConfig
          : null;
        const remoteCustomSounds = Array.isArray(remoteDoc?.customSounds)
          ? remoteDoc.customSounds
          : null;

        const hasRemoteSoundState = remoteConfig !== null || remoteCustomSounds !== null;

        if (hasRemoteSoundState) {
          const mergedSoundConfig = remoteConfig ?? (legacy.hasAny ? legacy.soundConfig : undefined);
          const mergedCustomSounds = remoteCustomSounds ?? (legacy.hasAny ? legacy.customSounds : undefined);

          hydrateSoundState({
            soundConfig: mergedSoundConfig,
            customSounds: mergedCustomSounds,
          });

          if ((remoteConfig === null || remoteCustomSounds === null) && legacy.hasAny) {
            await appStore.savePlayerCustomization<PlayerCustomizationSoundDoc>(playerId, {
              ...(remoteDoc ?? {}),
              playerId,
              version: typeof remoteDoc?.version === "number" ? remoteDoc.version : 1,
              soundConfig: mergedSoundConfig,
              customSounds: mergedCustomSounds,
            });
          }
        } else if (legacy.hasAny) {
          hydrateSoundState(legacy);
          await appStore.savePlayerCustomization<PlayerCustomizationSoundDoc>(playerId, {
            ...(remoteDoc ?? {}),
            playerId,
            version: typeof remoteDoc?.version === "number" ? remoteDoc.version : 1,
            soundConfig: legacy.soundConfig,
            customSounds: legacy.customSounds,
          });
        }

        hydratedPlayerIdRef.current = playerId;
      } catch (error) {
        console.warn("Failed to hydrate interface sound settings", error);
      }
    };

    void hydrateInterfaceSoundState();

    return () => {
      cancelled = true;
    };
  }, []);

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