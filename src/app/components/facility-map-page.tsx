import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  Hammer,
  LoaderCircle,
  Lock,
  Map as MapIcon,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  UserRound,
} from "lucide-react";
import { appStore } from "@/lib/app-store";
import {
  applyFacilityAdditionAction,
  applyFacilityExpansionAction,
  saveOfficeState,
  subscribeToOfficeStateSignals,
  type FacilityAdditionAction,
} from "@/lib/office-state-api";
import {
  buildFacilityOfficeStateFallback,
  normalizeFacilityOfficeState,
  rebaseFacilityOfficeEdits,
  replaceFacilityInOfficeState,
  type FacilityOfficeState,
  type FacilityRecord,
} from "@/lib/facility-office-state";
import {
  calculateFacilityStats,
  calculateFacilityEconomy,
  facilitySecurityRisk,
  facilityStatDelta,
  personalFundBalance,
  type FacilityStats,
} from "@/lib/facility-depth-model";
import { countInstalledFacilityAdditions, type FacilityAddition } from "@/lib/business-map-model";
import { useInterfaceSession } from "./session-context";
import { IntelliLoadingMark } from "./intelli-loading-mark";
import { OfficeBusinessMap, type BusinessMapPlayerOption } from "./office-business-map";

type SaveState = "idle" | "saving" | "saved" | "error";

const TEXT = { color: "#E6EDF8" } as const;
const MUTED = { color: "#8490A7" } as const;
const DIM = { color: "#566176" } as const;

function FacilityStatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return <div><div className="mb-1 flex items-center justify-between text-[8px]"><span style={MUTED}>{label.toUpperCase()}</span><span className="font-mono" style={{ color }}>{bounded}/100</span></div><div className="h-2 overflow-hidden border border-[#253047] bg-[#05080E]"><div className="h-full transition-[width]" style={{ width: `${bounded}%`, background: color }} /></div></div>;
}

function FacilityOperationsPanel({ facility, current, preview, fundBalance, ownerName, isOwner, isDM, onOpenFinances }: { facility: FacilityRecord; current: FacilityStats; preview: FacilityStats; fundBalance: number; ownerName: string; isOwner: boolean; isDM: boolean; onOpenFinances: () => void }) {
  const expansions = facility.businessMap?.expansions || [];
  const economy = calculateFacilityEconomy(current, facility.staffCostPerPerson);
  const risk = facilitySecurityRisk(current.security);
  const hasPreview = Object.values(preview).some((value) => value !== 0);
  return (
    <div className="min-w-0">
      <div className="border-b border-[#20283A] pb-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold" style={TEXT}><Building2 size={14} color="#78B7FF" />Facility Operations</div>
        <div className="mt-2 flex items-center justify-between text-[9px]"><span style={DIM}>OWNER</span><span className="truncate" style={TEXT}>{ownerName || "Unassigned"}</span></div>
        <div className="mt-2 flex items-center justify-between text-[9px]"><span style={DIM}>ACCESS</span><span style={isDM || isOwner ? { color: "#62D6A6" } : MUTED}>{isDM ? "DM Control" : isOwner ? "Owner Control" : "Read Only"}</span></div>
        <div className="mt-2 border border-[#2B3549] bg-[#090E17] p-2.5">
          <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[9px]" style={MUTED}><Coins size={11} />Owner Personal Funds</span><strong className="text-[13px] font-mono text-[#F2D06B]">{fundBalance.toLocaleString()} CR</strong></div>
          <div className="mt-1 text-[7px]" style={DIM}>Current accounting period: Month {facility.currentMonth}</div>
        </div>
      </div>

      <div className="py-3">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase" style={MUTED}><TrendingUp size={12} />Live Facility Stats</div>
        <div className="space-y-3">
          <FacilityStatBar label="Appeal" value={current.appeal} color="#B99AF5" />
          <FacilityStatBar label="Condition" value={current.condition} color="#62D6A6" />
          <FacilityStatBar label={`Security · ${risk.label}`} value={current.security} color={risk.color} />
        </div>
        <div className="mt-3 space-y-1.5 border-t border-[#151C29] pt-2">
          <div className="flex items-center justify-between text-[8px]"><span style={MUTED}>GUEST CAPACITY</span><span className="font-mono" style={TEXT}>{current.capacity.toLocaleString()}</span></div>
          <div className="flex items-center justify-between text-[8px]"><span style={MUTED}>REVENUE POTENTIAL</span><span className="font-mono text-[#62D6A6]">{current.revenue.toLocaleString()} CR</span></div>
          <div className="flex items-center justify-between text-[8px]"><span style={MUTED}>MONTHLY UPKEEP</span><span className="font-mono text-[#F29AA3]">{current.monthlyUpkeep.toLocaleString()} CR</span></div>
          <div className="flex items-center justify-between text-[8px]"><span className="flex items-center gap-1" style={MUTED}><Users size={9} />STAFF PRESENT / REQUIRED</span><span className="font-mono" style={economy.staffPresent >= current.staffRequired ? { color: "#62D6A6" } : { color: "#F29AA3" }}>{economy.staffPresent} / {current.staffRequired}</span></div>
          <div className="flex items-center justify-between text-[8px]"><span style={MUTED}>MONTHLY STAFF PAYROLL</span><span className="font-mono" style={TEXT}>{economy.staffPayroll.toLocaleString()} CR</span></div>
        </div>
        {hasPreview && <div className="mt-2 border border-[#2A3650] bg-[#080D16] p-2 text-[7px]" style={DIM}>Selected addition preview: {preview.monthlyUpkeep >= 0 ? "+" : ""}{preview.monthlyUpkeep.toLocaleString()} CR upkeep · +{preview.staffRequired} required · +{preview.staffProvided} provided</div>}
        <button type="button" onClick={onOpenFinances} className="mt-3 flex w-full items-center justify-between border border-[#35506C] bg-[#0A1420] px-3 py-2.5 text-left hover:bg-[#0D1A29]"><span><span className="flex items-center gap-1.5 text-[9px] font-semibold" style={TEXT}><BarChart3 size={11} color="#79B8FF" />Monthly Revenue &amp; Expenses</span><span className="mt-1 block text-[7px]" style={DIM}>Preview Month {facility.currentMonth} and view prior reports</span></span><ArrowRight size={12} color="#79B8FF" /></button>
      </div>

      <div className="border-t border-[#20283A] pt-3">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase" style={MUTED}><Hammer size={12} />Development</div>
        <div className="space-y-2">
          {expansions.map((expansion) => (
            <div key={expansion.id} className="border p-3" style={{ borderColor: expansion.status === "complete" ? "#285A47" : expansion.status === "funded" ? "#765E24" : "#352A5C", background: expansion.status === "complete" ? "#06120D" : expansion.status === "funded" ? "#171205" : "#0C0818" }}>
              <div className="flex items-start justify-between gap-2"><span className="text-[9px] font-semibold" style={TEXT}>{expansion.name}</span>{expansion.status === "complete" ? <CheckCircle2 size={12} color="#62D6A6" /> : expansion.status === "funded" ? <LoaderCircle size={12} color="#F2D06B" /> : <Lock size={12} color="#9B8CFF" />}</div>
              <div className="mt-2 text-[8px]" style={MUTED}>{expansion.status === "complete" ? "Complete · two sections operational" : expansion.status === "funded" ? "Expansion underway · awaiting DM" : `${expansion.cost.toLocaleString()} ${expansion.currency}`}</div>
              {expansion.fundedBy && <div className="mt-1 text-[7px]" style={DIM}>Funded by {expansion.fundedBy}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FacilityMapPage() {
  const navigate = useNavigate();
  const { facilityId = "" } = useParams();
  const session = useInterfaceSession();
  const [office, setOffice] = useState<FacilityOfficeState | null>(null);
  const [players, setPlayers] = useState<BusinessMapPlayerOption[]>([]);
  const [previewAddition, setPreviewAddition] = useState<FacilityAddition | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const saveLoopPromiseRef = useRef<Promise<boolean> | null>(null);
  const saveStatusTimerRef = useRef<number | null>(null);
  const editSequenceRef = useRef(0);
  const latestRef = useRef<FacilityOfficeState | null>(null);
  const signalRef = useRef<ReturnType<typeof subscribeToOfficeStateSignals> | null>(null);

  const applyState = useCallback((raw: unknown) => {
    const normalized = normalizeFacilityOfficeState(raw);
    latestRef.current = normalized;
    setOffice(normalized);
    return normalized;
  }, []);

  const loadRemote = useCallback(async (showErrors = true) => {
    if (!showErrors && session.isDM && (saveTimerRef.current != null || saveInFlightRef.current || pendingSaveRef.current)) return;
    try {
      const raw = await appStore.loadNexusNomadState("default", buildFacilityOfficeStateFallback());
      applyState(raw);
      if (showErrors) setError("");
    } catch (loadError) {
      if (showErrors) setError(loadError instanceof Error ? loadError.message : "Facility state could not be loaded.");
    }
  }, [applyState, session.isDM]);

  useEffect(() => {
    void loadRemote();
    void appStore.listPlayers<Record<string, unknown> & { id: string }>().then((rows) => setPlayers(rows.map((row) => ({ id: String(row.id || ""), name: String(row.name || row.displayName || row.id || "Player") })).filter((row) => row.id && row.id !== "dm"))).catch(() => undefined);
  }, [loadRemote]);

  useEffect(() => {
    const signals = subscribeToOfficeStateSignals(() => void loadRemote(false));
    signalRef.current = signals;
    const interval = window.setInterval(() => void loadRemote(false), 4000);
    return () => {
      window.clearInterval(interval);
      signals.unsubscribe();
      if (signalRef.current === signals) signalRef.current = null;
    };
  }, [loadRemote]);

  useEffect(() => () => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current != null) window.clearTimeout(saveStatusTimerRef.current);
  }, []);

  const flushDMSave = useCallback((): Promise<boolean> => {
    if (!session.isDM) return Promise.resolve(false);
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (saveLoopPromiseRef.current) return saveLoopPromiseRef.current;

    const run = async () => {
      setSaveState("saving");
      if (saveStatusTimerRef.current != null) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }
      let conflictAttempts = 0;

      while (pendingSaveRef.current) {
        const pending = latestRef.current;
        if (!pending) break;
        const sequence = editSequenceRef.current;
        pendingSaveRef.current = false;
        saveInFlightRef.current = true;

        try {
          const saved = normalizeFacilityOfficeState(await saveOfficeState<FacilityOfficeState>(pending, pending.revision));
          conflictAttempts = 0;
          if (sequence === editSequenceRef.current && !pendingSaveRef.current) applyState(saved);
          else {
            const latest = latestRef.current;
            if (latest) {
              const rebased = normalizeFacilityOfficeState({ ...latest, revision: saved.revision, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
              latestRef.current = rebased;
              setOffice(rebased);
            }
          }
          setError("");
          void signalRef.current?.notify();
        } catch (saveError) {
          const message = saveError instanceof Error ? saveError.message : "Facility map could not be saved.";
          if (!/another client|revision conflict|OFFICE_REVISION_CONFLICT/i.test(message)) {
            setError(message);
            setSaveState("error");
            return false;
          }

          conflictAttempts += 1;
          if (conflictAttempts > 3) {
            pendingSaveRef.current = true;
            setError("The map changed in another session too many times. Save again after those changes settle.");
            setSaveState("error");
            return false;
          }

          try {
            const local = latestRef.current;
            const remoteRaw = await appStore.loadNexusNomadState("default", buildFacilityOfficeStateFallback());
            const remote = normalizeFacilityOfficeState(remoteRaw);
            if (local) {
              const rebased = rebaseFacilityOfficeEdits(local, remote, facilityId);
              latestRef.current = rebased;
              setOffice(rebased);
              pendingSaveRef.current = true;
            }
          } catch (refreshError) {
            setError(refreshError instanceof Error ? refreshError.message : message);
            setSaveState("error");
            return false;
          }
        } finally {
          saveInFlightRef.current = false;
        }
      }

      setSaveState("saved");
      saveStatusTimerRef.current = window.setTimeout(() => {
        setSaveState("idle");
        saveStatusTimerRef.current = null;
      }, 2400);
      return true;
    };

    const promise = run().finally(() => {
      saveLoopPromiseRef.current = null;
    });
    saveLoopPromiseRef.current = promise;
    return promise;
  }, [applyState, facilityId, session.isDM]);

  const queueDMSave = useCallback((next: FacilityOfficeState) => {
    latestRef.current = next;
    setOffice(next);
    if (!session.isDM) return;
    editSequenceRef.current += 1;
    pendingSaveRef.current = true;
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current != null) {
      window.clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = null;
    }
    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushDMSave();
    }, 500);
  }, [flushDMSave, session.isDM]);

  const saveNow = useCallback(() => {
    if (!session.isDM || !latestRef.current) return Promise.resolve(false);
    editSequenceRef.current += 1;
    pendingSaveRef.current = true;
    return flushDMSave();
  }, [flushDMSave, session.isDM]);

  const facility = office?.facilities.find((entry) => entry.id === facilityId) || null;
  const isOwner = Boolean(facility?.ownerPlayerId && facility.ownerPlayerId === session.playerId);
  const canManage = session.isDM || isOwner;
  const ownerName = players.find((player) => player.id === facility?.ownerPlayerId)?.name || facility?.ownerPlayerId || "";
  const fundBalance = office && facility ? personalFundBalance(office.personalFunds, facility.ownerPlayerId) : 0;
  const usage = useMemo(() => office ? countInstalledFacilityAdditions(office.facilities.map((entry) => entry.businessMap)) : {}, [office]);
  const currentStats = useMemo(() => facility?.businessMap && office ? calculateFacilityStats(facility.baseStats, facility.businessMap, office.facilityAdditions) : facility?.baseStats || null, [facility, office]);
  const previewStats = useMemo(() => facilityStatDelta(previewAddition), [previewAddition]);

  const updateFacility = useCallback((updates: Partial<FacilityRecord>) => {
    if (!office || !facility || !session.isDM) return;
    queueDMSave(replaceFacilityInOfficeState(office, { ...facility, ...updates }));
  }, [facility, office, queueDMSave, session.isDM]);

  const handlePlayerAction = useCallback(async (action: FacilityAdditionAction) => {
    const saved = await applyFacilityAdditionAction<FacilityOfficeState>(action);
    applyState(saved);
    void signalRef.current?.notify();
  }, [applyState]);

  const handleExpansion = useCallback(async (expansionId: string, action: "fund" | "complete") => {
    if (!facility) return;
    const saved = await applyFacilityExpansionAction<FacilityOfficeState>({ action, facilityId: facility.id, expansionId });
    applyState(saved);
    void signalRef.current?.notify();
  }, [applyState, facility]);

  const handlePreview = useCallback((addition: FacilityAddition | null) => setPreviewAddition(addition), []);

  if (!office) return <div className="flex min-h-screen items-center justify-center bg-[#030509]"><IntelliLoadingMark size={76} /></div>;
  if (!facility || !facility.businessMap) return <div className="min-h-screen bg-[#030509] p-8 text-white"><button type="button" onClick={() => navigate("/interface/nexus-nomad")} className="mb-6 flex items-center gap-2 text-[11px]" style={MUTED}><ArrowLeft size={13} />Back to Facilities</button><div className="border border-[#462F38] bg-[#14080C] p-5 text-[11px] text-[#F29AA3]">{error || "This facility does not have a map."}</div></div>;

  return (
    <main className="min-h-screen bg-[#030509] text-white">
      <header className="border-b border-[#20283A] bg-[#070B11] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate("/interface/nexus-nomad")} className="flex h-8 w-8 items-center justify-center border border-[#273146] bg-[#0A0F18]" title="Back to Facilities"><ArrowLeft size={14} /></button>
            <div className="flex h-9 w-9 items-center justify-center border border-[#35503F] bg-[#0A1711]"><Sparkles size={16} color="#73D5A8" /></div>
            <div className="min-w-0"><h1 className="truncate text-[16px] font-semibold" style={TEXT}>{facility.name}</h1><div className="mt-0.5 flex flex-wrap items-center gap-2 text-[8px]" style={MUTED}><span className="flex items-center gap-1"><MapIcon size={9} />Dedicated Facility Map</span><span>·</span><span>{facility.type}</span><span>·</span><span>{facility.status || "Active"}</span></div></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 border border-[#273146] bg-[#090E17] px-2 py-1.5 text-[8px]" style={isOwner ? { color: "#73D5A8" } : MUTED}>{session.isDM ? <Shield size={10} /> : <UserRound size={10} />}{session.isDM ? "DM" : isOwner ? "Owner" : "Viewer"}</span>
          </div>
        </div>
      </header>

      {error && <div className="border-b border-[#5A3038] bg-[#17090D] px-6 py-2 text-[9px] text-[#F29AA3]">{error}</div>}

      <div className="min-h-[calc(100vh-65px)]">
        <section className="min-w-0 p-4 lg:p-6">
          <OfficeBusinessMap
            value={facility.businessMap}
            onChange={(businessMap) => updateFacility({ businessMap })}
            isDM={session.isDM}
            facilities={office.facilities.map((entry) => ({ id: entry.id, name: entry.name }))}
            additions={office.facilityAdditions}
            onAdditionsChange={(facilityAdditions) => session.isDM && queueDMSave({ ...office, facilityAdditions })}
            additionUsage={usage}
            mapKey={facility.id}
            currentPlayerId={session.playerId}
            players={players}
            onPlayerAction={handlePlayerAction}
            canManageAdditions={canManage}
            onAdditionPreviewChange={handlePreview}
            onExpansionAction={handleExpansion}
            canFundExpansions={isOwner}
            personalFundBalance={fundBalance}
            operationsPanel={currentStats ? <FacilityOperationsPanel facility={facility} current={currentStats} preview={previewStats} fundBalance={fundBalance} ownerName={ownerName} isOwner={isOwner} isDM={session.isDM} onOpenFinances={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(facility.id)}/finances`)} /> : undefined}
            onSave={saveNow}
            saveState={saveState}
          />
        </section>
      </div>
    </main>
  );
}

export default FacilityMapPage;
