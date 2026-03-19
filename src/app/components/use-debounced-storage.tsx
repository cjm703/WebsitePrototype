// ════════════════════════════════════════════════════════
// Debounced localStorage persistence hooks
// Reduces write frequency to avoid quota pressure
// during rapid state changes (typing, dragging, etc.)
// ════════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from "react";
import { safeSetItem, safeGetItem, safeSetJson } from "./safe-storage";

// ── Module-level registry for beforeunload / pagehide flush ──
// A single global listener flushes ALL pending debounced writes
// on hard refresh / tab close, without adding extra hooks per call.
const _pendingFlushes = new Set<() => void>();

if (typeof window !== "undefined") {
  const flushAll = () => {
    _pendingFlushes.forEach((fn) => fn());
  };
  window.addEventListener("beforeunload", flushAll);
  window.addEventListener("pagehide", flushAll);
}

/**
 * Debounced effect — uses a LEADING + TRAILING pattern:
 *  - Leading:  writes immediately on the first change after quiet
 *  - Trailing: writes again after `delay` ms of inactivity
 *
 * This guarantees data is in localStorage instantly on change
 * (surviving hard refresh) while still throttling rapid-fire writes.
 *
 * Hook count: 3 useRef + 1 useEffect (stable across renders).
 */
export function useDebouncedEffect(
  callback: () => void,
  deps: unknown[],
  delay: number = 500,
): void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);

  // Keep callback ref fresh
  callbackRef.current = callback;

  useEffect(() => {
    // Create a flush function that captures stable refs
    const flush = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        callbackRef.current();
        timerRef.current = null;
      }
    };

    // Register for beforeunload / pagehide flushing
    _pendingFlushes.add(flush);

    // Skip the first run (initial mount — data is already in localStorage)
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return () => { _pendingFlushes.delete(flush); };
    }

    // Leading edge: write immediately if no timer is running
    // (first change after a period of quiet → instant persist)
    if (timerRef.current === null) {
      callbackRef.current();
    } else {
      // Already in a throttle window — just reset the trailing timer
      clearTimeout(timerRef.current);
    }

    // Trailing edge: schedule a follow-up write after `delay` ms
    // to capture the final state after rapid changes stop
    timerRef.current = setTimeout(() => {
      callbackRef.current();
      timerRef.current = null;
    }, delay);

    // Flush on unmount / deps change
    return () => {
      _pendingFlushes.delete(flush);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        callbackRef.current();
        timerRef.current = null;
      }
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Convenience: debounced JSON persistence to localStorage.
 * Writes `data` to `key` after `delay` ms of inactivity.
 */
export function useDebouncedJsonStorage(
  key: string,
  data: unknown,
  delay: number = 500,
): void {
  useDebouncedEffect(
    () => { safeSetJson(key, data); },
    [key, data],
    delay,
  );
}

/**
 * Returns a debounced save function that coalesces rapid calls.
 * Useful for event handlers (onChange, onClick) that need to persist.
 */
export function useDebouncedSave(
  saveFn: () => void,
  delay: number = 500,
): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        saveFnRef.current();
      }
    };
  }, []);

  return useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveFnRef.current();
      timerRef.current = null;
    }, delay);
  }, [delay]);
}