import { useCallback, useEffect, useState } from "react";
import { buildSupabasePublicHeaders, supabaseFunctionBase } from "@/lib/supabase-env";
import { readErrorLog, subscribeErrorLog, type ErrorLogEntry } from "./error-logger";
import {
  classifyStorageKey,
  getStorageUsageBytes,
  getStorageUsageFraction,
  safeGetItem,
  type StorageImportance,
} from "./safe-storage";

export interface ServerPing {
  status: "ok" | "error" | "checking";
  latencyMs: number | null;
  lastChecked: Date | null;
}

export interface PingSample {
  time: Date;
  ms: number;
  ok: boolean;
}

export interface StorageKeyMetric {
  key: string;
  bytes: number;
  importance: StorageImportance;
  clearable: boolean;
  description: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function readStorageMetrics() {
  const storageKeys: StorageKeyMetric[] = [];
  let totalKeys = 0;
  let inetKeys = 0;
  try {
    totalKeys = localStorage.length;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const value = localStorage.getItem(key) || "";
      const bytes = (key.length + value.length) * 2;
      storageKeys.push({ key, bytes, ...classifyStorageKey(key) });
      if (key.startsWith("inet-")) inetKeys += 1;
    }
  } catch {
    return { totalKeys: 0, inetKeys: 0, storageKeys: [] as StorageKeyMetric[] };
  }
  storageKeys.sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));
  return { totalKeys, inetKeys, storageKeys };
}

export function useSystemStatus() {
  const [ping, setPing] = useState<ServerPing>({ status: "checking", latencyMs: null, lastChecked: null });
  const [pingHistory, setPingHistory] = useState<PingSample[]>([]);
  const [storageBytes, setStorageBytes] = useState(0);
  const [storageFraction, setStorageFraction] = useState(0);
  const [storageKeyCount, setStorageKeyCount] = useState(0);
  const [inetKeyCount, setInetKeyCount] = useState(0);
  const [storageKeys, setStorageKeys] = useState<StorageKeyMetric[]>([]);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>(() => readErrorLog());
  const [sessionStart] = useState(() => Date.now());
  const [uptime, setUptime] = useState(0);

  const checkServer = useCallback(async () => {
    const start = performance.now();
    try {
      const response = await fetch(`${supabaseFunctionBase}/health`, {
        method: "GET",
        headers: buildSupabasePublicHeaders(false),
      });
      const now = new Date();
      const ms = Math.round(performance.now() - start);
      setPing({ status: response.ok ? "ok" : "error", latencyMs: ms, lastChecked: now });
      setPingHistory((current) => [...current.slice(-49), { time: now, ms, ok: response.ok }]);
    } catch {
      const now = new Date();
      const ms = Math.round(performance.now() - start);
      setPing({ status: "error", latencyMs: ms, lastChecked: now });
      setPingHistory((current) => [...current.slice(-49), { time: now, ms, ok: false }]);
    }
  }, []);

  const refreshMetrics = useCallback(() => {
    const keys = readStorageMetrics();
    setStorageBytes(getStorageUsageBytes());
    setStorageFraction(getStorageUsageFraction());
    setStorageKeyCount(keys.totalKeys);
    setInetKeyCount(keys.inetKeys);
    setStorageKeys(keys.storageKeys);
    setErrorLog(readErrorLog());
    setUptime(Date.now() - sessionStart);
  }, [sessionStart]);

  const refresh = useCallback(() => {
    refreshMetrics();
    void checkServer();
  }, [checkServer, refreshMetrics]);

  useEffect(() => {
    refresh();
    const pingInterval = window.setInterval(checkServer, 60000);
    const metricsInterval = window.setInterval(refreshMetrics, 5000);
    const unsubscribe = subscribeErrorLog(refreshMetrics);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(pingInterval);
      window.clearInterval(metricsInterval);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [checkServer, refresh, refreshMetrics]);

  const recentErrors = errorLog.filter((entry) => entry.type === "error");
  const recentReports = errorLog.filter((entry) => entry.type === "report");
  const failedPings = pingHistory.filter((sample) => !sample.ok).length;
  const storagePercent = Math.min(100, Math.round(storageFraction * 100));
  const storageWarning = storageFraction > 0.85;
  const storageCritical = storageFraction > 0.95;
  const uptimePercent = pingHistory.length > 0
    ? Math.round(((pingHistory.length - failedPings) / pingHistory.length) * 100)
    : ping.status === "ok" ? 100 : ping.status === "error" ? 0 : null;
  const avgLatency = pingHistory.length > 0
    ? Math.round(pingHistory.reduce((sum, sample) => sum + sample.ms, 0) / pingHistory.length)
    : ping.latencyMs;
  const statusColor = ping.status === "ok" ? "#4ADE80" : ping.status === "error" ? "#FF6A6A" : "#FBBF24";
  const storageBarColor = storageCritical ? "#FF6A6A" : storageWarning ? "#FBBF24" : "#4ADE80";

  return {
    ping,
    pingHistory,
    storageBytes,
    storageFraction,
    storageKeyCount,
    inetKeyCount,
    storageKeys,
    errorLog,
    sessionStart,
    sessionPlayer: safeGetItem("inet-user") || "Unknown",
    sessionPlayerId: safeGetItem("inet-user-id") || "Unknown",
    hasSessionToken: Boolean(safeGetItem("inet-session-token")),
    uptime,
    recentErrors,
    recentReports,
    failedPings,
    storagePercent,
    storageWarning,
    storageCritical,
    uptimePercent,
    avgLatency,
    statusColor,
    storageBarColor,
    refresh,
  };
}
