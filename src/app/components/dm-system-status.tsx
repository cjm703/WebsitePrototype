import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { retro } from "./retro-styles";
import type { ErrorLogEntry } from "./error-logger";
import { formatBytes, formatUptime, useSystemStatus } from "./use-system-status";
import { S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "./shared-styles";

type StatusView = "overview" | "server" | "storage" | "errors" | "session";

const PANEL = { background: "#090D27", border: "1px solid #23295A" } as const;
const SUB_PANEL = { background: "#070A20", border: "1px solid #1B214A" } as const;

export function DMSystemStatus({
  errorEntries,
  onClearErrors,
  onRemoveError,
  onRefreshErrors,
}: {
  errorEntries: ErrorLogEntry[];
  onClearErrors: () => void | Promise<void>;
  onRemoveError: (id: string) => void | Promise<void>;
  onRefreshErrors: () => void;
}) {
  const status = useSystemStatus();
  const [view, setView] = useState<StatusView>("overview");
  const [errorFilter, setErrorFilter] = useState<"all" | "error" | "report">("all");
  const mergedErrorEntries = useMemo(() => {
    const byId = new Map<string, ErrorLogEntry>();
    [...errorEntries, ...status.errorLog].forEach((entry) => byId.set(entry.id, entry));
    return Array.from(byId.values()).sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
  }, [errorEntries, status.errorLog]);
  const visibleErrors = useMemo(
    () => mergedErrorEntries.filter((entry) => errorFilter === "all" || entry.type === errorFilter),
    [mergedErrorEntries, errorFilter],
  );
  const errorCount = mergedErrorEntries.filter((entry) => entry.type === "error").length;
  const reportCount = mergedErrorEntries.filter((entry) => entry.type === "report").length;
  const maxPing = Math.max(...status.pingHistory.map((sample) => sample.ms), 1);

  const refreshAll = () => {
    status.refresh();
    onRefreshErrors();
  };

  const views: Array<{ id: StatusView; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "server", label: "Server", icon: Server },
    { id: "storage", label: "Storage", icon: Database },
    { id: "errors", label: "Error Log", icon: AlertTriangle },
    { id: "session", label: "Session", icon: Clock },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Server size={20} style={S_ACCENT} />
            <h2 className="text-[18px] font-bold" style={S_ACCENT}>System Status</h2>
          </div>
          <p className="mt-1 text-[10px]" style={S_MUTED}>Live diagnostics for this browser session and the connected application server.</p>
        </div>
        <button type="button" onClick={refreshAll} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_TEXT}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#23295A] pb-3">
        {views.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`${active ? retro.sunken : retro.raised} flex items-center gap-2 px-3 py-2 text-[10px]`}
              style={{ color: active ? "#79B8FF" : "#8E9ABB", background: active ? "#0B1435" : "#11163A" }}
            >
              <Icon size={12} /> {item.label}
            </button>
          );
        })}
      </div>

      {view === "overview" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusSummary
            icon={status.ping.status === "ok" ? Wifi : WifiOff}
            label="Server"
            value={status.ping.status === "ok" ? "Connected" : status.ping.status === "error" ? "Unreachable" : "Checking"}
            detail={status.ping.latencyMs == null ? "Waiting for response" : `${status.ping.latencyMs}ms current latency`}
            color={status.statusColor}
            onClick={() => setView("server")}
          />
          <StatusSummary
            icon={HardDrive}
            label="Storage"
            value={`${status.storagePercent}% used`}
            detail={`${formatBytes(status.storageBytes)} across ${status.storageKeyCount} keys`}
            color={status.storageBarColor}
            onClick={() => setView("storage")}
          />
          <StatusSummary
            icon={AlertTriangle}
            label="Error Log"
            value={`${errorCount} error${errorCount === 1 ? "" : "s"}`}
            detail={`${reportCount} player report${reportCount === 1 ? "" : "s"}`}
            color={errorCount > 0 ? "#FF6A6A" : "#4ADE80"}
            onClick={() => setView("errors")}
          />
          <StatusSummary
            icon={ShieldCheck}
            label="Session"
            value={status.hasSessionToken ? "Authenticated" : "No token"}
            detail={`${status.sessionPlayer} | ${formatUptime(status.uptime)}`}
            color={status.hasSessionToken ? "#4ADE80" : "#FBBF24"}
            onClick={() => setView("session")}
          />
        </div>
      )}

      {view === "server" && (
        <section className="p-4" style={PANEL}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {status.ping.status === "ok" ? <Wifi size={17} style={S_GREEN} /> : <WifiOff size={17} style={S_RED} />}
              <div>
                <div className="text-[12px] font-bold" style={S_TEXT}>Application Server</div>
                <div className="text-[9px]" style={S_DIM}>Supabase Edge Function health endpoint</div>
              </div>
            </div>
            <span className="border px-2 py-1 text-[9px]" style={{ color: status.statusColor, borderColor: status.statusColor }}>
              {status.ping.status.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Current Latency" value={status.ping.latencyMs == null ? "--" : `${status.ping.latencyMs}ms`} />
            <Metric label="Average Latency" value={status.avgLatency == null ? "--" : `${status.avgLatency}ms`} />
            <Metric label="Observed Uptime" value={status.uptimePercent == null ? "--" : `${status.uptimePercent}%`} />
            <Metric label="Failed Checks" value={String(status.failedPings)} tone={status.failedPings > 0 ? "warn" : "good"} />
          </div>
          <div className="mt-4 p-3" style={SUB_PANEL}>
            <div className="mb-2 flex items-center justify-between text-[9px]" style={S_MUTED}>
              <span>LATENCY HISTORY</span>
              <span>{status.pingHistory.length}/50 samples</span>
            </div>
            {status.pingHistory.length === 0 ? (
              <div className="py-8 text-center text-[10px]" style={S_DIM}>No checks have completed yet.</div>
            ) : (
              <div className="flex h-28 items-end gap-1 border-b border-[#252D5B] px-1">
                {status.pingHistory.map((sample, index) => (
                  <div
                    key={`${sample.time.getTime()}-${index}`}
                    className="min-w-1 flex-1"
                    title={`${sample.time.toLocaleTimeString()} | ${sample.ms}ms | ${sample.ok ? "OK" : "FAILED"}`}
                    style={{ height: `${Math.max(4, (sample.ms / maxPing) * 100)}%`, background: sample.ok ? "#4ADE80" : "#FF6A6A" }}
                  />
                ))}
              </div>
            )}
            <div className="mt-2 text-[9px]" style={S_DIM}>
              Last checked: {status.ping.lastChecked?.toLocaleString() || "Not yet checked"}
            </div>
          </div>
        </section>
      )}

      {view === "storage" && (
        <section className="p-4" style={PANEL}>
          <div className="mb-4 flex items-center gap-2">
            <Database size={17} style={{ color: status.storageBarColor }} />
            <div>
              <div className="text-[12px] font-bold" style={S_TEXT}>Browser Storage</div>
              <div className="text-[9px]" style={S_DIM}>Local cache only; Supabase files are managed from their feature pages.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Used" value={formatBytes(status.storageBytes)} />
            <Metric label="Estimated Quota" value="5.00 MB" />
            <Metric label="Total Keys" value={String(status.storageKeyCount)} />
            <Metric label="I-NET Keys" value={String(status.inetKeyCount)} />
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[9px]" style={S_MUTED}><span>CAPACITY</span><span>{status.storagePercent}%</span></div>
            <div className="h-3 overflow-hidden border border-[#242B59] bg-[#050718]">
              <div className="h-full transition-all" style={{ width: `${status.storagePercent}%`, background: status.storageBarColor }} />
            </div>
            {status.storageWarning && <div className="mt-2 text-[9px]" style={status.storageCritical ? S_RED : S_WARN}>{status.storageCritical ? "Critical capacity: automatic pruning may run." : "Storage is approaching browser capacity."}</div>}
          </div>
          <div className="mt-5 overflow-hidden border border-[#242B59]">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] bg-[#11163A] px-3 py-2 text-[9px]" style={S_MUTED}><span>LOCAL STORAGE KEY</span><span className="text-right">SIZE</span></div>
            <div className="max-h-80 overflow-y-auto">
              {status.storageKeys.length === 0 ? (
                <div className="p-5 text-center text-[10px]" style={S_DIM}>No local storage keys are available.</div>
              ) : status.storageKeys.map((entry) => (
                <div key={entry.key} className="grid grid-cols-[minmax(0,1fr)_100px] border-t border-[#171D40] px-3 py-2 text-[10px]">
                  <span className="truncate font-mono" style={S_TEXT}>{entry.key}</span>
                  <span className="text-right" style={S_DIM}>{formatBytes(entry.bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {view === "errors" && (
        <section className="p-4" style={PANEL}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-bold" style={S_TEXT}><AlertTriangle size={15} style={errorCount > 0 ? S_RED : S_GREEN} /> Error &amp; Report Log</div>
              <div className="mt-1 text-[9px]" style={S_DIM}>Runtime errors from this browser plus player reports delivered to the DM.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "error", "report"] as const).map((filter) => (
                <button key={filter} type="button" onClick={() => setErrorFilter(filter)} className="border px-2 py-1 text-[9px]" style={{ color: errorFilter === filter ? "#79B8FF" : "#8E9ABB", borderColor: errorFilter === filter ? "#4F8DFF" : "#28305F", background: errorFilter === filter ? "#101D42" : "#070A20" }}>{filter.toUpperCase()}</button>
              ))}
              {mergedErrorEntries.length > 0 && (
                <button type="button" onClick={() => void onClearErrors()} className={`${retro.button} flex items-center gap-1 px-2 py-1 text-[9px]`} style={S_RED}><Trash2 size={10} /> Clear All</button>
              )}
            </div>
          </div>
          {visibleErrors.length === 0 ? (
            <div className="border border-[#242B59] py-10 text-center text-[10px]" style={S_DIM}>No matching log entries.</div>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {visibleErrors.map((entry) => (
                <div key={entry.id} className="border p-3" style={{ borderColor: entry.type === "error" ? "#713447" : "#6A5726", background: entry.type === "error" ? "#1B0C16" : "#191508" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[9px]">
                        <span style={entry.type === "error" ? S_RED : S_WARN}>{entry.type.toUpperCase()}</span>
                        <span style={S_DIM}>{entry.timestamp}</span>
                        <span style={S_MUTED}>{entry.player}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5" style={S_TEXT}>{entry.message}</div>
                      {entry.source && <div className="mt-2 truncate font-mono text-[8px]" style={S_DIM}>{entry.source}</div>}
                    </div>
                    <button type="button" onClick={() => void onRemoveError(entry.id)} title="Remove entry" className="shrink-0 p-1" style={S_MUTED}><X size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "session" && (
        <section className="p-4" style={PANEL}>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck size={17} style={status.hasSessionToken ? S_GREEN : S_WARN} />
            <div>
              <div className="text-[12px] font-bold" style={S_TEXT}>Current Browser Session</div>
              <div className="text-[9px]" style={S_DIM}>Authentication state is shown without displaying credentials.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Profile" value={status.sessionPlayer} />
            <Metric label="Profile ID" value={status.sessionPlayerId} />
            <Metric label="Authentication" value={status.hasSessionToken ? "Session token present" : "No session token"} tone={status.hasSessionToken ? "good" : "warn"} />
            <Metric label="Page Duration" value={formatUptime(status.uptime)} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="p-3" style={SUB_PANEL}>
              <div className="text-[9px]" style={S_MUTED}>SESSION STARTED</div>
              <div className="mt-2 text-[12px]" style={S_TEXT}>{new Date(status.sessionStart).toLocaleString()}</div>
            </div>
            <div className="p-3" style={SUB_PANEL}>
              <div className="text-[9px]" style={S_MUTED}>HEALTH CHECKS THIS PAGE</div>
              <div className="mt-2 text-[12px]" style={S_TEXT}>{status.pingHistory.length} sent | {status.failedPings} failed</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatusSummary({
  icon: Icon,
  label,
  value,
  detail,
  color,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  value: string;
  detail: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="min-h-32 border p-4 text-left transition-colors hover:bg-[#0D1233]" style={PANEL}>
      <div className="flex items-center justify-between"><span className="text-[9px]" style={S_MUTED}>{label.toUpperCase()}</span><Icon size={15} style={{ color }} /></div>
      <div className="mt-4 text-[15px] font-bold" style={{ color }}>{value}</div>
      <div className="mt-2 text-[9px]" style={S_DIM}>{detail}</div>
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="min-h-20 p-3" style={SUB_PANEL}>
      <div className="text-[8px]" style={S_MUTED}>{label.toUpperCase()}</div>
      <div className="mt-2 break-words text-[12px]" style={tone === "good" ? S_GREEN : tone === "warn" ? S_WARN : S_TEXT}>{value}</div>
    </div>
  );
}

export default DMSystemStatus;
