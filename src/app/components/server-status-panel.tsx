import React, { useState, useEffect, useRef } from "react";
import { retro } from "./retro-styles";
import { S_DIM, S_MUTED, S_RED, S_TEXT } from "./shared-styles";
import { getStorageUsageBytes, getStorageUsageFraction } from "./safe-storage";
import { readErrorLog, type ErrorLogEntry } from "./error-logger";
import {
  Activity,
  Database,
  AlertTriangle,
  Wifi,
  WifiOff,
  Clock,
  HardDrive,
  Server,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8a5950b5`;

interface ServerPing {
  status: "ok" | "error" | "checking";
  latencyMs: number | null;
  lastChecked: Date | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function ServerStatusPanel({
  accentColor,
  labelColor,
}: {
  accentColor: string;
  labelColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ping, setPing] = useState<ServerPing>({ status: "checking", latencyMs: null, lastChecked: null });
  const [storageBytes, setStorageBytes] = useState(0);
  const [storageFraction, setStorageFraction] = useState(0);
  const [storageKeyCount, setStorageKeyCount] = useState(0);
  const [inetKeyCount, setInetKeyCount] = useState(0);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [sessionStart] = useState(() => Date.now());
  const [uptime, setUptime] = useState(0);
  const [pingHistory, setPingHistory] = useState<Array<{ time: Date; ms: number; ok: boolean }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ping the server
const checkServer = async () => {
  const start = performance.now();

  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    const ms = Math.round(performance.now() - start);
    const ok = res.ok;
    const now = new Date();

    setPing({
      status: ok ? "ok" : "error",
      latencyMs: ms,
      lastChecked: now,
    });

    setPingHistory((prev) => [
      ...prev.slice(-19),
      { time: now, ms, ok },
    ]);
  } catch {
    const ms = Math.round(performance.now() - start);
    const now = new Date();

    setPing({
      status: "error",
      latencyMs: ms,
      lastChecked: now,
    });

    setPingHistory((prev) => [
      ...prev.slice(-19),
      { time: now, ms, ok: false },
    ]);
  }
};
  // Refresh local metrics
  const refreshMetrics = () => {
    setStorageBytes(getStorageUsageBytes());
    setStorageFraction(getStorageUsageFraction());
    setErrorLog(readErrorLog());
    setUptime(Date.now() - sessionStart);
    try {
      setStorageKeyCount(localStorage.length);
      let inet = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("inet-")) inet++;
      }
      setInetKeyCount(inet);
    } catch {
      setStorageKeyCount(0);
      setInetKeyCount(0);
    }
  };

  useEffect(() => {
    checkServer();
    refreshMetrics();
    // Ping server every 60s, refresh metrics every 5s
    const pingInterval = setInterval(checkServer, 60000);
    intervalRef.current = setInterval(() => {
      refreshMetrics();
      setUptime(Date.now() - sessionStart);
    }, 5000);
    return () => {
      clearInterval(pingInterval);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recentErrors = errorLog.filter((e) => e.type === "error");
  const recentReports = errorLog.filter((e) => e.type === "report");
  const failedPings = pingHistory.filter((p) => !p.ok).length;
  const storagePercent = Math.min(100, Math.round(storageFraction * 100));
  const storageWarning = storageFraction > 0.85;
  const storageCritical = storageFraction > 0.95;

  // Uptime percentage from ping history
  const uptimePercent =
    pingHistory.length > 0
      ? Math.round(((pingHistory.length - failedPings) / pingHistory.length) * 100)
      : ping.status === "ok"
        ? 100
        : ping.status === "error"
          ? 0
          : null;

  const avgLatency =
    pingHistory.length > 0
      ? Math.round(pingHistory.reduce((a, b) => a + b.ms, 0) / pingHistory.length)
      : ping.latencyMs;

  const statusColor =
    ping.status === "ok" ? "#4ADE80" : ping.status === "error" ? "#FF6A6A" : "#FBBF24";

  const storageBarColor = storageCritical
    ? "#FF6A6A"
    : storageWarning
      ? "#FBBF24"
      : "#4ADE80";

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 pb-4">
      <div
        className={`${retro.raised} bg-[#0A0A2E]`}
        style={{ borderTop: "2px solid #1A1A4B" }}
      >
        {/* Expanded details — renders above the collapsed bar */}
        {expanded && (
          <div
            className="px-3 pt-3"
            style={{ borderBottom: "1px solid #1A1A4B" }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {/* Server Connection */}
              <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  {ping.status === "ok" ? (
                    <Wifi size={14} style={{ color: "#4ADE80" }} />
                  ) : (
                    <WifiOff size={14} style={S_RED} />
                  )}
                  <span className="text-[10px]" style={{ color: labelColor, fontWeight: 600 }}>
                    SERVER
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Status</span>
                    <span className="text-[9px]" style={{ color: statusColor, fontWeight: 600 }}>
                      {ping.status === "ok" ? "CONNECTED" : ping.status === "error" ? "UNREACHABLE" : "CHECKING"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Latency</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {ping.latencyMs !== null ? `${ping.latencyMs}ms` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Avg Latency</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {avgLatency !== null ? `${avgLatency}ms` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Uptime</span>
                    <span className="text-[9px]" style={{ color: uptimePercent === 100 ? "#4ADE80" : uptimePercent !== null && uptimePercent >= 80 ? "#FBBF24" : "#FF6A6A" }}>
                      {uptimePercent !== null ? `${uptimePercent}%` : "—"}
                    </span>
                  </div>
                  {ping.lastChecked && (
                    <div className="flex justify-between">
                      <span className="text-[9px]" style={S_MUTED}>Last Check</span>
                      <span className="text-[9px]" style={S_MUTED}>
                        {ping.lastChecked.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Storage */}
              <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <Database size={14} style={{ color: storageBarColor }} />
                  <span className="text-[10px]" style={{ color: labelColor, fontWeight: 600 }}>
                    STORAGE
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Used</span>
                    <span className="text-[9px]" style={{ color: storageWarning ? storageBarColor : "#C0D0F0", fontWeight: storageWarning ? 600 : 400 }}>
                      {formatBytes(storageBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Quota</span>
                    <span className="text-[9px]" style={S_TEXT}>5.00 MB</span>
                  </div>
                  {/* Storage bar */}
                  <div
                    className="w-full h-2 rounded-sm overflow-hidden mt-1"
                    style={{ background: "#080820", border: "1px solid #1A1A4B" }}
                  >
                    <div
                      className="h-full rounded-sm transition-all"
                      style={{
                        width: `${storagePercent}%`,
                        background: storageBarColor,
                        boxShadow: storageCritical ? `0 0 4px ${storageBarColor}` : "none",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px]" style={S_MUTED}>Total Keys</span>
                    <span className="text-[9px]" style={S_TEXT}>{storageKeyCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>I-NET Keys</span>
                    <span className="text-[9px]" style={S_TEXT}>{inetKeyCount}</span>
                  </div>
                  {storageWarning && (
                    <div className="text-[8px] mt-1" style={{ color: storageBarColor }}>
                      {storageCritical ? "⚠ CRITICAL — auto-prune active" : "⚠ Approaching capacity"}
                    </div>
                  )}
                </div>
              </div>

              {/* Error Log */}
              <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} style={{ color: recentErrors.length > 0 ? "#FF6A6A" : "#4ADE80" }} />
                  <span className="text-[10px]" style={{ color: labelColor, fontWeight: 600 }}>
                    ERROR LOG
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Errors</span>
                    <span className="text-[9px]" style={{ color: recentErrors.length > 0 ? "#FF6A6A" : "#4ADE80", fontWeight: 600 }}>
                      {recentErrors.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Reports</span>
                    <span className="text-[9px]" style={{ color: recentReports.length > 0 ? "#FBBF24" : "#C0D0F0" }}>
                      {recentReports.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Total Entries</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {errorLog.length} / 200
                    </span>
                  </div>
                  {recentErrors.length > 0 && (
                    <div style={{ borderTop: "1px solid #1A1A3B" }} className="pt-1 mt-1">
                      <span className="text-[8px]" style={S_MUTED}>LATEST:</span>
                      <div className="text-[8px] truncate mt-0.5" style={{ color: "#FF6A6A", fontFamily: "'Courier New', monospace" }}>
                        {recentErrors[0]?.message?.slice(0, 60)}
                      </div>
                      <div className="text-[8px]" style={S_DIM}>
                        {recentErrors[0]?.timestamp}
                      </div>
                    </div>
                  )}
                  {recentErrors.length === 0 && (
                    <div className="text-[9px] mt-1" style={{ color: "#4ADE80" }}>
                      No errors recorded
                    </div>
                  )}
                </div>
              </div>

              {/* Session Info */}
              <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} style={{ color: accentColor }} />
                  <span className="text-[10px]" style={{ color: labelColor, fontWeight: 600 }}>
                    SESSION
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Duration</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {formatUptime(uptime)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Started</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {new Date(sessionStart).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Pings Sent</span>
                    <span className="text-[9px]" style={S_TEXT}>
                      {pingHistory.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={S_MUTED}>Failed Pings</span>
                    <span className="text-[9px]" style={{ color: failedPings > 0 ? "#FF6A6A" : "#4ADE80" }}>
                      {failedPings}
                    </span>
                  </div>

                  {/* Mini ping sparkline */}
                  {pingHistory.length > 1 && (
                    <div className="mt-1 pt-1" style={{ borderTop: "1px solid #1A1A3B" }}>
                      <span className="text-[8px]" style={S_MUTED}>LATENCY GRAPH:</span>
                      <div className="flex items-end gap-px mt-1 h-4">
                        {pingHistory.slice(-20).map((p, i) => {
                          const maxMs = Math.max(...pingHistory.slice(-20).map((h) => h.ms), 1);
                          const h = Math.max(2, Math.round((p.ms / maxMs) * 16));
                          return (
                            <div
                              key={i}
                              style={{
                                width: 3,
                                height: h,
                                background: p.ok ? "#4ADE80" : "#FF6A6A",
                                opacity: 0.7 + (i / 20) * 0.3,
                                borderRadius: 1,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed bar — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#0E0E35] transition-colors text-left"
        >
          <Server size={12} style={{ color: labelColor }} />
          <span className="text-[10px] tracking-wider" style={{ color: labelColor, fontWeight: 600 }}>
            SYSTEM STATUS
          </span>

          {/* Quick indicators */}
          <div className="flex items-center gap-4 flex-1 ml-2">
            {/* Server status dot */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: statusColor,
                  boxShadow: `0 0 4px ${statusColor}`,
                  animation: ping.status === "checking" ? "pulse 1s infinite" : "none",
                }}
              />
              <span className="text-[9px]" style={{ color: statusColor }}>
                {ping.status === "ok"
                  ? `ONLINE${ping.latencyMs ? ` · ${ping.latencyMs}ms` : ""}`
                  : ping.status === "error"
                    ? "OFFLINE"
                    : "CHECKING..."}
              </span>
            </div>

            {/* Storage mini bar */}
            <div className="flex items-center gap-1.5">
              <HardDrive size={10} style={S_MUTED} />
              <div
                className="w-16 h-1.5 rounded-sm overflow-hidden"
                style={{ background: "#0C0C2E", border: "1px solid #1A1A4B" }}
              >
                <div
                  className="h-full rounded-sm transition-all"
                  style={{
                    width: `${storagePercent}%`,
                    background: storageBarColor,
                  }}
                />
              </div>
              <span className="text-[9px]" style={{ color: storageWarning ? storageBarColor : "#5A6A8A" }}>
                {storagePercent}%
              </span>
            </div>

            {/* Error count */}
            {recentErrors.length > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle size={10} style={S_RED} />
                <span className="text-[9px]" style={S_RED}>
                  {recentErrors.length} error{recentErrors.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            {/* Session uptime */}
            <div className="flex items-center gap-1">
              <Clock size={10} style={S_MUTED} />
              <span className="text-[9px]" style={S_MUTED}>
                {formatUptime(uptime)}
              </span>
            </div>
          </div>

          {expanded ? (
            <ChevronDown size={12} style={S_MUTED} />
          ) : (
            <ChevronUp size={12} style={S_MUTED} />
          )}
        </button>
      </div>
    </div>
  );
}