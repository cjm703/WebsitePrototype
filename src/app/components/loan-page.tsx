import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  CircleAlert,
  Coins,
  Landmark,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  acceptCreditLoan,
  creditRequestId,
  loadCreditLoans,
  type CreditLoanState,
} from "@/lib/credits-api";
import { safeGetItem } from "./safe-storage";
import { playSuccessChime } from "./sound-effects";

const PANEL = { background: "#080B14", border: "1px solid #293149" } as const;
const MUTED = { color: "#7D879E" } as const;

type LoanRouteState = {
  reason?: "purchase" | "monthly";
  requiredAmount?: number;
  message?: string;
};

function money(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString()} CR`;
}

export function LoanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as LoanRouteState;
  const playerId = safeGetItem("inet-user-id") || "";
  const isDM = playerId === "dm";
  const [state, setState] = useState<CreditLoanState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [acceptedAmount, setAcceptedAmount] = useState(0);

  const refresh = useCallback(async () => {
    if (isDM) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setState(await loadCreditLoans());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Loan offers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isDM]);

  useEffect(() => { void refresh(); }, [refresh]);

  const accept = async (offerId: string) => {
    const offer = state?.offers.find((entry) => entry.id === offerId);
    if (!offer || busyId) return;
    setBusyId(offerId);
    setError("");
    setMessage("");
    try {
      const result = await acceptCreditLoan(offerId, creditRequestId(`loan:${offerId}`));
      setState({ account: result.account, offers: result.offers, loans: result.loans });
      setAcceptedAmount(result.loan.principal);
      setMessage(`${money(result.loan.principal)} was deposited into your Credits account.`);
      playSuccessChime();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "The loan could not be accepted.");
    } finally {
      setBusyId("");
    }
  };

  if (loading && !state) {
    return <main className="flex min-h-screen items-center justify-center bg-[#03050A] text-[#D7DEF0]"><LoaderCircle size={28} className="animate-spin" /></main>;
  }

  if (isDM) {
    return <main className="flex min-h-screen items-center justify-center bg-[#03050A] px-4 text-[#D7DEF0]"><section className="w-full max-w-md p-6 text-center" style={PANEL}><Landmark size={26} className="mx-auto text-[#CF7B86]" /><h1 className="mt-3 text-[14px] font-semibold">Player Loan Office</h1><p className="mt-2 text-[9px] leading-5" style={MUTED}>Loan offers belong to individual player Credits accounts.</p><button type="button" onClick={() => navigate("/interface/nexus-nomad")} className="mt-4 border border-[#303A53] bg-[#090D18] px-4 py-2 text-[9px]">Open Player Accounts</button></section></main>;
  }

  return <main className="min-h-screen bg-[#03050A] text-[#D7DEF0]">
    <style>{`
      @keyframes loan-credit-arrival {
        0% { opacity: 0; transform: translate(-50%, 18px) scale(0.88); }
        20% { opacity: 1; transform: translate(-50%, 0) scale(1.03); }
        76% { opacity: 1; transform: translate(-50%, -8px) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -30px) scale(0.96); }
      }
      .loan-credit-arrival { animation: loan-credit-arrival 1400ms ease-out forwards; }
      @media (prefers-reduced-motion: reduce) { .loan-credit-arrival { animation-duration: 1ms; } }
    `}</style>
    {acceptedAmount > 0 && <div className="loan-credit-arrival pointer-events-none fixed left-1/2 top-20 z-50 flex items-center gap-2 border border-[#4B6C56] bg-[#0A1911] px-4 py-3 text-[12px] font-semibold text-[#78DBA7]" onAnimationEnd={() => setAcceptedAmount(0)}><Coins size={15} />+{money(acceptedAmount)}</div>}

    <header className="border-b border-[#242C42] bg-[#070A12] px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center border border-[#303A53] bg-[#090D18]" title="Go back"><ArrowLeft size={14} /></button>
          <div className="flex h-9 w-9 items-center justify-center border border-[#653641] bg-[#1A0B10] text-[#F195A2]"><Landmark size={17} /></div>
          <div><h1 className="text-[16px] font-semibold">Loan</h1><div className="mt-0.5 text-[8px] uppercase" style={MUTED}>Private credit offers</div></div>
        </div>
        <button type="button" onClick={() => navigate("/interface/credits")} className="flex items-center gap-2 border border-[#665B2D] bg-[#181507] px-3 py-2 text-[9px] text-[#F0D36B]"><Coins size={12} />{money(state?.account.balance || 0)}</button>
      </div>
    </header>

    {(error || message) && <div className={`border-b px-5 py-2 text-center text-[9px] ${error ? "border-[#5B303A] bg-[#17090D] text-[#F29AA3]" : "border-[#285A47] bg-[#07140E] text-[#73D5A8]"}`}>{error || message}</div>}

    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6">
      {(routeState.message || routeState.requiredAmount) && <section className="mb-5 flex items-start gap-3 border border-[#633640] bg-[#17090D] p-4"><CircleAlert size={17} className="mt-0.5 shrink-0 text-[#F195A2]" /><div><div className="text-[11px] font-semibold text-[#F4B0BA]">Payment Required, funds insufficient</div><div className="mt-1 text-[9px] leading-5" style={MUTED}>{routeState.message || `${money(routeState.requiredAmount || 0)} in additional Credits is needed.`}</div></div></section>}

      <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-[12px] font-semibold">Available Offers</h2><div className="mt-1 text-[8px]" style={MUTED}>Larger principals carry consistently higher interest rates.</div></div><button type="button" onClick={() => void refresh()} disabled={loading} className="flex h-8 w-8 items-center justify-center border border-[#303A53] bg-[#090D18] disabled:opacity-40" title="Refresh loan account"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button></div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(state?.offers || []).map((offer) => <article key={offer.id} className="border border-[#2B3349] bg-[#080B14] p-4">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[13px] font-semibold">(Redacted)</div><div className="mt-1 flex items-center gap-1.5 text-[8px] uppercase" style={MUTED}><Building2 size={9} />{offer.agencyType}</div></div><BadgeDollarSign size={18} className="text-[#D5B85E]" /></div>
          <div className="mt-5 text-[8px] uppercase" style={MUTED}>Principal</div><div className="mt-1 text-[22px] font-mono font-semibold text-[#F0D36B]">{money(offer.principal)}</div>
          <div className="mt-4 grid grid-cols-2 border border-[#252D41]"><div className="p-3"><div className="text-[7px] uppercase" style={MUTED}>Interest</div><div className="mt-1 text-[12px] font-mono text-[#F195A2]">{offer.interestRate.toFixed(1)}%</div></div><div className="border-l border-[#252D41] p-3"><div className="text-[7px] uppercase" style={MUTED}>Total Owed</div><div className="mt-1 text-[12px] font-mono">{money(offer.repaymentTotal)}</div></div></div>
          <button type="button" onClick={() => void accept(offer.id)} disabled={Boolean(busyId)} className="mt-4 flex w-full items-center justify-center gap-2 border border-[#4C4323] bg-[#171407] px-3 py-2.5 text-[10px] font-semibold text-[#F0D36B] disabled:opacity-40">{busyId === offer.id ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{busyId === offer.id ? "Processing" : "Accept Loan"}</button>
        </article>)}
        {!error && (state?.offers.length || 0) === 0 && <div className="border border-[#293149] bg-[#080B14] p-8 text-center text-[9px]" style={MUTED}>No additional offers are available.</div>}
      </section>

      {(state?.loans.length || 0) > 0 && <section className="mt-7"><div className="mb-3 flex items-center gap-2 text-[12px] font-semibold"><Landmark size={13} className="text-[#F195A2]" />Active Agreements</div><div className="border border-[#293149] bg-[#080B14]">{state?.loans.map((loan, index) => <div key={loan.id} className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${index ? "border-t border-[#222A3D]" : ""}`}><div><div className="text-[10px] font-semibold">{loan.agencyName}</div><div className="mt-1 text-[8px]" style={MUTED}>{loan.agencyType} · accepted {new Date(loan.acceptedAt).toLocaleDateString()}</div></div><div className="text-[9px] font-mono text-[#F0D36B]">{money(loan.principal)} principal</div><div className="text-[9px] font-mono text-[#F195A2]">{money(loan.repaymentTotal)} owed</div></div>)}</div></section>}
    </div>
  </main>;
}

export default LoanPage;
