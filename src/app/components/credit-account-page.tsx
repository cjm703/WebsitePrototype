import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  CircleAlert,
  Landmark,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { safeGetItem } from "./safe-storage";
import {
  adjustCredits,
  loadCreditAccount,
  reverseCreditTransaction,
  type CreditAccountDetail,
  type CreditTransaction,
} from "@/lib/credits-api";
import { appStore } from "@/lib/app-store";
import { buildFacilityOfficeStateFallback, type FacilityOfficeState } from "@/lib/facility-office-state";

const PANEL = { background: "#080B14", border: "1px solid #242C42" } as const;
const FIELD = { background: "#050812", border: "1px solid #303A53", color: "#D7DEF0" } as const;
const MUTED = { color: "#78839D" } as const;

function money(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString()} CR`;
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value)).toLocaleString()} CR`;
}

function transactionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CreditAccountPage() {
  const navigate = useNavigate();
  const { playerId = "" } = useParams();
  const currentPlayerId = safeGetItem("inet-user-id") || "";
  const isDM = currentPlayerId === "dm";
  const targetPlayerId = playerId || currentPlayerId;
  const [detail, setDetail] = useState<CreditAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"gain" | "spend">("gain");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [balanceAnimation, setBalanceAnimation] = useState<{ id: number; amount: number } | null>(null);
  const [monthlyPaymentDue, setMonthlyPaymentDue] = useState(0);

  const refresh = useCallback(async () => {
    if (!targetPlayerId || targetPlayerId === "dm") {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextDetail, office] = await Promise.all([
        loadCreditAccount(targetPlayerId),
        appStore.loadNexusNomadState<FacilityOfficeState>("default", buildFacilityOfficeStateFallback()).catch(() => null),
      ]);
      setDetail(nextDetail);
      const unpaidCosts = (office?.facilities || [])
        .filter((facility) => facility.ownerPlayerId === targetPlayerId)
        .flatMap((facility) => facility.monthlyReports || [])
        .reduce((total, report) => total + Math.max(0, Number(report.unpaidCosts) || 0), 0);
      setMonthlyPaymentDue(Math.max(0, unpaidCosts - nextDetail.account.balance));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The Credits account could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [targetPlayerId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const reversedIds = useMemo(() => new Set(
    (detail?.transactions || []).map((transaction) => transaction.reversalOf).filter(Boolean),
  ), [detail?.transactions]);
  const categories = useMemo(() => Array.from(new Set((detail?.transactions || []).map((entry) => entry.category))).sort(), [detail?.transactions]);
  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (detail?.transactions || []).filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!query) return true;
      return `${entry.reason} ${entry.source} ${entry.category} ${entry.actorId}`.toLowerCase().includes(query);
    });
  }, [category, detail?.transactions, search]);
  const totals = useMemo(() => (detail?.transactions || []).reduce((result, entry) => {
    if (entry.amount > 0) result.income += entry.amount;
    else result.spent += Math.abs(entry.amount);
    return result;
  }, { income: 0, spent: 0 }), [detail?.transactions]);

  if (!targetPlayerId || targetPlayerId === "dm") {
    return <main className="flex min-h-screen items-center justify-center bg-[#03050A] px-4 text-[#D7DEF0]">
      <section className="w-full max-w-md p-6 text-center" style={PANEL}>
        <Coins size={24} className="mx-auto text-[#F0D36B]" />
        <h1 className="mt-3 text-[14px] font-semibold">Choose a Player Account</h1>
        <p className="mt-2 text-[9px] leading-5" style={MUTED}>The DM profile has no Credits balance. Open Player Accounts in Company Facilities to inspect or adjust a player&apos;s account.</p>
        <button type="button" onClick={() => navigate("/interface/nexus-nomad")} className="mt-4 border border-[#303A53] bg-[#090D18] px-4 py-2 text-[9px]">Open Company Facilities</button>
      </section>
    </main>;
  }

  const submitAdjustment = async () => {
    const parsed = Math.max(0, Math.floor(Number(amount) || 0));
    if (!parsed || reason.trim().length < 2) {
      setError("Enter an amount and a short reason for the audit trail.");
      return;
    }
    setBusy("adjust");
    setError("");
    setMessage("");
    try {
      const result = await adjustCredits({ playerId: targetPlayerId, amount: mode === "gain" ? parsed : -parsed, reason: reason.trim() });
      setDetail((current) => current ? {
        account: result.account,
        transactions: [result.transaction, ...current.transactions.filter((entry) => entry.id !== result.transaction.id)],
      } : current);
      setBalanceAnimation({ id: Date.now(), amount: result.transaction.amount });
      setAmount("");
      setReason("");
      setMessage(`${mode === "gain" ? "Income" : "Expense"} recorded.`);
      await refresh();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "The adjustment could not be recorded.");
    } finally {
      setBusy("");
    }
  };

  const reverse = async (transaction: CreditTransaction) => {
    const reversalReason = window.prompt("Reason for reversing this transaction:", `Correction for: ${transaction.reason}`)?.trim();
    if (!reversalReason) return;
    setBusy(transaction.id);
    setError("");
    setMessage("");
    try {
      const result = await reverseCreditTransaction({ transactionId: transaction.id, reason: reversalReason });
      setDetail((current) => current ? {
        account: result.account,
        transactions: [result.transaction, ...current.transactions.filter((entry) => entry.id !== result.transaction.id)],
      } : current);
      setBalanceAnimation({ id: Date.now(), amount: result.transaction.amount });
      setMessage("Transaction reversed. The original entry remains in the audit trail.");
      await refresh();
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "The transaction could not be reversed.");
    } finally {
      setBusy("");
    }
  };

  if (loading && !detail) return <div className="flex min-h-screen items-center justify-center bg-[#03050A] text-[#D7DEF0]"><LoaderCircle size={28} className="animate-spin" /></div>;

  return <main className="min-h-screen bg-[#03050A] text-[#D7DEF0]">
    <style>{`
      @keyframes credit-balance-pulse-gain {
        0% { color: #F0D36B; text-shadow: none; transform: scale(1); }
        38% { color: #8BE7B8; text-shadow: 0 0 18px rgba(117, 213, 166, 0.55); transform: scale(1.045); }
        100% { color: #F0D36B; text-shadow: none; transform: scale(1); }
      }
      @keyframes credit-balance-pulse-spend {
        0% { color: #F0D36B; text-shadow: none; transform: scale(1); }
        38% { color: #F6A6B1; text-shadow: 0 0 18px rgba(241, 149, 162, 0.5); transform: scale(0.97); }
        100% { color: #F0D36B; text-shadow: none; transform: scale(1); }
      }
      @keyframes credit-change-rise {
        0% { opacity: 0; transform: translateY(7px) scale(0.9); }
        22% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-28px) scale(1.03); }
      }
      @keyframes credit-change-fall {
        0% { opacity: 0; transform: translateY(-7px) scale(0.9); }
        22% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(28px) scale(0.98); }
      }
      .credit-balance-pulse-gain { animation: credit-balance-pulse-gain 720ms ease-out; }
      .credit-balance-pulse-spend { animation: credit-balance-pulse-spend 720ms ease-out; }
      .credit-change-rise { animation: credit-change-rise 1050ms ease-out forwards; }
      .credit-change-fall { animation: credit-change-fall 1050ms ease-out forwards; }
      @media (prefers-reduced-motion: reduce) {
        .credit-balance-pulse-gain,
        .credit-balance-pulse-spend,
        .credit-change-rise,
        .credit-change-fall { animation-duration: 1ms; }
      }
    `}</style>
    <header className="border-b border-[#242C42] bg-[#070A12] px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center border border-[#303A53] bg-[#090D18]" title="Go back"><ArrowLeft size={14} /></button>
          <div className="flex h-9 w-9 items-center justify-center border border-[#665B2D] bg-[#181507] text-[#F0D36B]"><Coins size={17} /></div>
          <div className="min-w-0"><h1 className="truncate text-[16px] font-semibold">{detail?.account.playerName || "Credits Account"}</h1><div className="mt-0.5 text-[8px] uppercase" style={MUTED}>{isDM ? "DM account administration" : "Personal account"} · immutable audit history</div></div>
        </div>
        {isDM && <span className="flex items-center gap-1.5 border border-[#315043] bg-[#08130F] px-2.5 py-1.5 text-[8px] text-[#74D4A5]"><ShieldCheck size={11} />DM controls</span>}
      </div>
    </header>

    {(error || message) && <div className={`border-b px-5 py-2 text-center text-[9px] ${error ? "border-[#5B303A] bg-[#17090D] text-[#F29AA3]" : "border-[#285A47] bg-[#07140E] text-[#73D5A8]"}`}>{error || message}</div>}

    <div className="mx-auto max-w-[1320px] px-4 py-5 lg:px-6">
      {monthlyPaymentDue > 0 && <section className="mb-5 flex flex-wrap items-center gap-3 border border-[#633640] bg-[#17090D] p-4"><CircleAlert size={18} className="shrink-0 text-[#F195A2]" /><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold text-[#F4B0BA]">Payment Required, funds insufficient</div><div className="mt-1 text-[8px]" style={MUTED}>{money(monthlyPaymentDue)} is still needed to cover recorded monthly facility costs.</div></div>{!isDM && <button type="button" onClick={() => navigate("/interface/loan", { state: { reason: "monthly", requiredAmount: monthlyPaymentDue, message: `${money(monthlyPaymentDue)} is needed to cover recorded monthly facility costs.` } })} className="flex items-center gap-2 border border-[#70404A] bg-[#240D13] px-3 py-2 text-[9px] font-semibold text-[#F4B0BA]"><Landmark size={12} />Open Loan Page</button>}</section>}
      <section className="grid border border-[#283149] bg-[#080B14] sm:grid-cols-3">
        <div className="p-4 sm:border-r sm:border-[#283149]">
          <div className="text-[8px] uppercase" style={MUTED}>Available Credits</div>
          <div className="relative mt-2 inline-flex items-center">
            <div
              key={`balance-${balanceAnimation?.id || "idle"}`}
              className={`text-[24px] font-semibold text-[#F0D36B] ${balanceAnimation ? balanceAnimation.amount > 0 ? "credit-balance-pulse-gain" : "credit-balance-pulse-spend" : ""}`}
            >
              {money(detail?.account.balance || 0)}
            </div>
            {balanceAnimation && (
              <div
                key={balanceAnimation.id}
                className={`pointer-events-none absolute left-[calc(100%+12px)] top-1/2 whitespace-nowrap text-[11px] font-mono font-semibold ${balanceAnimation.amount > 0 ? "credit-change-rise text-[#75D5A6]" : "credit-change-fall text-[#F195A2]"}`}
                onAnimationEnd={() => setBalanceAnimation((current) => current?.id === balanceAnimation.id ? null : current)}
              >
                {signedMoney(balanceAnimation.amount)}
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-[#283149] p-4 sm:border-r sm:border-t-0"><div className="text-[8px] uppercase" style={MUTED}>Recent Income</div><div className="mt-2 text-[18px] font-semibold text-[#75D5A6]">+{money(totals.income)}</div></div>
        <div className="border-t border-[#283149] p-4 sm:border-t-0"><div className="text-[8px] uppercase" style={MUTED}>Recent Expenses</div><div className="mt-2 text-[18px] font-semibold text-[#F195A2]">-{money(totals.spent)}</div></div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="self-start p-4 lg:sticky lg:top-4" style={PANEL}>
          <div className="text-[11px] font-semibold">Record Money</div>
          <div className="mt-3 grid grid-cols-2 border border-[#303A53] p-1">
            <button type="button" onClick={() => setMode("gain")} className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[9px] ${mode === "gain" ? "bg-[#10241A] text-[#75D5A6]" : "text-[#78839D]"}`}><ArrowDownLeft size={12} />Gain</button>
            <button type="button" onClick={() => setMode("spend")} className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[9px] ${mode === "spend" ? "bg-[#281118] text-[#F195A2]" : "text-[#78839D]"}`}><ArrowUpRight size={12} />Spend</button>
          </div>
          <label className="mt-3 block"><span className="mb-1 block text-[8px] uppercase" style={MUTED}>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" step="1" className="w-full px-3 py-2 text-[12px] outline-none" style={FIELD} placeholder="0" /></label>
          <label className="mt-3 block"><span className="mb-1 block text-[8px] uppercase" style={MUTED}>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} rows={4} className="w-full resize-y px-3 py-2 text-[10px] outline-none" style={FIELD} placeholder={mode === "gain" ? "Income source..." : "What was purchased or paid for..."} /></label>
          <button type="button" disabled={busy === "adjust"} onClick={() => void submitAdjustment()} className={`mt-3 flex w-full items-center justify-center gap-2 border px-3 py-2.5 text-[10px] disabled:opacity-40 ${mode === "gain" ? "border-[#315B48] bg-[#0B1B13] text-[#75D5A6]" : "border-[#61343E] bg-[#1B0C11] text-[#F195A2]"}`}>{busy === "adjust" ? <LoaderCircle size={12} className="animate-spin" /> : mode === "gain" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}{mode === "gain" ? "Record Income" : "Record Expense"}</button>
          <div className="mt-3 text-[8px] leading-4" style={MUTED}>Changes apply immediately. Every entry records its author, reason, and resulting balance.</div>
        </aside>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-[12px] font-semibold">Account Activity</h2><div className="mt-1 text-[8px]" style={MUTED}>{detail?.transactions.length || 0} recent transactions</div></div>
            <div className="flex flex-1 justify-end gap-2 sm:flex-none">
              <label className="flex min-w-0 flex-1 items-center gap-2 px-2 sm:w-64" style={FIELD}><Search size={11} color="#78839D" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-[9px] outline-none" placeholder="Search activity..." /></label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="px-2 text-[9px] outline-none" style={FIELD}><option value="all">All categories</option>{categories.map((entry) => <option key={entry} value={entry}>{titleCase(entry)}</option>)}</select>
            </div>
          </div>

          <div className="mt-3 border border-[#242C42] bg-[#080B14]">
            {filteredTransactions.map((transaction, index) => {
              const positive = transaction.amount > 0;
              const reversed = reversedIds.has(transaction.id);
              const canReverse = isDM && !transaction.reversalOf && !reversed;
              return <div key={transaction.id} className={`grid gap-3 px-4 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] ${index ? "border-t border-[#20283A]" : ""}`}>
                <div className={`flex h-8 w-8 items-center justify-center border ${positive ? "border-[#315B48] bg-[#0A1912] text-[#75D5A6]" : "border-[#61343E] bg-[#190B10] text-[#F195A2]"}`}>{positive ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold">{transaction.reason}</span><span className="border border-[#303A53] px-1.5 py-0.5 text-[7px] uppercase" style={MUTED}>{titleCase(transaction.category)}</span>{reversed && <span className="border border-[#665B2D] px-1.5 py-0.5 text-[7px] uppercase text-[#E2C76A]">Reversed</span>}</div><div className="mt-1 text-[8px]" style={MUTED}>{transactionDate(transaction.createdAt)} · {titleCase(transaction.source)} · by {transaction.actorId}</div></div>
                <div className="flex items-center justify-between gap-3 sm:justify-end"><div className="text-right"><div className={`text-[11px] font-mono font-semibold ${positive ? "text-[#75D5A6]" : "text-[#F195A2]"}`}>{signedMoney(transaction.amount)}</div><div className="mt-1 text-[7px]" style={MUTED}>{money(transaction.balanceAfter)} after</div></div>{canReverse && <button type="button" disabled={Boolean(busy)} onClick={() => void reverse(transaction)} className="flex h-7 w-7 items-center justify-center border border-[#55472C] bg-[#161208] text-[#E2C76A] disabled:opacity-35" title="Reverse transaction"><RotateCcw size={11} className={busy === transaction.id ? "animate-spin" : ""} /></button>}</div>
              </div>;
            })}
            {filteredTransactions.length === 0 && <div className="py-12 text-center text-[9px]" style={MUTED}>No matching account activity.</div>}
          </div>
        </section>
      </div>
    </div>
  </main>;
}

export default CreditAccountPage;
