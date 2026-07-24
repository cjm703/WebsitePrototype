import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_ACCENT, S_RED } from "./shared-styles";
import { LogIn, Shield, User, ChevronDown, X } from "lucide-react";
import { initialPlayers } from "./initial-data";
import { verifyAuthCode, getAuthStatuses } from "./auth-utils";
import { safeSetItem } from "./safe-storage";
import type { LoginProfile } from "./types";
import {
  buildSupabasePublicHeaders,
  supabaseFunctionBase,
} from "@/lib/supabase-env";
import { IntelliLoadingMark } from "./intelli-loading-mark";

const DM_PROFILE: LoginProfile = {
  id: "dm",
  name: "DM",
  hasAuthCode: true,
  description: "System Administrator · Full Access",
};

const API_BASE = `${supabaseFunctionBase}/auth-codes`;

async function fetchProfilesFromServer(): Promise<LoginProfile[]> {
  const res = await fetch(`${API_BASE}/profiles`, {
    method: "GET",
    headers: buildSupabasePublicHeaders(false),
  });

  if (!res.ok) {
    throw new Error(`Failed to load profiles: ${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray((data as any)?.profiles) ? (data as any).profiles : [];

  return rows
    .filter((p: any) => String(p?.id) !== "dm")
    .map((p: any) => ({
      id: String(p.id),
      name: String(p.name ?? p.id),
      hasAuthCode: false,
      description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
    }));
}

function buildFallbackProfiles(): LoginProfile[] {
  const baseProfiles = Array.isArray(initialPlayers)
    ? initialPlayers
        .filter((p: any) => String(p?.id) !== "dm")
        .map((p: any) => ({
          id: String(p.id),
          name: String(p.name ?? p.id),
          hasAuthCode: false,
          description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
        }))
    : [];

  return [...baseProfiles, DM_PROFILE];
}

function LoadingLogo() {
  return (
    <>
      <style>{`
        @keyframes icorp-pulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="flex flex-col items-center justify-center">
        <IntelliLoadingMark />

        <div
          className="mt-6 text-[11px] tracking-[0.35em]"
          style={{
            color: "#9cb8ff",
            fontWeight: 700,
            animation: "icorp-pulse 1.4s ease-in-out infinite",
          }}
        >
          SYNCING PROFILES
        </div>
        <div className="mt-2 text-[10px]" style={{ color: "#6e8edc" }}>
          Contacting Intelli secure profile registry...
        </div>
      </div>
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<LoginProfile[]>(buildFallbackProfiles);
  const [selectedProfile, setSelectedProfile] = useState<LoginProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let nextProfiles: LoginProfile[] = buildFallbackProfiles();

      try {
        const serverProfiles = await fetchProfilesFromServer();
        nextProfiles = [...serverProfiles, DM_PROFILE];
      } catch (err) {
        console.error("Failed to fetch profiles from server, using built-in fallback:", err);
      }

      try {
        const ids = nextProfiles.map((p) => p.id);
        const statuses = await getAuthStatuses(ids);

        if (!cancelled) {
          setProfiles(
            nextProfiles.map((p) => ({
              ...p,
              hasAuthCode: p.id === "dm" ? true : (statuses[p.id] ?? false),
            }))
          );
        }
      } catch (err) {
        console.error("Failed to fetch auth statuses from server:", err);
        if (!cancelled) {
          setProfiles(
            nextProfiles.map((p) => ({
              ...p,
              hasAuthCode: p.id === "dm" ? true : false,
            }))
          );
        }
      } finally {
        if (!cancelled) {
          setProfilesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
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
    if (connecting || profilesLoading) return;

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
      try { if (result.sessionToken) safeSetItem("inet-session-token", result.sessionToken); } catch {}
      navigate("/interface");
    }, 800);
  };

  const agentProfiles = profiles.filter((p) => p.id !== "dm");
  const dmProfile = profiles.find((p) => p.id === "dm") || DM_PROFILE;

  if (profilesLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "radial-gradient(circle at center, #123b8a 0%, #0A2870 28%, #071d52 55%, #041233 100%)",
          fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
        }}
      >
        <LoadingLogo />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(180deg, #0A0A3B 0%, #080830 40%, #060625 100%)",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      <div className="w-full max-w-md">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: "linear-gradient(90deg, #1A1A5B, #2A2A7B, #1A1A5B)",
            borderTop: "2px solid #3A3A8B",
            borderLeft: "2px solid #3A3A8B",
            borderRight: "2px solid #050520",
          }}
        >
          <div className="flex gap-1.5">
            <div className="w-3 h-3" style={{ background: "#2A2A6B", border: "1px solid #3A3A8B" }} />
            <div className="w-3 h-3" style={{ background: "#2A2A6B", border: "1px solid #3A3A8B" }} />
          </div>
          <span className="text-[12px] flex-1 text-center" style={{ color: "#C0D0F0", fontWeight: 600 }}>
            I-NET SECURE LOGIN
          </span>
          <div className="w-3 h-3" style={{ background: "#2A2A6B", border: "1px solid #3A3A8B" }} />
        </div>

        <div className={`${retro.raised} bg-[#0E0E35] p-6`} style={{ borderTop: "none" }}>
          <div className="text-center mb-6">
            <h1
              className="text-[36px] tracking-tight mb-1"
              style={{
                color: "#4A7BFF",
                fontWeight: 700,
                fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
                textShadow: "2px 2px 0px #0A0A3B, 0 0 15px rgba(74, 123, 255, 0.3)",
              }}
            >
              I-NET
            </h1>
            <p className="text-[10px] tracking-[0.3em]" style={S_MUTED}>
              AN INTELLI CORPORATION PRODUCT
            </p>
          </div>

          <div className="mb-5">
            <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, transparent, #2A2A6B, transparent)" }} />
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <div className="text-[11px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
                SELECT AGENT PROFILE
              </div>

              <div className="relative" ref={menuRef}>
                <div
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-all cursor-pointer ${retro.sunken} bg-[#0C0C2E] hover:bg-[#0E0E32]`}
                  style={{
                    border: selectedProfile ? `1px solid ${selectedProfile.id === "dm" ? "#FF6A6A40" : "#4A7BFF40"}` : "1px solid #1A1A4B",
                  }}
                >
                  {selectedProfile ? (
                    <div style={DISPLAY_CONTENTS}>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-1.5`}>
                        {selectedProfile.id === "dm" ? <Shield size={16} style={S_RED} /> : <User size={16} style={S_ACCENT} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] truncate" style={{ color: selectedProfile.id === "dm" ? "#FF6A6A" : "#C0D0F0", fontWeight: 600 }}>
                          {selectedProfile.name}
                        </div>
                        <div className="text-[9px]" style={S_MUTED}>
                          {selectedProfile.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProfile(null);
                          setPassword("");
                          setError("");
                        }}
                        className="shrink-0 p-0.5 hover:opacity-80"
                        style={S_MUTED}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={DISPLAY_CONTENTS}>
                      <div className={`${retro.sunken} bg-[#0A0A28] p-1.5`}>
                        <User size={16} style={S_DIM} />
                      </div>
                      <div className="flex-1">
                        <div className="text-[12px]" style={S_MUTED}>
                          Choose a profile...
                        </div>
                      </div>
                      <ChevronDown size={14} style={S_MUTED} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                    </div>
                  )}
                </div>

                {menuOpen && (
                  <div
                    className="absolute left-0 right-0 z-50 mt-1 max-h-[240px] overflow-y-auto"
                    style={{
                      background: "#0C0C2E",
                      border: "2px solid #2A2A6B",
                      boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    {agentProfiles.length > 0 && (
                      <>
                        <div className="px-3 py-1.5" style={{ background: "#0A0A25", borderBottom: "1px solid #1A1A4B" }}>
                          <span className="text-[9px] tracking-wider" style={{ color: "#3A5A8A", fontWeight: 600 }}>
                            AGENTS
                          </span>
                        </div>
                        {agentProfiles.map((profile) => (
                          <button
                            type="button"
                            key={profile.id}
                            onClick={() => handleSelectProfile(profile)}
                            className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-[#1A1A5B] transition-colors"
                            style={{ borderBottom: "1px solid #1A1A3B" }}
                          >
                            <div className={`${retro.sunken} bg-[#0A0A28] p-1.5`}>
                              <User size={14} style={S_ACCENT} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] truncate" style={{ color: "#C0D0F0", fontWeight: 600 }}>
                                {profile.name}
                              </div>
                              <div className="text-[9px]" style={S_MUTED}>
                                {profile.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    <div
                      className="px-3 py-1.5"
                      style={{
                        background: "#0A0A25",
                        borderBottom: "1px solid #1A1A4B",
                        borderTop: agentProfiles.length > 0 ? "1px solid #2A2A5B" : "none",
                      }}
                    >
                      <span className="text-[9px] tracking-wider" style={{ color: "#3A5A8A", fontWeight: 600 }}>
                        ADMINISTRATOR
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectProfile(dmProfile)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-[#1A1A5B] transition-colors"
                    >
                      <div className={`${retro.sunken} bg-[#0A0A28] p-1.5`}>
                        <Shield size={14} style={S_RED} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] truncate" style={{ color: "#FF6A6A", fontWeight: 600 }}>
                          {dmProfile.name}
                        </div>
                        <div className="text-[9px]" style={S_MUTED}>
                          {dmProfile.description}
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[11px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
                AUTHORIZATION CODE
              </div>
              <div className={`${retro.sunken} bg-[#0C0C2E] flex items-center`}>
                <input
                  id="login-authorization-code"
                  name="authorizationCode"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter access code..."
                  autoComplete="off"
                  className="flex-1 px-3 py-2.5 bg-transparent outline-none text-[13px]"
                  style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
                />
              </div>
              {selectedProfile && !selectedProfile.hasAuthCode && (
                <div className="text-[9px] mt-1" style={{ color: "#4A9A5A" }}>
                  No code required for this profile
                </div>
              )}
              {selectedProfile && selectedProfile.hasAuthCode && (
                <div className="text-[9px] mt-1" style={S_MUTED}>
                  Enter the authorization code to continue
                </div>
              )}
              {!selectedProfile && (
                <div className="text-[9px] mt-1" style={S_DIM}>
                  Select a profile first
                </div>
              )}
            </div>

            {error && (
              <div className={`${retro.sunken} bg-[#1A0A0A] p-2 mb-4 text-center text-[11px]`} style={{ color: "#FF6A6A", border: "1px solid #4A1A1A" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={connecting}
              className={`${retro.button} w-full py-3 text-[13px] flex items-center justify-center gap-2 tracking-wide ${connecting ? "opacity-60" : ""}`}
              style={{ color: "#C0D0F0", fontWeight: 600 }}
            >
              {connecting ? (
                <div style={DISPLAY_CONTENTS}>
                  <span className="inline-block animate-pulse">ESTABLISHING CONNECTION...</span>
                </div>
              ) : (
                <div style={DISPLAY_CONTENTS}>
                  <LogIn size={16} />
                  AUTHENTICATE &amp; CONNECT
                </div>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <div className="h-[1px] w-full mb-3" style={{ background: "linear-gradient(90deg, transparent, #1A1A4B, transparent)" }} />
            <p className="text-[9px]" style={{ color: "#2A3A5A" }}>
              Intelli Corporation™ © 2026 · Secure Access Terminal
            </p>
            <p className="text-[8px] mt-1" style={{ color: "#1A2A4A" }}>
              Unauthorized access is monitored and logged
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
