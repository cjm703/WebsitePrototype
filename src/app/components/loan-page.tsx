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

const PANEL = {
  background: "#0B0809",
  border: "1px solid #4B3032",
  boxShadow: "8px 9px 0 #020202, inset 0 0 26px #000000",
} as const;
const MUTED = { color: "#948584" } as const;
const OFFER_TILTS = ["-0.7deg", "0.45deg", "-0.25deg", "0.65deg", "-0.5deg", "0.3deg"];

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

  return <main className="loan-den min-h-screen overflow-hidden text-[#D8CFBF]">
    <style>{`
      @keyframes loan-credit-arrival {
        0% { opacity: 0; transform: translate(-50%, 18px) scale(0.88); }
        20% { opacity: 1; transform: translate(-50%, 0) scale(1.03); }
        76% { opacity: 1; transform: translate(-50%, -8px) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -30px) scale(0.96); }
      }
      @keyframes loan-sign-flicker {
        0%, 17%, 20%, 63%, 67%, 100% { opacity: 1; filter: drop-shadow(0 0 5px #8D232F); }
        18%, 65% { opacity: 0.42; filter: none; }
      }
      .loan-den {
        position: relative;
        font-family: "Courier New", monospace;
        background-color: #050405;
        background-image:
          linear-gradient(92deg, transparent 0 48%, rgba(112, 55, 47, 0.055) 49%, transparent 50%),
          repeating-linear-gradient(176deg, transparent 0 27px, rgba(213, 184, 94, 0.025) 28px, transparent 29px 47px);
      }
      .loan-den::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        opacity: 0.34;
        background-image:
          linear-gradient(17deg, transparent 0 31%, rgba(120, 24, 33, 0.13) 31.2%, transparent 31.6%),
          linear-gradient(163deg, transparent 0 72%, rgba(166, 130, 68, 0.08) 72.2%, transparent 72.5%);
      }
      .loan-den > * { position: relative; z-index: 1; }
      .loan-den-header {
        background: #080607;
        border-color: #4A282D;
        box-shadow: 0 6px 0 #020202, inset 0 -1px 0 #6F343A;
      }
      .loan-paper-title { font-family: Georgia, serif; font-style: italic; }
      .loan-sigil { animation: loan-sign-flicker 5.8s steps(1, end) infinite; }
      .loan-offer-card {
        position: relative;
        isolation: isolate;
        transform: rotate(var(--loan-tilt));
        border: 1px solid #59413B;
        background: #0D090A;
        box-shadow: 7px 8px 0 #020202, inset 0 0 30px rgba(0, 0, 0, 0.82);
        transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
      }
      .loan-offer-card::before {
        content: "";
        position: absolute;
        left: 14%;
        top: -3px;
        width: 42%;
        height: 5px;
        z-index: -1;
        background: #6E5A38;
        opacity: 0.62;
        transform: rotate(-1.5deg);
      }
      .loan-offer-card::after {
        content: "";
        position: absolute;
        right: 9px;
        bottom: 9px;
        width: 19px;
        height: 19px;
        border-right: 2px solid #6F2732;
        border-bottom: 2px solid #6F2732;
        opacity: 0.75;
      }
      .loan-offer-card:hover {
        transform: rotate(0deg) translateY(-2px);
        border-color: #80545A;
        box-shadow: 9px 11px 0 #020202, inset 0 0 30px rgba(0, 0, 0, 0.82);
      }
      .loan-redacted { font-family: Georgia, serif; font-style: italic; color: #D7C6B2; }
      .loan-contract-grid {
        border-color: #3F302D;
        background: #080607;
        box-shadow: inset 3px 3px 0 #030303;
      }
      .loan-accept {
        transform: rotate(0.25deg);
        border-color: #71323A;
        background: #210B0F;
        color: #E4B5A8;
        box-shadow: 3px 3px 0 #020202;
      }
      .loan-accept:hover { transform: rotate(-0.25deg); background: #311016; border-color: #A04A55; }
      .loan-ledger { border-color: #4B3734; background: #0B0809; box-shadow: 6px 7px 0 #020202; }
      .loan-credit-arrival { animation: loan-credit-arrival 1400ms ease-out forwards; }
      @media (prefers-reduced-motion: reduce) {
        .loan-credit-arrival { animation-duration: 1ms; }
        .loan-sigil { animation: none; }
        .loan-offer-card, .loan-accept { transition: none; transform: none; }
      }
    `}</style>
    {acceptedAmount > 0 && <div className="loan-credit-arrival pointer-events-none fixed left-1/2 top-20 z-50 flex items-center gap-2 border border-[#4B6C56] bg-[#0A1911] px-4 py-3 text-[12px] font-semibold text-[#78DBA7]" onAnimationEnd={() => setAcceptedAmount(0)}><Coins size={15} />+{money(acceptedAmount)}</div>}

    <header className="loan-den-header border-b px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center border border-[#56353A] bg-[#0B0708] text-[#B59E90] shadow-[3px_3px_0_#020202]" title="Go back"><ArrowLeft size={14} /></button>
          <div className="loan-sigil flex h-9 w-9 items-center justify-center border border-[#7B3039] bg-[#1A080B] text-[#C35460]"><Landmark size={17} /></div>
          <div><h1 className="loan-paper-title text-[17px] font-semibold text-[#D8C6AF]">Loan</h1><div className="mt-0.5 text-[8px] uppercase" style={MUTED}>Private credit offers</div></div>
        </div>
        <button type="button" onClick={() => navigate("/interface/credits")} className="flex items-center gap-2 border border-[#68542F] bg-[#130F08] px-3 py-2 text-[9px] text-[#CDB268] shadow-[3px_3px_0_#020202]"><Coins size={12} />{money(state?.account.balance || 0)}</button>
      </div>
    </header>

    {(error || message) && <div className={`border-b px-5 py-2 text-center text-[9px] ${error ? "border-[#5B303A] bg-[#17090D] text-[#F29AA3]" : "border-[#285A47] bg-[#07140E] text-[#73D5A8]"}`}>{error || message}</div>}

    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:px-6">
      {(routeState.message || routeState.requiredAmount) && <section className="mb-5 flex items-start gap-3 border border-[#633640] bg-[#17090D] p-4"><CircleAlert size={17} className="mt-0.5 shrink-0 text-[#F195A2]" /><div><div className="text-[11px] font-semibold text-[#F4B0BA]">Payment Required, funds insufficient</div><div className="mt-1 text-[9px] leading-5" style={MUTED}>{routeState.message || `${money(routeState.requiredAmount || 0)} in additional Credits is needed.`}</div></div></section>}

      <div className="mb-5 flex items-center justify-between gap-3 border-b border-dashed border-[#4D3334] pb-3"><div><h2 className="loan-paper-title text-[13px] font-semibold text-[#D4BEA5]">Available Offers</h2><div className="mt-1 text-[8px]" style={MUTED}>Larger principals carry consistently higher interest rates.</div></div><button type="button" onClick={() => void refresh()} disabled={loading} className="flex h-8 w-8 items-center justify-center border border-[#56353A] bg-[#0B0708] text-[#B59E90] shadow-[3px_3px_0_#020202] disabled:opacity-40" title="Refresh loan account"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /></button></div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(state?.offers || []).map((offer, index) => <article key={offer.id} className="loan-offer-card p-4" style={{ "--loan-tilt": OFFER_TILTS[index % OFFER_TILTS.length] } as React.CSSProperties}>
          <div className="flex items-start justify-between gap-3"><div><div className="loan-redacted text-[14px] font-semibold">(Redacted)</div><div className="mt-1 flex items-center gap-1.5 text-[8px] uppercase" style={MUTED}><Building2 size={9} />{offer.agencyType}</div></div><BadgeDollarSign size={18} className="text-[#A98C4D]" /></div>
          <div className="mt-5 text-[8px] uppercase" style={MUTED}>Principal</div><div className="mt-1 text-[22px] font-mono font-semibold text-[#CFB15F]">{money(offer.principal)}</div>
          <div className="loan-contract-grid mt-4 grid grid-cols-2 border"><div className="p-3"><div className="text-[7px] uppercase" style={MUTED}>Interest</div><div className="mt-1 text-[12px] font-mono text-[#C6656E]">{offer.interestRate.toFixed(1)}%</div></div><div className="border-l border-[#3F302D] p-3"><div className="text-[7px] uppercase" style={MUTED}>Total Owed</div><div className="mt-1 text-[12px] font-mono text-[#CFC3B2]">{money(offer.repaymentTotal)}</div></div></div>
          <button type="button" onClick={() => void accept(offer.id)} disabled={Boolean(busyId)} className="loan-accept mt-4 flex w-full items-center justify-center gap-2 border px-3 py-2.5 text-[10px] font-semibold disabled:opacity-40">{busyId === offer.id ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}{busyId === offer.id ? "Processing" : "Accept Loan"}</button>
        </article>)}
        {!error && (state?.offers.length || 0) === 0 && <div className="border border-[#293149] bg-[#080B14] p-8 text-center text-[9px]" style={MUTED}>No additional offers are available.</div>}
      </section>

      {(state?.loans.length || 0) > 0 && <section className="mt-8"><div className="loan-paper-title mb-3 flex items-center gap-2 text-[13px] font-semibold text-[#D4BEA5]"><Landmark size={13} className="text-[#B64A55]" />Active Agreements</div><div className="loan-ledger border">{state?.loans.map((loan, index) => <div key={loan.id} className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${index ? "border-t border-dashed border-[#4B3734]" : ""}`}><div><div className="loan-redacted text-[10px] font-semibold">{loan.agencyName}</div><div className="mt-1 text-[8px]" style={MUTED}>{loan.agencyType} · accepted {new Date(loan.acceptedAt).toLocaleDateString()}</div></div><div className="text-[9px] font-mono text-[#CFB15F]">{money(loan.principal)} principal</div><div className="text-[9px] font-mono text-[#C6656E]">{money(loan.repaymentTotal)} owed</div></div>)}</div></section>}
    </div>
  </main>;
}

export default LoanPage;
