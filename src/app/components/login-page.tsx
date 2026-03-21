import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_ACCENT, S_RED } from "./shared-styles";
import { LogIn, Shield, User, ChevronDown, X } from "lucide-react";
import { initialPlayers } from "./initial-data";
import { verifyAuthCode, getAuthStatuses, migrateAuthCodes } from "./auth-utils";
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";
import type { LoginProfile } from "./types";

// Legacy interface for reading old localStorage data during migration
interface LegacyProfile {
  id: string;
  name: string;
  authCode?: string;
  description: string;
}

const DM_PROFILE: LoginProfile = {
  id: "dm",
  name: "DM",
  hasAuthCode: true, // DM always has a code (seeded server-side)
  description: "System Administrator · Full Access",
};

function loadProfilesSync(): LoginProfile[] {
  try {
    // Primary source: build profiles directly from DM player data
    const playersRaw = safeGetItem("inet-dm-players");
    if (playersRaw) {
      const players: Array<{ id: string; name: string; class?: string; level?: number; authCode?: string }> = JSON.parse(playersRaw);
      const profiles: LoginProfile[] = players.map((p) => ({
        id: p.id,
        name: p.name,
        hasAuthCode: false, // will be resolved from server
        description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
      }));
      profiles.push(DM_PROFILE);
      return profiles;
    }

    // Fallback: read from inet-profiles (legacy / already synced)
    const raw = safeGetItem("inet-profiles");
    if (raw) {
      const parsed: LegacyProfile[] = JSON.parse(raw);
      const profiles: LoginProfile[] = parsed
        .filter((p) => p.id !== "dm")
        .map((p) => ({
          id: p.id,
          name: p.name,
          hasAuthCode: false,
          description: p.description,
        }));
      profiles.push(DM_PROFILE);
      return profiles;
    }
  } catch {}
  // Default if nothing in localStorage — use shared initial player data
  const fallbackProfiles: LoginProfile[] = initialPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    hasAuthCode: false,
    description: `${p.class || "Operative"} · Level ${p.level ?? 1}`,
  }));
  fallbackProfiles.push(DM_PROFILE);
  return fallbackProfiles;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<LoginProfile[]>(loadProfilesSync);
  const [selectedProfile, setSelectedProfile] = useState<LoginProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // On mount: migrate any legacy plain-text codes, then resolve auth statuses from server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Step 1: Migrate legacy plain-text auth codes to the server
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
          } catch { /* ignore corrupt inet-dm-players JSON */ }
        }
        // Also check legacy inet-profiles
        const legacyRaw = safeGetItem("inet-profiles");
        if (legacyRaw) {
          const legacy: LegacyProfile[] = JSON.parse(legacyRaw);
          for (const p of legacy) {
            if (p.id !== "dm" && p.authCode && !/^[0-9a-f]{64}$/i.test(p.authCode)) {
              // Only add if not already queued from inet-dm-players
              if (!codesToMigrate.some((c) => c.profileId === p.id)) {
                codesToMigrate.push({ profileId: p.id, plainCode: p.authCode });
              }
            }
          }
        }
        if (codesToMigrate.length > 0) {
          const migrated = await migrateAuthCodes(codesToMigrate);
          console.log(`Migrated ${migrated} legacy auth codes to server`);
          // Clean up: remove plain-text authCodes from localStorage
          if (playersRaw) {
            try {
              const players = JSON.parse(playersRaw);
              for (const p of players) {
                if (p.authCode && !/^[0-9a-f]{64}$/i.test(p.authCode)) {
                  p.authCode = ""; // Clear plain text
                }
              }
              safeSetJson("inet-dm-players", players);
            } catch {}
          }
        }
      } catch (err) {
        console.error("Auth code migration error:", err);
      }

      // Step 2: Resolve auth statuses from server
      try {
        const ids = profiles.map((p) => p.id);
        const statuses = await getAuthStatuses(ids);
        if (!cancelled) {
          setProfiles((prev) =>
            prev.map((p) => ({
              ...p,
              hasAuthCode: p.id === "dm" ? true : (statuses[p.id] ?? false),
            }))
          );
        }
      } catch (err) {
        console.error("Failed to fetch auth statuses from server:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
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
    if (connecting) return;
    if (!selectedProfile) {
      setError("SELECT AN AGENT PROFILE TO CONTINUE");
      return;
    }

    let result;

    try {
      // Verify auth code via server
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
        if (result.sessionToken) safeSetItem("inet-session-token", result.sessionToken);
      } catch {}

      navigate("/interface");
    }, 800);
  };

  const agentProfiles = profiles.filter((p) => p.id !== "dm");
  const dmProfile = profiles.find((p) => p.id === "dm") || DM_PROFILE;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(180deg, #0A0A3B 0%, #080830 40%, #060625 100%)",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Login Window */}
      <div className="w-full max-w-md">
        {/* Window Title Bar */}
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

        {/* Window Body */}
        <div
          className={`${retro.raised} bg-[#0E0E35] p-6`}
          style={{ borderTop: "none" }}
        >
          {/* Logo / Header */}
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

          {/* Divider */}
          <div className="mb-5">
            <div
              className="h-[2px] w-full"
              style={{
                background: "linear-gradient(90deg, transparent, #2A2A6B, transparent)",
              }}
            />
          </div>

          {/* Agent Profile Selector */}
          <form onSubmit={handleLogin}>
          <div className="mb-4">
            <div className="text-[11px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
              SELECT AGENT PROFILE
            </div>

            <div className="relative" ref={menuRef}>
              {/* Selector button */}
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
                      {selectedProfile.id === "dm" ? (
                        <Shield size={16} style={S_RED} />
                      ) : (
                        <User size={16} style={S_ACCENT} />
                      )}
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
                      onClick={(e) => { e.stopPropagation(); setSelectedProfile(null); setPassword(""); setError(""); }}
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

              {/* Dropdown menu */}
              {menuOpen && (
                <div
                  className="absolute left-0 right-0 z-50 mt-1 max-h-[240px] overflow-y-auto"
                  style={{
                    background: "#0C0C2E",
                    border: "2px solid #2A2A6B",
                    boxShadow: "4px 4px 0px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  {/* Agent profiles */}
                  {agentProfiles.length > 0 && (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="px-3 py-1.5" style={{ background: "#0A0A25", borderBottom: "1px solid #1A1A4B" }}>
                        <span className="text-[9px] tracking-wider" style={{ color: "#3A5A8A", fontWeight: 600 }}>AGENTS</span>
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
                    </div>
                  )}

                  {/* DM profile */}
                  <div className="px-3 py-1.5" style={{ background: "#0A0A25", borderBottom: "1px solid #1A1A4B", borderTop: agentProfiles.length > 0 ? "1px solid #2A2A5B" : "none" }}>
                    <span className="text-[9px] tracking-wider" style={{ color: "#3A5A8A", fontWeight: 600 }}>ADMINISTRATOR</span>
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

          {/* Password Field */}
          <div className="mb-4">
            <div className="text-[11px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
              AUTHORIZATION CODE
            </div>
            <div className={`${retro.sunken} bg-[#0C0C2E] flex items-center`}>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
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

          {/* Error Message */}
          {error && (
            <div
              className={`${retro.sunken} bg-[#1A0A0A] p-2 mb-4 text-center text-[11px]`}
              style={{ color: "#FF6A6A", border: "1px solid #4A1A1A" }}
            >
              {error}
            </div>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={connecting}
            className={`${retro.button} w-full py-3 text-[13px] flex items-center justify-center gap-2 tracking-wide ${
              connecting ? "opacity-60" : ""
            }`}
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

          {/* Footer */}
          <div className="mt-5 text-center">
            <div
              className="h-[1px] w-full mb-3"
              style={{ background: "linear-gradient(90deg, transparent, #1A1A4B, transparent)" }}
            />
            <p className="text-[9px]" style={{ color: "#2A3A5A" }}>
              Intelli Corporation™ &copy; 2026 · Secure Access Terminal
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