// ════════════════════════════════════════════════════════
// Visibility-aware hooks — pause expensive work when the
// browser tab is hidden to reduce CPU/GPU/memory pressure.
// ════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns whether the page is currently visible.
 * Updates reactively when the user switches tabs.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const handler = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return isVisible;
}

/**
 * Visibility-aware requestAnimationFrame loop.
 * Pauses when the tab is hidden, resumes when visible.
 * Returns a ref boolean `isRunning` for external checks.
 *
 * @param callback - called every frame with `deltaTime` in ms
 * @param active - external on/off switch (e.g. game state)
 */
export function useVisibilityRAF(
  callback: (dt: number) => void,
  active: boolean = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const isVisible = usePageVisibility();
  const shouldRun = active && isVisible;

  useEffect(() => {
    if (!shouldRun) return;

    let rafId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      callbackRef.current(dt);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [shouldRun]);
}

/**
 * Visibility-aware setInterval. Pauses when the tab is hidden.
 *
 * @param callback - called every `delay` ms
 * @param delay - interval in milliseconds
 * @param active - external on/off switch
 */
export function useVisibilityInterval(
  callback: () => void,
  delay: number,
  active: boolean = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const isVisible = usePageVisibility();
  const shouldRun = active && isVisible;

  useEffect(() => {
    if (!shouldRun) return;

    const id = setInterval(() => callbackRef.current(), delay);
    return () => clearInterval(id);
  }, [shouldRun, delay]);
}
