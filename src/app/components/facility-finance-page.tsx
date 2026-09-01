import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Coins,
  LoaderCircle,
  Save,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { appStore } from "@/lib/app-store";
import {
  advanceFacilityMonth,
  saveOfficeState,
  subscribeToOfficeStateSignals,
} from "@/lib/office-state-api";
import {
  buildFacilityOfficeStateFallback,
  normalizeFacilityOfficeState,
  replaceFacilityInOfficeState,
  type FacilityOfficeState,
} from "@/lib/facility-office-state";
import {
  calculateFacilityEconomy,
  calculateFacilityStats,
  facilitySecurityRisk,
  personalFundBalance,
  type FacilityMonthlyReport,
  type FacilityStats,
} from "@/lib/facility-depth-model";
import { useInterfaceSession } from "./session-context";
import { IntelliLoadingMark } from "./intelli-loading-mark";

const TEXT = { color: "#E6EDF8" } as const;
const MUTED = { color: "#8490A7" } as const;
const DIM = { color: "#566176" } as const;
const FIELD = { color: "#E6EDF8", borderColor: "#29354A", background: "#080D15" } as const;

function money(value: number) {
  return `${Math.round(value).toLocaleString()} CR`;
}

function signedMoney(value: number) {
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

function reportDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function NumberField({ label, value, onChange, suffix, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; min?: number; max?: number }) {
  return <label className="block"><span className="mb-1 block text-[8px] uppercase" style={MUTED}>{label}</span><span className="flex items-center border px-2" style={FIELD}><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.max(min, max == null ? Number(event.target.value) || 0 : Math.min(max, Number(event.target.value) || 0)))} className="min-w-0 flex-1 bg-transparent py-2 text-[11px] font-mono outline-none" />{suffix && <span className="text-[8px]" style={DIM}>{suffix}</span>}</span></label>;
}

function Meter({ label, value, color, detail }: { label: string; value: number; color: string; detail: string }) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return <div><div className="mb-1.5 flex items-center justify-between gap-3 text-[9px]"><span style={MUTED}>{label}</span><span className="font-mono" style={{ color }}>{bounded}/100 · {detail}</span></div><div className="h-2.5 overflow-hidden border border-[#263148] bg-[#05080D]"><div className="h-full" style={{ width: `${bounded}%`, background: color }} /></div></div>;
}

function ReportRow({ label, value, color = "#E6EDF8", strong = false }: { label: string; value: string; color?: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 border-b border-[#141B28] py-2 text-[9px] ${strong ? "font-semibold" : ""}`}><span style={MUTED}>{label}</span><span className="font-mono" style={{ color }}>{value}</span></div>;
}

function HistoryReport({ report }: { report: FacilityMonthlyReport }) {
  const positive = report.netIncome >= 0;
  return <details className="border border-[#202B3E] bg-[#080C13] open:border-[#35506C]"><summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3"><span><span className="block text-[11px] font-semibold" style={TEXT}>{report.label}</span><span className="mt-1 block text-[8px]" style={DIM}>{reportDate(report.advancedAt)} · advanced by {report.advancedBy || "DM"}</span></span><span className="text-right"><span className="block text-[12px] font-mono font-semibold" style={{ color: positive ? "#62D6A6" : "#F29AA3" }}>{signedMoney(report.netIncome)}</span><span className="mt-1 block text-[7px]" style={DIM}>{report.fundTransfer ? `${signedMoney(report.fundTransfer)} transferred` : "No fund transfer"}</span></span></summary><div className="grid gap-x-8 border-t border-[#202B3E] px-4 py-3 md:grid-cols-2"><div><ReportRow label="Adjusted revenue" value={money(report.adjustedRevenue)} color="#62D6A6" /><ReportRow label="Monthly upkeep" value={`-${money(report.monthlyUpkeep)}`} color="#F29AA3" /><ReportRow label="Staff payroll" value={`-${money(report.staffPayroll)}`} color="#F29AA3" /></div><div><ReportRow label="Staff present / required" value={`${report.staffPresent} / ${report.staffRequired}`} /><ReportRow label="Event adjustment" value={signedMoney(report.eventAdjustment)} /><ReportRow label="DM adjustment" value={signedMoney(report.manualAdjustment)} /></div>{report.note && <div className="mt-3 border-l-2 border-[#35506C] pl-3 text-[9px] leading-5 md:col-span-2" style={MUTED}>{report.note}</div>}{report.unpaidCosts > 0 && <div className="mt-3 text-[9px] text-[#F2B36E] md:col-span-2">{money(report.unpaidCosts)} could not be deducted from Personal Funds and remains recorded as unpaid costs.</div>}</div></details>;
}

export function FacilityFinancePage() {
  const navigate = useNavigate();
  const { facilityId = "" } = useParams();
  const session = useInterfaceSession();
  const [office, setOffice] = useState<FacilityOfficeState | null>(null);
  const [players, setPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [draftStats, setDraftStats] = useState<FacilityStats | null>(null);
  const [draftStaffCost, setDraftStaffCost] = useState(50);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [eventAdjustment, setEventAdjustment] = useState(0);
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);
  const signalRef = useRef<ReturnType<typeof subscribeToOfficeStateSignals> | null>(null);

  const applyState = useCallback((raw: unknown) => {
    const normalized = normalizeFacilityOfficeState(raw);
    setOffice(normalized);
    return normalized;
  }, []);

  const loadRemote = useCallback(async (showError = true) => {
    if (busyRef.current || dirty) return;
    try {
      applyState(await appStore.loadNexusNomadState("default", buildFacilityOfficeStateFallback()));
      if (showError) setError("");
    } catch (loadError) {
      if (showError) setError(loadError instanceof Error ? loadError.message : "Facility finances could not be loaded.");
    }
  }, [applyState, dirty]);

  useEffect(() => {
    void loadRemote();
    void appStore.listPlayers<Record<string, unknown> & { id: string }>().then((rows) => setPlayers(rows.map((row) => ({ id: String(row.id || ""), name: String(row.name || row.displayName || row.id || "Player") })).filter((row) => row.id && row.id !== "dm"))).catch(() => undefined);
  }, [loadRemote]);

  useEffect(() => {
    const signals = subscribeToOfficeStateSignals(() => void loadRemote(false));
    signalRef.current = signals;
    const interval = window.setInterval(() => void loadRemote(false), 5000);
    return () => { window.clearInterval(interval); signals.unsubscribe(); if (signalRef.current === signals) signalRef.current = null; };
  }, [loadRemote]);

  const facility = office?.facilities.find((entry) => entry.id === facilityId) || null;
  useEffect(() => {
    if (!facility || dirty) return;
    setDraftStats({ ...facility.baseStats });
    setDraftStaffCost(facility.staffCostPerPerson);
  }, [dirty, facility]);

  const ownerName = players.find((player) => player.id === facility?.ownerPlayerId)?.name || facility?.ownerPlayerId || "Unassigned";
  const fundBalance = office && facility ? personalFundBalance(office.personalFunds, facility.ownerPlayerId) : 0;
  const effectiveBaseStats = session.isDM && draftStats ? draftStats : facility?.baseStats || null;
  const currentStats = useMemo(() => facility?.businessMap && office && effectiveBaseStats ? calculateFacilityStats(effectiveBaseStats, facility.businessMap, office.facilityAdditions) : effectiveBaseStats, [effectiveBaseStats, facility, office]);
  const economy = useMemo(() => currentStats && facility ? calculateFacilityEconomy(currentStats, session.isDM ? draftStaffCost : facility.staffCostPerPerson, eventAdjustment, manualAdjustment) : null, [currentStats, draftStaffCost, eventAdjustment, facility, manualAdjustment, session.isDM]);
  const risk = facilitySecurityRisk(currentStats?.security || 0);
  const hasFundOwner = Boolean(facility?.ownerPlayerId && facility.ownerPlayerId !== "dm");
  const projectedTransfer = economy && hasFundOwner ? economy.netIncome >= 0 ? economy.netIncome : -Math.min(fundBalance, Math.abs(economy.netIncome)) : 0;
  const projectedUnpaid = economy?.netIncome && economy.netIncome < 0
    ? hasFundOwner ? Math.max(0, Math.abs(economy.netIncome) - fundBalance) : Math.abs(economy.netIncome)
    : 0;

  const changeStat = (key: keyof FacilityStats, value: number) => {
    if (!session.isDM || !draftStats) return;
    setDraftStats({ ...draftStats, [key]: value });
    setDirty(true);
    setMessage("");
  };

  const saveSettings = useCallback(async () => {
    if (!session.isDM || !office || !facility || !draftStats) return office;
    setSaving(true);
    busyRef.current = true;
    setError("");
    try {
      const updatedFacility = {
        ...facility,
        baseStats: draftStats,
        staffCostPerPerson: draftStaffCost,
        revenue: String(draftStats.revenue),
        expenses: String(draftStats.monthlyUpkeep),
        employeesOnSite: String(draftStats.staffProvided),
      };
      const next = replaceFacilityInOfficeState(office, updatedFacility);
      const saved = applyState(await saveOfficeState<FacilityOfficeState>(next, office.revision));
      setDirty(false);
      setMessage("Economy settings saved.");
      void signalRef.current?.notify();
      return saved;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Economy settings could not be saved.");
      return null;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }, [applyState, draftStaffCost, draftStats, facility, office, session.isDM]);

  const advanceMonth = async () => {
    if (!session.isDM || !facility || !economy) return;
    let latestOffice = office;
    if (dirty) latestOffice = await saveSettings();
    if (!latestOffice) return;
    const latestFacility = latestOffice.facilities.find((entry) => entry.id === facility.id);
    if (!latestFacility) return;
    const confirmed = window.confirm(`Close Month ${latestFacility.currentMonth} for ${latestFacility.name}? The report will be saved and ${signedMoney(projectedTransfer)} will be applied to ${ownerName}'s Personal Funds.`);
    if (!confirmed) return;
    setAdvancing(true);
    busyRef.current = true;
    setError("");
    setMessage("");
    try {
      const saved = applyState(await advanceFacilityMonth<FacilityOfficeState>({ facilityId: latestFacility.id, expectedMonth: latestFacility.currentMonth, eventAdjustment, manualAdjustment, note }));
      const advancedFacility = saved.facilities.find((entry) => entry.id === latestFacility.id);
      setEventAdjustment(0);
      setManualAdjustment(0);
      setNote("");
      setDirty(false);
      setMessage(`Month ${latestFacility.currentMonth} closed. Month ${advancedFacility?.currentMonth || latestFacility.currentMonth + 1} is now active.`);
      void signalRef.current?.notify();
    } catch (advanceError) {
      setError(advanceError instanceof Error ? advanceError.message : "The facility month could not be advanced.");
    } finally {
      busyRef.current = false;
      setAdvancing(false);
    }
  };

  if (!office) return <div className="flex min-h-screen items-center justify-center bg-[#030509]"><IntelliLoadingMark size={76} /></div>;
  if (!facility || !currentStats || !economy) return <main className="min-h-screen bg-[#030509] p-8 text-white"><button type="button" onClick={() => navigate("/interface/nexus-nomad")} className="mb-6 flex items-center gap-2 text-[11px]" style={MUTED}><ArrowLeft size={13} />Back to Facilities</button><div className="border border-[#462F38] bg-[#14080C] p-5 text-[11px] text-[#F29AA3]">{error || "This facility could not be found."}</div></main>;

  return <main className="min-h-screen bg-[#030509] text-white">
    <header className="border-b border-[#20283A] bg-[#070B11] px-4 py-3 lg:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => navigate(`/interface/nexus-nomad/facility/${encodeURIComponent(facility.id)}/map`)} className="flex h-8 w-8 items-center justify-center border border-[#273146] bg-[#0A0F18]" title="Back to facility map"><ArrowLeft size={14} /></button><div className="flex h-9 w-9 items-center justify-center border border-[#35506C] bg-[#09131F]"><CalendarClock size={16} color="#79B8FF" /></div><div className="min-w-0"><h1 className="truncate text-[16px] font-semibold" style={TEXT}>Monthly Revenue &amp; Expenses</h1><div className="mt-0.5 text-[8px]" style={MUTED}>{facility.name} · Month {facility.currentMonth} · {session.isDM ? "DM accounting controls" : "Read only"}</div></div></div><div className="flex items-center gap-2 border border-[#273146] bg-[#090E17] px-3 py-2 text-[9px]" style={MUTED}><Building2 size={11} />{ownerName}</div></div></header>

    {(error || message) && <div className={`border-b px-6 py-2 text-[9px] ${error ? "border-[#5A3038] bg-[#17090D] text-[#F29AA3]" : "border-[#285A47] bg-[#07140E] text-[#73D5A8]"}`}>{error || message}</div>}

    <div className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
      <section className="grid border border-[#202B3E] bg-[#070B12] sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Adjusted Revenue", money(economy.adjustedRevenue), "#62D6A6"],
          ["Monthly Upkeep", money(currentStats.monthlyUpkeep), "#F29AA3"],
          ["Staff Payroll", money(economy.staffPayroll), "#E7B66A"],
          ["Projected Net", signedMoney(economy.netIncome), economy.netIncome >= 0 ? "#62D6A6" : "#F29AA3"],
          ["Owner Funds", money(fundBalance), "#F2D06B"],
        ].map(([label, value, color], index) => <div key={label} className={`p-4 ${index ? "border-t border-[#202B3E] sm:border-l sm:border-t-0" : ""}`}><div className="text-[8px] uppercase" style={DIM}>{label}</div><div className="mt-2 text-[16px] font-mono font-semibold" style={{ color }}>{value}</div></div>)}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="border border-[#202B3E] bg-[#070B12] p-4"><div className="mb-4 flex items-center gap-2 text-[11px] font-semibold" style={TEXT}><TrendingUp size={13} color="#62D6A6" />Month {facility.currentMonth} Preview</div><div className="grid gap-6 md:grid-cols-2"><div><div className="mb-2 text-[8px] font-semibold uppercase" style={DIM}>Revenue</div><ReportRow label="Base revenue potential" value={money(currentStats.revenue)} /><ReportRow label={`Appeal multiplier (${currentStats.appeal}/100)`} value={`×${economy.appealMultiplier.toFixed(2)}`} /><ReportRow label={`Condition multiplier (${currentStats.condition}/100)`} value={`×${economy.conditionMultiplier.toFixed(2)}`} /><ReportRow label="Adjusted revenue" value={money(economy.adjustedRevenue)} color="#62D6A6" strong /></div><div><div className="mb-2 text-[8px] font-semibold uppercase" style={DIM}>Expenses</div><ReportRow label="Monthly upkeep" value={`-${money(currentStats.monthlyUpkeep)}`} color="#F29AA3" /><ReportRow label={`${economy.staffPresent} staff × ${money(session.isDM ? draftStaffCost : facility.staffCostPerPerson)}`} value={`-${money(economy.staffPayroll)}`} color="#F29AA3" /><ReportRow label="Total monthly costs" value={`-${money(economy.totalMonthlyCosts)}`} color="#F29AA3" strong /><ReportRow label="Net before adjustments" value={signedMoney(economy.adjustedRevenue - economy.totalMonthlyCosts)} color={economy.adjustedRevenue >= economy.totalMonthlyCosts ? "#62D6A6" : "#F29AA3"} strong /></div></div></section>

          <section className="grid gap-5 border border-[#202B3E] bg-[#070B12] p-4 md:grid-cols-2"><div><div className="mb-4 flex items-center gap-2 text-[11px] font-semibold" style={TEXT}><Shield size={13} color={risk.color} />Facility Risk</div><div className="space-y-4"><Meter label="Appeal" value={currentStats.appeal} color="#B99AF5" detail={`×${economy.appealMultiplier.toFixed(2)} revenue`} /><Meter label="Condition" value={currentStats.condition} color="#62D6A6" detail={`×${economy.conditionMultiplier.toFixed(2)} revenue`} /><Meter label="Security" value={currentStats.security} color={risk.color} detail={`${risk.label} · ${risk.chance}% event chance`} /></div></div><div><div className="mb-4 flex items-center gap-2 text-[11px] font-semibold" style={TEXT}><Users size={13} color="#79B8FF" />Staffing</div><ReportRow label="Staff required" value={currentStats.staffRequired.toLocaleString()} /><ReportRow label="Staff supplied by facility" value={currentStats.staffProvided.toLocaleString()} /><ReportRow label="Automatically hired" value={economy.autoHiredStaff.toLocaleString()} /><ReportRow label="Staff present" value={economy.staffPresent.toLocaleString()} color="#62D6A6" strong /><div className="mt-2 text-[8px] leading-4" style={DIM}>Staff shortages are filled automatically. Payroll is reported separately and never changes Monthly Upkeep.</div></div></section>

          {session.isDM && draftStats && <section className="border border-[#202B3E] bg-[#070B12] p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[11px] font-semibold" style={TEXT}>Base Economy Settings</div><div className="mt-1 text-[8px]" style={DIM}>Installed Facility Additions are calculated on top of these values.</div></div><button type="button" onClick={() => void saveSettings()} disabled={!dirty || saving || advancing} className="flex items-center gap-2 border border-[#355A47] bg-[#0A1711] px-3 py-2 text-[9px] text-[#73D5A8] disabled:opacity-35">{saving ? <LoaderCircle size={11} className="animate-spin" /> : <Save size={11} />}{saving ? "Saving" : "Save Settings"}</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><NumberField label="Guest Capacity" value={draftStats.capacity} onChange={(value) => changeStat("capacity", value)} /><NumberField label="Revenue Potential" value={draftStats.revenue} suffix="CR" onChange={(value) => changeStat("revenue", value)} /><NumberField label="Monthly Upkeep" value={draftStats.monthlyUpkeep} suffix="CR" onChange={(value) => changeStat("monthlyUpkeep", value)} /><NumberField label="Staff Cost / Person" value={draftStaffCost} suffix="CR" onChange={(value) => { setDraftStaffCost(value); setDirty(true); }} /><NumberField label="Appeal" value={draftStats.appeal} max={100} onChange={(value) => changeStat("appeal", value)} /><NumberField label="Condition" value={draftStats.condition} max={100} onChange={(value) => changeStat("condition", value)} /><NumberField label="Security" value={draftStats.security} max={100} onChange={(value) => changeStat("security", value)} /><NumberField label="Base Staff Present" value={draftStats.staffProvided} onChange={(value) => changeStat("staffProvided", value)} /><NumberField label="Base Staff Required" value={draftStats.staffRequired} onChange={(value) => changeStat("staffRequired", value)} /></div></section>}

          <section><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] font-semibold" style={TEXT}><CalendarClock size={13} color="#79B8FF" />Monthly Report History</div><span className="text-[8px]" style={DIM}>{facility.monthlyReports.length} reports</span></div><div className="space-y-2">{[...facility.monthlyReports].reverse().map((report) => <HistoryReport key={report.id} report={report} />)}{facility.monthlyReports.length === 0 && <div className="border border-[#202B3E] bg-[#070B12] py-10 text-center text-[9px]" style={DIM}>No months have been advanced for this facility.</div>}</div></section>
        </div>

        <aside className="self-start border border-[#2A3850] bg-[#080D16] p-4 xl:sticky xl:top-4"><div className="flex items-center gap-2 text-[11px] font-semibold" style={TEXT}><CalendarClock size={13} color="#79B8FF" />Advance Accounting Month</div>{session.isDM ? <><div className="mt-4 space-y-3"><NumberField label="Session Event Adjustment" value={eventAdjustment} min={-1000000000} suffix="CR" onChange={setEventAdjustment} /><NumberField label="DM Adjustment" value={manualAdjustment} min={-1000000000} suffix="CR" onChange={setManualAdjustment} /><label className="block"><span className="mb-1 block text-[8px] uppercase" style={MUTED}>Report Note</span><textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} rows={4} placeholder="Security events, unusual income, closures..." className="w-full resize-y border px-2 py-2 text-[10px] outline-none" style={FIELD} /></label></div><div className="mt-4 border-t border-[#263148] pt-3"><ReportRow label="Final net income" value={signedMoney(economy.netIncome)} color={economy.netIncome >= 0 ? "#62D6A6" : "#F29AA3"} strong /><ReportRow label="Personal Funds transfer" value={signedMoney(projectedTransfer)} color={projectedTransfer >= 0 ? "#F2D06B" : "#F29AA3"} />{projectedUnpaid > 0 && <ReportRow label="Projected unpaid costs" value={money(projectedUnpaid)} color="#F2B36E" />}</div><button type="button" onClick={() => void advanceMonth()} disabled={saving || advancing} className="mt-4 flex w-full items-center justify-center gap-2 border border-[#315C49] bg-[#0A1B13] px-3 py-3 text-[10px] font-semibold text-[#73D5A8] hover:bg-[#0D2419] disabled:opacity-40">{advancing ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{advancing ? "Advancing Month" : `Advance to Month ${facility.currentMonth + 1}`}</button><div className="mt-2 text-[7px] leading-4" style={DIM}>This closes Month {facility.currentMonth}, saves an immutable report, and applies the confirmed transfer once.</div></> : <div className="mt-4 border border-[#202B3E] bg-[#070B12] p-3 text-[9px] leading-5" style={MUTED}>Only the DM can close the current month. Players can view the live preview and every completed report.</div>}<div className="mt-4 border-t border-[#263148] pt-3"><div className="flex items-center justify-between text-[8px]"><span className="flex items-center gap-1" style={MUTED}><Coins size={9} />Owner Personal Funds</span><span className="font-mono text-[#F2D06B]">{money(fundBalance)}</span></div></div></aside>
      </div>
    </div>
  </main>;
}

export default FacilityFinancePage;
