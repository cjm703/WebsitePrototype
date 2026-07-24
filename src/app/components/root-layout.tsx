import { useEffect, useRef, Suspense, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { DiceAnimationOverlay } from "./dice-animation";
import { hydrateSoundState, playNavClick, readLegacySoundState } from "./sound-effects";
import { hydratePlacedStickersState, hydrateThemeState, readLegacyPlacedStickersState, readLegacyThemeState, type PlayerTheme, type PlacedSticker } from "./player-theme";
import { ErrorBoundary } from "./error-boundary";
import { pruneIfNeeded, safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import { DISPLAY_CONTENTS } from "./shared-styles";
import { validatePlayerSession } from "@/lib/player-state-api";
import {
  InterfaceSessionProvider,
  type InterfaceSession,
} from "./session-context";

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

const _pruneOnce = (() => { try { pruneIfNeeded(); } catch {} return true; })();

type PlayerCustomizationStateDoc = {
  playerId?: string;
  version?: number;
  theme?: Partial<PlayerTheme>;
  soundConfig?: Record<string, string>;
  customSounds?: unknown[];
  [key: string]: unknown;
};

export function RootLayout() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  const hydratedPlayerIdRef = useRef<string | null>(null);
  const localPlayerId = (safeGetItem("inet-user-id") || "").trim();
  const sessionToken = (safeGetItem("inet-session-token") || "").trim();
  const [session, setSession] = useState<InterfaceSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"loading" | "ready" | "invalid">(
    localPlayerId && sessionToken ? "loading" : "invalid",
  );

  useEffect(() => {
    if (!localPlayerId || !sessionToken) {
      setSessionStatus("invalid");
      return;
    }

    let cancelled = false;
    void validatePlayerSession()
      .then((verified) => {
        if (cancelled) return;
        if (verified.playerId !== localPlayerId) {
          setSessionStatus("invalid");
          return;
        }
        setSession({ playerId: verified.playerId, isDM: verified.isDM });
        setSessionStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setSessionStatus("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [localPlayerId, sessionToken]);

  useEffect(() => {
    let cancelled = false;

    const hydrateInterfaceState = async () => {
      const playerId = (safeGetItem("inet-user-id") || "").trim();
      if (!playerId || hydratedPlayerIdRef.current === playerId) return;

      try {
        const [remoteDoc, remotePlacedStickers] = await Promise.all([
          appStore.loadPlayerCustomization<PlayerCustomizationStateDoc | null>(playerId, null),
          appStore.loadPlayerPlacedStickers<PlacedSticker[] | null>(playerId, null),
        ]);
        if (cancelled) return;

        const legacySound = readLegacySoundState();
        const legacyTheme = readLegacyThemeState(playerId);
        const legacyPlacedStickers = readLegacyPlacedStickersState(playerId);

        const remoteConfig = remoteDoc && typeof remoteDoc.soundConfig === "object" && remoteDoc.soundConfig !== null
          ? remoteDoc.soundConfig
          : null;
        const remoteCustomSounds = Array.isArray(remoteDoc?.customSounds)
          ? remoteDoc.customSounds
          : null;
        const remoteTheme = remoteDoc && typeof remoteDoc.theme === "object" && remoteDoc.theme !== null
          ? remoteDoc.theme
          : null;
        const remoteStickers = Array.isArray(remotePlacedStickers) ? remotePlacedStickers : null;

        const hasRemoteSoundState = remoteConfig !== null || remoteCustomSounds !== null;

        let nextCustomizationDoc: PlayerCustomizationStateDoc | null = null;
        let shouldSaveCustomization = false;

        if (hasRemoteSoundState) {
          const mergedSoundConfig = remoteConfig ?? (legacySound.hasAny ? legacySound.soundConfig : undefined);
          const mergedCustomSounds = remoteCustomSounds ?? (legacySound.hasAny ? legacySound.customSounds : undefined);
          hydrateSoundState({ soundConfig: mergedSoundConfig, customSounds: mergedCustomSounds });
          if ((remoteConfig === null || remoteCustomSounds === null) && legacySound.hasAny) {
            shouldSaveCustomization = true;
            nextCustomizationDoc = {
              ...(nextCustomizationDoc ?? remoteDoc ?? {}),
              playerId,
              version: typeof remoteDoc?.version === "number" ? remoteDoc.version : 1,
              soundConfig: mergedSoundConfig,
              customSounds: mergedCustomSounds,
            };
          }
        } else if (legacySound.hasAny) {
          hydrateSoundState(legacySound);
          shouldSaveCustomization = true;
          nextCustomizationDoc = {
            ...(nextCustomizationDoc ?? remoteDoc ?? {}),
            playerId,
            version: typeof remoteDoc?.version === "number" ? remoteDoc.version : 1,
            soundConfig: legacySound.soundConfig,
            customSounds: legacySound.customSounds,
          };
        }

        if (remoteTheme) {
          hydrateThemeState(playerId, remoteTheme);
        } else if (legacyTheme.hasAny) {
          hydrateThemeState(playerId, legacyTheme.theme);
          shouldSaveCustomization = true;
          nextCustomizationDoc = {
            ...(nextCustomizationDoc ?? remoteDoc ?? {}),
            playerId,
            version: typeof remoteDoc?.version === "number" ? remoteDoc.version : 1,
            theme: legacyTheme.theme,
          };
        }

        if (shouldSaveCustomization && nextCustomizationDoc) {
          await appStore.savePlayerCustomization<PlayerCustomizationStateDoc>(playerId, nextCustomizationDoc);
        }

        if (remoteStickers) {
          hydratePlacedStickersState(playerId, remoteStickers);
        } else if (legacyPlacedStickers.hasAny) {
          hydratePlacedStickersState(playerId, legacyPlacedStickers.stickers);
          await appStore.savePlayerPlacedStickers<PlacedSticker[]>(playerId, legacyPlacedStickers.stickers);
        }

        hydratedPlayerIdRef.current = playerId;
      } catch (error) {
        console.warn("Failed to hydrate interface customization state", error);
      }
    };

    void hydrateInterfaceState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      playNavClick();
      prevPath.current = pathname;
    }
  }, [pathname]);

  if (sessionStatus === "invalid") {
    return <Navigate to="/" replace state={{ from: pathname }} />;
  }

  if (sessionStatus === "loading" || !session) {
    return <RouteFallback />;
  }

  return (
    <div style={DISPLAY_CONTENTS}>
      <InterfaceSessionProvider value={session}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </InterfaceSessionProvider>
      <DiceAnimationOverlay />
    </div>
  );
}
