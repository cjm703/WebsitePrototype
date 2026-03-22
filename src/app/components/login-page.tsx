import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_ACCENT, S_RED } from "./shared-styles";
import { LogIn, Shield, User, ChevronDown, X } from "lucide-react";
import { initialPlayers } from "./initial-data";
import { verifyAuthCode, getAuthStatuses, migrateAuthCodes } from "./auth-utils";
import { safeGetItem, safeSetItem } from "./safe-storage";
import type { LoginProfile } from "./types";

interface LegacyProfile {
  id: string;
  name: string;
  authCode?: string;
  description: string;
}

const DM_PROFILE: LoginProfile = {
  id: "dm",
  name: "DM",
  hasAuthCode: true,
  description: "System Administrator · Full Access",
};

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8a5950b5/auth-codes`;

async function fetchProfilesFromServer(): Promise<LoginProfile[]> {
  const res = await fetch(`${API_BASE}/profiles`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`Failed to load profiles: ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.profiles) ? data.profiles : [];
  return rows.map((p: any) => ({
    id: String(p.id),
    name: String(p.name ?? p.id),
    hasAuthCode: false,
    description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
  }));
}

function fallbackProfiles(): LoginProfile[] {
  const profiles: LoginProfile[] = initialPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    hasAuthCode: false,
    description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
  }));
  profiles.push(DM_PROFILE);
  return profiles;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<LoginProfile[]>(fallbackProfiles);
  const [selectedProfile, setSelectedProfile] = useState<LoginProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const codesToMigrate: Array<{ profileId: string; plainCode: string }> = [];
        const playersRaw = safeGetItem("inet-dm-players");
        if (playersRaw) {
          try {
            const players: Array<{ id: string; authCode?: string }> = JSON.parse(playersRaw);
            for (const p of players) {
              if (p.authCode && !/^[0-9a-f]{64}$/i.test(p.authCode)) {
                codesToMigrate.push({ profileId: p.id, plainCode: p.authCode });
              }
            }
          } catch {}
        }
        const legacyRaw = safeGetItem("inet-profiles");
        if (legacyRaw) {
          try {
            const legacy: LegacyProfile[] = JSON.parse(legacyRaw);
            for (const p of legacy) {
              if (p.id !== "dm" && p.authCode && !/^[0-9a-f]{64}$/i.test(p.authCode)) {
                if (!codesToMigrate.some((c) => c.profileId === p.id)) {
                  codesToMigrate.push({ profileId: p.id, plainCode: p.authCode });
                }
              }
            }
          } catch {}
        }
        if (codesToMigrate.length > 0) {
          await migrateAuthCodes(codesToMigrate);
        }
      } catch (err) {
        console.error("Auth code migration error:", err);
      }

      try {
        const serverProfiles = await fetchProfilesFromServer();
        const withDm = [...serverProfiles.filter((p) => p.id !== "dm"), DM_PROFILE];
        const statuses = await getAuthStatuses(withDm.map((p) => p.id));
        if (!cancelled) {
          setProfiles(withDm.map((p) => ({ ...p, hasAuthCode: p.id === "dm" ? true : (statuses[p.id] ?? false) })));
        }
      } catch (err) {
        console.error("Failed to fetch auth statuses/profiles from server:", err);
        try {
          const statuses = await getAuthStatuses(fallbackProfiles().map((p) => p.id));
          if (!cancelled) {
            setProfiles(fallbackProfiles().map((p) => ({ ...p, hasAuthCode: p.id === "dm" ? true : (statuses[p.id] ?? false) })));
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleSelectProfile = (profile: LoginProfile) => {
    setSelectedProfile(profile);
    setMenuOpen(false);
    setError("");
    setPassword("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    if (!selectedProfile) {
      setError("SELECT AN AGENT PROFILE TO CONTINUE");
      return;
    }
    let result: Awaited<ReturnType<typeof verifyAuthCode>>;
    try {
      result = await verifyAuthCode(selectedProfile.id, password);
      if (!result.valid) {
        setError("INVALID AUTHORIZATION CODE");
        return;
      }
    } catch (err) {
      console.error("Auth verification error:", err);
      setError("CONNECTION ERROR — TRY AGAIN");
      return;
    }
    setConnecting(true);
    setError("");
    setTimeout(() => {
      try { safeSetItem("inet-user", selectedProfile.name); } catch {}
      try { safeSetItem("inet-user-id", result.playerId ?? selectedProfile.id); } catch {}
      try {
        if (result.sessionToken) {
          safeSetItem("inet-session-token", result.sessionToken);
        }
      } catch {}
      navigate("/interface");
    }, 800);
  };

  const agentProfiles = profiles.filter((p) => p.id !== "dm");
  const dmProfile = profiles.find((p) => p.id === "dm") || DM_PROFILE;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={DISPLAY_CONTENTS}>
      <form onSubmit={handleLogin} className={`w-full max-w-[520px] ${retro.panel}`}>
        <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: "#1A1A4B" }}>
          <div className="text-[13px] tracking-[0.18em] font-bold">I-NET SECURE LOGIN</div>
          <Shield size={16} style={S_ACCENT} />
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="text-[28px] font-bold tracking-[0.2em]">I-NET</div>
            <div className="text-[11px]" style={S_MUTED}>AN INTELLI CORPORATION PRODUCT</div>
          </div>
          <div className="h-px bg-[#1A1A4B]" />
          <div ref={menuRef} className="relative">
            <div className="text-[11px] mb-2" style={S_DIM}>SELECT AGENT PROFILE</div>
            <button type="button" onClick={() => setMenuOpen(!menuOpen)} className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-all cursor-pointer ${retro.sunken} bg-[#0C0C2E] hover:bg-[#0E0E32]`}>
              {selectedProfile ? (
                <>
                  {selectedProfile.id === "dm" ? <Shield size={16} /> : <User size={16} />}
                  <div className="flex-1">
                    <div>{selectedProfile.name}</div>
                    <div className="text-[11px]" style={S_MUTED}>{selectedProfile.description}</div>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedProfile(null); setPassword(""); setError(""); }} className="shrink-0 p-0.5 hover:opacity-80" style={S_MUTED}><X size={14} /></button>
                </>
              ) : (
                <><User size={16} /><div className="flex-1">Choose a profile...</div></>
              )}
              <ChevronDown size={16} />
            </button>
            {menuOpen && (
              <div className="absolute z-20 mt-1 w-full border bg-[#0C0C2E]" style={{ borderColor: "#1A1A4B" }}>
                {agentProfiles.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-[10px]" style={S_DIM}>AGENTS</div>
                    {agentProfiles.map((profile) => (
                      <button key={profile.id} type="button" onClick={() => handleSelectProfile(profile)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-[#1A1A5B] transition-colors" style={{ borderBottom: "1px solid #1A1A3B" }}>
                        <User size={16} />
                        <div>
                          <div>{profile.name}</div>
                          <div className="text-[11px]" style={S_MUTED}>{profile.description}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                <div className="px-3 py-2 text-[10px]" style={S_DIM}>ADMINISTRATOR</div>
                <button type="button" onClick={() => handleSelectProfile(dmProfile)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-[#1A1A5B] transition-colors">
                  <Shield size={16} />
                  <div>
                    <div>{dmProfile.name}</div>
                    <div className="text-[11px]" style={S_MUTED}>{dmProfile.description}</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] mb-2 block" style={S_DIM}>AUTHORIZATION CODE</label>
            <div className={`flex items-center ${retro.sunken} bg-[#0C0C2E]`}>
              <LogIn size={16} className="ml-3" style={S_MUTED} />
              <input
                type="password"
                name="authorizationCode"
                id="authorizationCode"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter access code..."
                autoComplete="off"
                className="flex-1 px-3 py-2.5 bg-transparent outline-none text-[13px]"
                style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
              />
            </div>
            {selectedProfile && !selectedProfile.hasAuthCode && <div className="text-[11px] mt-2" style={S_MUTED}>No code required for this profile</div>}
            {selectedProfile && selectedProfile.hasAuthCode && <div className="text-[11px] mt-2" style={S_MUTED}>Enter the authorization code to continue</div>}
            {!selectedProfile && <div className="text-[11px] mt-2" style={S_MUTED}>Select a profile first</div>}
          </div>

          {error && <div className="text-[11px]" style={S_RED}>{error}</div>}

          <button type="submit" className="w-full py-3 font-bold tracking-[0.12em]" disabled={connecting}>
            {connecting ? "ESTABLISHING CONNECTION..." : "AUTHENTICATE & CONNECT"}
          </button>

          <div className="text-[10px] pt-2" style={S_MUTED}>
            Intelli Corporation™ © 2026 · Secure Access Terminal
            <div>Unauthorized access is monitored and logged</div>
          </div>
        </div>
      </form>
    </div>
  );
}
