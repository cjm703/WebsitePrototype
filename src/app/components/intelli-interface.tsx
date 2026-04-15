import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { logoutPlayerSession } from "@/lib/player-state-api";
import { useNavigate, Navigate } from "react-router";
import { retro } from "./retro-styles";
import { S_MUTED, S_SUBTLE, S_TEXT, S_RED, S_ACCENT, S_GREEN_BTN, SUNKEN_INPUT } from "./shared-styles";
import { Search, FileText, Building2, Map, ShieldAlert, LogOut, Bell, User, ArrowRight, AlertCircle, X, History, Trash2, ChevronDown, ChevronRight, MessageSquareWarning, Send, Cat, Paintbrush, Users, CalendarDays, Cloud, CloudRain, CloudDrizzle, CloudLightning, CloudFog, Snowflake, Wind, Store } from "lucide-react";
import { submitReport } from "./error-logger";
import { safeGetItem, safeRemoveItem, safeGetJson, safeSetJson } from "./safe-storage";
import mascotImg from "@/assets/figma/Gnarpy_Boss1.png";
import { playRandomMascotSound } from "./mascot-sounds";
import { getPlayerTheme, getPlacedStickers, buildPageGradient, isGradient, firstColor, ts, getSlot, type PlayerTheme, type PlacedSticker } from "./player-theme";
import { usePageVisibility } from "./use-visibility";
import { ServerStatusPanel } from "./server-status-panel";
import { loadOfficeName } from "./nexus-nomad";
import { STICKER_IMAGES } from "./sticker-images";
import type { DMNotification } from "./types";
import { appStore } from "@/lib/app-store";
import { buildSupabasePublicHeaders, supabaseFunctionBase } from "@/lib/supabase-env";

export function IntelliInterface() {
  const navigate = useNavigate();
  const isPageVisible = usePageVisibility();
  const [query, setQuery] = useState("");
  const motdRef = useRef<HTMLSpanElement>(null);

  // Read user from localStorage, redirect to login if not found
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const REPORT_API_BASE = supabaseFunctionBase;

  // Player theme
  const theme = getPlayerTheme();
  const placedStickers = getPlacedStickers();

  const DEFAULT_SECTION_DETAILS = {
    personalFiles: "View and manage your character sheet",
    inetSearch: "Browse the I-Net encyclopedia.",
    nexusNomad: "Company headquarters and operations.",
    intelliMaps: "13 sectors · Hexagonal deep city map with fog of war and path connections.",
    dmArea: "Campaign management tools.",
    community: "Share updates and messages with your party.",
    sessionLog: "Chronicle your campaign adventures.",
  };

  const DEFAULT_CALENDAR = { month: 1, day: 1, year: 1, isStarfall: false };
  const DEFAULT_WEATHER = {
    condition: "Overcast",
    temperature: "Cool",
    wind: "Light breeze",
    description: "A thick gray blanket of clouds hangs over The Great City.",
  };
  const DEFAULT_BORED_LINES = [
    "Hey there! You look like you could use some excitement...",
    "I'm just vibing. What about you?",
    "Did you know there are secret corners of I-Net most people never find?",
    "Psst... keep clicking if you dare.",
    "I've been sitting here for ages. Entertain me!",
    "Meow? ...I mean, hello fellow human.",
  ];

  const assignedToMatches = (assignedTo: unknown, playerId: string) =>
    Array.isArray(assignedTo)
      ? assignedTo.includes(playerId) || assignedTo.includes("all")
      : assignedTo === playerId || assignedTo === "all";

  const [sectionDetails, setSectionDetails] = useState(DEFAULT_SECTION_DETAILS);
  const [calendarState, setCalendarState] = useState(DEFAULT_CALENDAR);
  const [weatherState, setWeatherState] = useState(DEFAULT_WEATHER);
  const [boredLines, setBoredLines] = useState<string[]>(DEFAULT_BORED_LINES);

  // Notification types & state

  interface DisplayNotification {
    id: string;
    subject: string;
    preview: string;
    fullMessage: string;
    timestamp: string;
  }

  // Load all DM notifications, filter for current user, then split into active/past
  const buildUserNotifications = (all: DMNotification[]): { active: DisplayNotification[]; past: DisplayNotification[] } => {
    try {
      const readIds: string[] = safeGetJson(`inet-read-${currentUser}`, []);
      const deletedIds: string[] = safeGetJson(`inet-deleted-${currentUser}`, []);

      const forUser = all.filter((n) =>
        Array.isArray(n.assignedTo) && (n.assignedTo.includes("ALL") || n.assignedTo.includes(currentUser))
      );

      const toDisplay = (n: DMNotification): DisplayNotification => ({
        id: n.id,
        subject: n.subject,
        preview: n.message.length > 80 ? n.message.slice(0, 80) + "..." : n.message,
        fullMessage: n.message,
        timestamp: n.createdAt,
      });

      const active: DisplayNotification[] = [];
      const past: DisplayNotification[] = [];
      for (const n of forUser) {
        if (deletedIds.includes(n.id)) continue;
        if (readIds.includes(n.id)) past.push(toDisplay(n));
        else active.push(toDisplay(n));
      }
      return { active, past };
    } catch {
      return { active: [], past: [] };
    }
  };

  const [notifData, setNotifData] = useState<{ active: DisplayNotification[]; past: DisplayNotification[] }>({ active: [], past: [] });
  const [openNotification, setOpenNotification] = useState<DisplayNotification | null>(null);
  const [showPastNotifs, setShowPastNotifs] = useState(false);
  const [expandedPastId, setExpandedPastId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateDashboardState = async () => {
      try {
        const [players, items, cards, infos, notifications, sessions, calendarWeatherState] = await Promise.all([
          appStore.listPlayers<any>().catch(() => [] as any[]),
          appStore.listItems<any>().catch(() => [] as any[]),
          appStore.listCards<any>().catch(() => [] as any[]),
          appStore.listInfos<any>().catch(() => [] as any[]),
          appStore.listNotifications<DMNotification>().catch(() => [] as DMNotification[]),
          appStore.loadSessionLogState<Array<{ id: string }>>([]).catch(() => [] as Array<{ id: string }>),
          appStore.loadCalendarWeatherState<any>({}).catch(() => ({})),
        ]);

        if (cancelled) return;

        const playerRows = Array.isArray(players) ? players : [];
        const itemRows = Array.isArray(items) ? items : [];
        const cardRows = Array.isArray(cards) ? cards : [];
        const infoRows = Array.isArray(infos) ? infos : [];
        const notifRows = Array.isArray(notifications) ? notifications : [];
        const sessionRows = Array.isArray(sessions) ? sessions : [];

        const me = playerRows.find((p) => p?.name === currentUser);
        const personalFiles = me
          ? `${me.class || "Operative"} level ${me.level ?? 1} · HP: ${me.currentHP ?? me.hp ?? 0}/${me.maxHP ?? me.maxHp ?? 0}`
          : DEFAULT_SECTION_DETAILS.personalFiles;
        const myItems = me ? itemRows.filter((i) => assignedToMatches(i?.assignedTo, me.id)).length : 0;
        const myCards = me ? cardRows.filter((c) => assignedToMatches(c?.assignedTo, me.id)).length : 0;
        const personalSuffix = me ? ` · ${myItems} item${myItems !== 1 ? "s" : ""} · ${myCards} card${myCards !== 1 ? "s" : ""}` : "";
        const totalPages = itemRows.length + cardRows.length + infoRows.length;

        setSectionDetails({
          personalFiles: personalFiles + personalSuffix,
          inetSearch: `Browse the I-Net encyclopedia. Currently ${totalPages} article${totalPages !== 1 ? "s" : ""} indexed.`,
          nexusNomad: `${playerRows.length} active agent${playerRows.length !== 1 ? "s" : ""} · ${itemRows.length} item${itemRows.length !== 1 ? "s" : ""} cataloged`,
          intelliMaps: DEFAULT_SECTION_DETAILS.intelliMaps,
          dmArea: `${playerRows.length} player${playerRows.length !== 1 ? "s" : ""} · ${itemRows.length} item${itemRows.length !== 1 ? "s" : ""} · ${cardRows.length} card${cardRows.length !== 1 ? "s" : ""} · ${infoRows.length} info entr${infoRows.length !== 1 ? "ies" : "y"} · ${notifRows.length} notification${notifRows.length !== 1 ? "s" : ""}`,
          community: DEFAULT_SECTION_DETAILS.community,
          sessionLog: `${sessionRows.length} session${sessionRows.length !== 1 ? "s" : ""} recorded · Chronicle your campaign adventures.`,
        });

        const nextCalendar = calendarWeatherState?.calendar && typeof calendarWeatherState.calendar === "object"
          ? { ...DEFAULT_CALENDAR, ...calendarWeatherState.calendar }
          : DEFAULT_CALENDAR;
        const nextWeather = calendarWeatherState?.weather && typeof calendarWeatherState.weather === "object"
          ? { ...DEFAULT_WEATHER, ...calendarWeatherState.weather }
          : DEFAULT_WEATHER;
        setCalendarState(nextCalendar);
        setWeatherState(nextWeather);
        if (Array.isArray(calendarWeatherState?.boredLines) && calendarWeatherState.boredLines.length > 0) {
          setBoredLines(calendarWeatherState.boredLines.map((line: unknown) => String(line)).filter(Boolean));
        }

        setNotifData(buildUserNotifications(notifRows));
      } catch {
        if (!cancelled) {
          setSectionDetails(DEFAULT_SECTION_DETAILS);
          setCalendarState(DEFAULT_CALENDAR);
          setWeatherState(DEFAULT_WEATHER);
          setNotifData({ active: [], past: [] });
        }
      }
    };

    void hydrateDashboardState();
    const onFocus = () => { void hydrateDashboardState(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [currentUser]);

  const handleReadNotification = (notif: DisplayNotification) => {
    setOpenNotification(notif);
    // Persist read state
    try {
      const readIds: string[] = safeGetJson(`inet-read-${currentUser}`, []);
      if (!readIds.includes(notif.id)) {
        safeSetJson(`inet-read-${currentUser}`, [...readIds, notif.id]);
      }
    } catch {}
    // Move from active to past in local state
    setNotifData((prev) => ({
      active: prev.active.filter((n) => n.id !== notif.id),
      past: [notif, ...prev.past.filter((n) => n.id !== notif.id)],
    }));
  };

  const handleDeletePastNotification = (id: string) => {
    // Persist deleted state
    try {
      const deletedIds: string[] = safeGetJson(`inet-deleted-${currentUser}`, []);
      if (!deletedIds.includes(id)) {
        safeSetJson(`inet-deleted-${currentUser}`, [...deletedIds, id]);
      }
    } catch {}
    setNotifData((prev) => ({
      ...prev,
      past: prev.past.filter((n) => n.id !== id),
    }));
    if (expandedPastId === id) setExpandedPastId(null);
  };

  // Report Problem state
  const [reportText, setReportText] = useState("");
  const [reportSent, setReportSent] = useState(false);

  const handleSendReport = async () => {
    const trimmed = reportText.trim();
    if (!trimmed) return;

    const sessionToken = safeGetItem("inet-session-token") || "";
    const now = new Date();
    const timestamp = `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

    try {
      const res = await fetch(`${REPORT_API_BASE}/player/report-notification`, {
        method: "POST",
        headers: {
          ...buildSupabasePublicHeaders(true),
          "X-Session-Token": sessionToken,
        },
        body: JSON.stringify({
          subject: `[Player Report] ${currentUser || "Unknown Player"}`,
          message: trimmed,
          createdAt: timestamp,
          playerName: currentUser || "Unknown Player",
          playerId: currentUserId || "",
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : `Request failed: ${res.status}`);
      }

      submitReport(`[${currentUser || "Unknown Player"}${currentUserId ? ` / ${currentUserId}` : ""}] ${trimmed}`);
      setReportText("");
      setReportSent(true);
      setTimeout(() => setReportSent(false), 3000);
    } catch (err) {
      console.error("Failed to submit player report to DM notifications:", err);
      submitReport(`[FAILED_REMOTE][${currentUser || "Unknown Player"}${currentUserId ? ` / ${currentUserId}` : ""}] ${trimmed}`);
      setReportText("");
      setReportSent(true);
      setTimeout(() => setReportSent(false), 3000);
    }
  };

  // "Are you Bored?" character state
  const [boredSpeech, setBoredSpeech] = useState<string | null>(null);
  const boredClickTimesRef = useRef<number[]>([]);


  const handleBoredClick = useCallback(() => {
    // Show a random speech line
    if (boredLines.length > 0) {
      setBoredSpeech(boredLines[Math.floor(Math.random() * boredLines.length)]);
    }

    // Track rapid clicks for secret navigation
    const now = Date.now();
    boredClickTimesRef.current.push(now);
    // Keep only clicks in the last 3 seconds
    boredClickTimesRef.current = boredClickTimesRef.current.filter(t => now - t < 3000);
    if (boredClickTimesRef.current.length >= 10) {
      boredClickTimesRef.current = [];
      navigate("/interface/game");
    }

    // Play a random sound
    playRandomMascotSound();
  }, [boredLines, navigate]);

  const messagePool = ["Blobgorb"];

  const { message, color, rotation } = useMemo(() => {
    const msg = messagePool[Math.floor(Math.random() * messagePool.length)];
    const hue = Math.floor(Math.random() * 360);
    const sat = 60 + Math.floor(Math.random() * 40);
    const light = 50 + Math.floor(Math.random() * 30);
    const randomColor = `hsl(${hue}, ${sat}%, ${light}%)`;
    const rot = Math.floor(Math.random() * 31) - 15;
    return { message: msg, color: randomColor, rotation: rot };
  }, []);

  useEffect(() => {
    if (!isPageVisible) return;
    let animId: number;
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) / 1000;

      const rotSwing = Math.sin(elapsed * 1.5) * 8;
      const scalePulse = 1 + Math.sin(elapsed * 2.2) * 0.06;

      if (motdRef.current) {
        motdRef.current.style.transform = `rotate(${rotation + rotSwing}deg) scale(${scalePulse})`;
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [rotation, isPageVisible]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/interface/inet-search?q=${encodeURIComponent(query)}`);
  };

  const handleLogout = async () => {
    try {
      await logoutPlayerSession();
    } catch (err) {
      console.warn("Session logout failed:", err);
    } finally {
      safeRemoveItem("inet-user");
      safeRemoveItem("inet-user-id");
      safeRemoveItem("inet-session-token");
      navigate("/");
    }
  };

  const sections = [
    {
      name: "I-Net Wiki",
      path: "/interface/inet-search",
      icon: Search,
      description: "Browse the I-Net encyclopedia",
      details: sectionDetails.inetSearch
    },
    {
      name: "Community",
      path: "/interface/community",
      icon: Users,
      description: "Share updates and messages with your party",
      details: sectionDetails.community,
    },
    {
      name: "Commerce",
      path: "/interface/commerce",
      icon: Store,
      description: "Browse shops and trade with merchants",
      details: `Marketplace for buying and selling goods.`,
    },
    {
      name: "Personal Files",
      path: "/interface/personal-files",
      icon: FileText,
      description: "View and manage your character sheet",
      details: sectionDetails.personalFiles
    },
    {
      name: loadOfficeName(),
      path: "/interface/nexus-nomad",
      icon: Building2,
      description: "Company headquarters and operations",
      details: sectionDetails.nexusNomad
    },
    {
      name: "Intelli Maps",
      path: "/interface/intelli-maps",
      icon: Map,
      description: "The Inner City — Hexagonal deep city map",
      details: sectionDetails.intelliMaps
    },
    {
      name: "DM Area",
      path: "/interface/dm-area",
      icon: ShieldAlert,
      description: "Campaign management tools",
      details: sectionDetails.dmArea,
      dmOnly: true,
    },
  ];

  const visibleSections = sections.filter((s) => !('dmOnly' in s && s.dmOnly) || currentUser === "DM");

  if (!currentUser) return <Navigate to="/" />;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: buildPageGradient(theme.pageBg),
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={ts(theme.accentColor)}>
            ● I-NET Interface™
          </span>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            |
          </span>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            Player Dashboard
          </span>
        </div>
        <span className="text-[11px]" style={{ color: theme.labelColor }}>
          {(() => {
            const MONTHS = ["Lunara","Selene","Artemina","Diantha","Solyndra","Astraeus","Eosara","Umbriel","Astralia","Caelion","Serevain","Brimara","Hiemsyl"];
            if (calendarState.isStarfall) return `Starfall Day${calendarState.day > 1 ? ` ${calendarState.day}` : ""}, Year ${calendarState.year}`;
            return `${calendarState.day} ${MONTHS[calendarState.month - 1] || "Unknown"}, Year ${calendarState.year}`;
          })()}
        </span>
      </div>

      {/* Main content with sidebar layout */}
      <div className="flex-1 flex gap-4 p-4 max-w-[1600px] mx-auto w-full relative">
        {/* Sticker overlay — interface page slots */}
        {placedStickers.map((ps) => {
          const slot = getSlot(ps.slotId);
          if (!slot || slot.page !== "interface") return null;
          const img = STICKER_IMAGES[ps.stickerId];
          if (!img) return null;
          const size = 64 * ps.scale;
          return (
            <img
              key={ps.id}
              src={img}
              alt=""
              style={{
                position: "absolute",
                left: `${slot.x}%`,
                top: `${slot.y}%`,
                width: size,
                height: size,
                objectFit: "contain",
                transform: "translate(-50%, -50%)",
                zIndex: 10,
                imageRendering: "auto",
                filter: "drop-shadow(0 0 3px rgba(0,0,0,0.5))",
                pointerEvents: "none",
                userSelect: "none",
              }}
              draggable={false}
            />
          );
        })}
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="mb-6">
            <h1
              className="text-[48px] tracking-tight mb-2"
              style={{
                ...ts(theme.headerColor),
                fontWeight: 700,
                fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
                ...(!isGradient(theme.headerColor) ? { textShadow: `3px 3px 0px #0A0A3B, -1px -1px 0px #2A2A6B, 0 0 20px ${theme.headerColor}33` } : {}),
              }}
            >
              I-NET INTERFACE
            </h1>
          </div>

          {/* Global Search */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className={`${retro.sunken} bg-[#0C0C2E] p-2 flex items-center gap-2`}>
              <Search size={20} className="ml-2 shrink-0" style={{ color: "#3A5A9B" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across all systems..."
                className="flex-1 px-3 py-3 bg-[#0C0C2E] outline-none text-[16px]"
                style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
              />
              <button
                type="submit"
                className={`${retro.button} text-[14px] tracking-wide shrink-0 px-8 py-3`}
                style={{ color: "#C0D0F0", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
              >
                SEARCH ALL
              </button>
            </div>
          </form>

          {/* Horizontal divider */}
          <div className="mb-6">
            <div
              className="h-[3px] w-full"
              style={{
                background: `linear-gradient(90deg, ${firstColor(theme.accentColor)}, #1A1A5B, ${firstColor(theme.accentColor)})`,
                boxShadow: `0 0 10px ${firstColor(theme.accentColor)}4D`,
              }}
            />
          </div>

          {/* System Modules Grid */}
          <div className="space-y-4 flex-1">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.path}
                  className={`${retro.raised} bg-[#0E0E35] p-5 hover:bg-[#111140] transition-all`}
                  style={{
                    borderLeft: "4px solid #2A2A6B",
                    boxShadow: "2px 2px 0px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`${retro.sunken} bg-[#0C0C2E] p-3`}
                        style={{
                          boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.5)",
                        }}
                      >
                        <Icon size={32} style={{ color: firstColor(theme.accentColor) }} />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-[18px]" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                            {section.name}
                          </h3>
                        </div>
                        <p className="text-[13px] mb-2" style={S_SUBTLE}>
                          {section.description}
                        </p>
                        <p className="text-[11px]" style={{ color: theme.labelColor }}>
                          {section.details}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(section.path)}
                      className={`${retro.button} px-6 py-3 text-[13px] flex items-center gap-2 shrink-0 hover:brightness-110`}
                      style={{ color: firstColor(theme.buttonColor), background: theme.uiButtonBg, fontWeight: 600 }}
                    >
                      ACCESS
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-8 flex flex-col items-center gap-1">
            <span
              ref={motdRef}
              className="text-[12px] inline-block"
              style={{
                color: color,
                transform: `rotate(${rotation}deg)`,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
              }}
            >
              {message}
            </span>
            <span className="text-[9px]" style={{ color: "#2A3A5A" }}>
              Intelli Corporation™ © 2026 · Classified System Access
            </span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 space-y-4 shrink-0">
          {/* User Session */}
          <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
            <div className="flex items-center gap-2 mb-3">
              <User size={16} style={{ color: firstColor(theme.accentColor) }} />
              <h3 className="text-[13px]" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                USER SESSION
              </h3>
            </div>

            <div className={`${retro.sunken} p-3 mb-3`} style={{ background: theme.inputBg }}>
              <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>
                Logged in as:
              </div>
              <div className="text-[14px] mb-2" style={{ color: theme.textColor, fontWeight: 600 }}>
                {currentUser}
              </div>
              <div className="text-[10px]" style={S_GREEN_BTN}>
                ● Active Session
              </div>
            </div>

            <button
              onClick={handleLogout}
              className={`${retro.button} w-full text-[12px] flex items-center justify-center gap-2`}
              style={S_RED}
            >
              <LogOut size={14} />
              LOG OUT
            </button>
          </div>

          {/* Notifications */}
          <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={16} style={{ color: firstColor(theme.accentColor) }} />
              <h3 className="text-[13px]" style={{ ...ts(theme.accentColor), fontWeight: 600 }}>
                NOTIFICATIONS
              </h3>
              {notifData.active.length > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    color: "#C0D0F0",
                    background: "#FF6A6A",
                    fontWeight: 600,
                  }}
                >
                  {notifData.active.length}
                </span>
              )}
              <button
                onClick={() => setShowPastNotifs(!showPastNotifs)}
                className="ml-auto flex items-center gap-1 px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                style={{
                  color: showPastNotifs ? firstColor(theme.accentColor) : "#5A6A8A",
                  border: `1px solid ${showPastNotifs ? firstColor(theme.accentColor) + "50" : "#2A2A5B"}`,
                  background: showPastNotifs ? firstColor(theme.accentColor) + "15" : "transparent",
                }}
                title="Past Notifications"
              >
                <History size={11} />
                {notifData.past.length > 0 && (
                  <span className="text-[9px]">{notifData.past.length}</span>
                )}
              </button>
            </div>

            {/* Active notifications view */}
            {!showPastNotifs && (
              <div className="space-y-2">
                {notifData.active.length === 0 ? (
                  <div className="text-[11px] text-center py-3" style={S_MUTED}>
                    No new notifications.
                  </div>
                ) : (
                  notifData.active.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleReadNotification(notif)}
                      className={`${retro.sunken} bg-[#0C0C2E] p-3 w-full text-left hover:bg-[#0E0E32] transition-colors cursor-pointer`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" style={S_RED} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] leading-relaxed truncate" style={S_TEXT}>
                            {notif.preview}
                          </div>
                          <div className="text-[9px] mt-1" style={S_MUTED}>
                            {notif.timestamp}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Past notifications view */}
            {showPastNotifs && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px]" style={{ color: "#5A7ABB", fontWeight: 600 }}>
                    PAST NOTIFICATIONS
                  </div>
                </div>
                {notifData.past.length === 0 ? (
                  <div className="text-[11px] text-center py-3" style={S_MUTED}>
                    No past notifications.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifData.past.map((notif) => {
                      const isExpanded = expandedPastId === notif.id;
                      return (
                        <div key={notif.id} className={`${retro.sunken} bg-[#0C0C2E]`}>
                          <div
                            className="p-2.5 flex items-start gap-2 cursor-pointer hover:bg-[#0E0E32] transition-colors"
                            onClick={() => setExpandedPastId(isExpanded ? null : notif.id)}
                          >
                            {isExpanded
                              ? <ChevronDown size={11} className="shrink-0 mt-0.5" style={{ color: firstColor(theme.accentColor) }} />
                              : <ChevronRight size={11} className="shrink-0 mt-0.5" style={S_MUTED} />
                            }
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] leading-relaxed truncate" style={S_SUBTLE}>
                                {notif.subject}
                              </div>
                              <div className="text-[8px] mt-0.5" style={{ color: "#4A5A7A" }}>
                                {notif.timestamp}
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeletePastNotification(notif.id); }}
                              className="shrink-0 p-0.5 hover:opacity-80"
                              style={S_RED}
                              title="Permanently remove"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3" style={{ borderTop: "1px solid #1A1A4B" }}>
                              <pre
                                className="text-[10px] leading-relaxed whitespace-pre-wrap mt-2"
                                style={{
                                  color: "#9AAABB",
                                  fontFamily: "'Courier New', monospace",
                                }}
                              >
                                {notif.fullMessage}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Calendar & Weather */}
          {(() => {
            const MONTHS = [
              "Lunara", "Selene", "Artemina", "Diantha", "Solyndra", "Astraeus", "Eosara",
              "Umbriel", "Astralia", "Caelion", "Serevain", "Brimara", "Hiemsyl",
            ];
            const dateStr = calendarState.isStarfall
              ? `Starfall Day${calendarState.day > 1 ? ` ${calendarState.day}` : ""}, Year ${calendarState.year}`
              : `${calendarState.day} ${MONTHS[calendarState.month - 1] || "Unknown"}, Year ${calendarState.year}`;

            const WI: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
              "Drizzle": CloudDrizzle, "Light Rain": CloudDrizzle, "Rain": CloudRain,
              "Heavy Rain": CloudRain, "Thunderstorm": CloudLightning, "Overcast": Cloud,
              "Dense Fog": CloudFog, "Mist": CloudFog, "Sleet": Snowflake,
              "Cold Rain": CloudRain, "Haze": Wind, "Freezing Drizzle": Snowflake,
              "Gray Skies": Cloud, "Torrential Downpour": CloudRain,
            };
            const WeatherIcon = WI[weatherState.condition] || Cloud;

            return (
              <div className={`${retro.raised} bg-[#0E0E35] p-4 hover:bg-[#111140] transition-all cursor-pointer`} onClick={() => navigate("/interface/calendar")}>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={16} style={{ color: "#7AB0FF" }} />
                  <h3 className="text-[13px]" style={{ color: "#7AB0FF", fontWeight: 600 }}>
                    CALENDAR & WEATHER
                  </h3>
                </div>

                <div className={`${retro.sunken} bg-[#0C0C2E] p-3 mb-3`}>
                  <div className="text-[10px] mb-1" style={S_MUTED}>Current Date</div>
                  <div className="text-[14px]" style={{ color: calendarState.isStarfall ? "#FFD700" : "#7AB0FF", fontWeight: 600 }}>
                    {dateStr}
                  </div>
                  {calendarState.isStarfall && (
                    <div className="text-[9px] mt-1" style={{ color: "#FFD700AA" }}>
                      ★ A day outside the regular months
                    </div>
                  )}
                </div>

                <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
                  <div className="text-[10px] mb-2" style={S_MUTED}>The Great City — Forecast</div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2" style={SUNKEN_INPUT}>
                      <WeatherIcon size={24} style={{ color: "#6A8ABB" }} />
                    </div>
                    <div>
                      <div className="text-[14px]" style={{ color: "#9AAFCF", fontWeight: 600 }}>{weatherState.condition}</div>
                      <div className="text-[10px]" style={S_MUTED}>{weatherState.temperature} · {weatherState.wind}</div>
                    </div>
                  </div>
                  {weatherState.description && (
                    <div className="text-[10px] leading-relaxed mt-1" style={{ color: "#6A7A9A", fontStyle: "italic" }}>
                      "{weatherState.description}"
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Customization */}
          <div
            className={`${retro.raised} bg-[#0E0E35] p-4 hover:bg-[#111140] transition-all cursor-pointer`}
            onClick={() => navigate("/interface/customization")}
          >
            <div className="flex items-center gap-2 mb-3">
              <Paintbrush size={16} style={{ color: "#DA70D6" }} />
              <h3 className="text-[13px]" style={{ color: "#DA70D6", fontWeight: 600 }}>
                CUSTOMIZATION
              </h3>
            </div>
            <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
              <p className="text-[11px]" style={S_SUBTLE}>
                Personalize your I-Net experience with colors, badges, and more.
              </p>
            </div>
            <button
              className={`${retro.button} w-full text-[12px] flex items-center justify-center gap-2 mt-3`}
              style={{ color: "#DA70D6" }}
            >
              CUSTOMIZE
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Are you Bored? */}
          <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Cat size={16} style={{ color: "#4AE0C0" }} />
              <h3 className="text-[13px]" style={{ color: "#4AE0C0", fontWeight: 600 }}>
                ARE YOU BORED?
              </h3>
            </div>

            <div className="flex flex-col items-center">
              {/* Speech bubble */}
              {boredSpeech && (
                <div
                  className="relative mb-2 w-full"
                  style={{
                    background: "#0C0C2E",
                    border: "2px solid #4AE0C044",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p
                    className="text-[11px] leading-relaxed text-center"
                    style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace" }}
                  >
                    {boredSpeech}
                  </p>
                  {/* Speech bubble tail */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: -8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "8px solid transparent",
                      borderRight: "8px solid transparent",
                      borderTop: "8px solid #4AE0C044",
                    }}
                  />
                </div>
              )}

              {/* Character image */}
              <div
                onClick={handleBoredClick}
                className="cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid #4AE0C033",
                  background: "#0A0A30",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Click me!"
              >
                <img
                  src={mascotImg}
                  alt="Bored character"
                  draggable={false}
                  style={{ width: "90%", height: "90%", objectFit: "contain", imageRendering: "auto" }}
                />
              </div>

              <p className="text-[9px] mt-2 text-center" style={{ color: "#3A5A6A", fontFamily: "'Courier New', monospace" }}>
                Click to chat...
              </p>
            </div>
          </div>

          {/* Report Problem */}
          <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquareWarning size={16} style={S_RED} />
              <h3 className="text-[13px]" style={{ color: "#FF6A6A", fontWeight: 600 }}>
                REPORT PROBLEM
              </h3>
            </div>
            
            <div className={`${retro.sunken} bg-[#0C0C2E] p-3 mb-3`}>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full h-20 px-3 py-2 bg-[#0C0C2E] outline-none text-[12px] resize-none"
                style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace" }}
              />
            </div>

            <button
              onClick={handleSendReport}
              className={`${retro.button} w-full text-[12px] flex items-center justify-center gap-2`}
              style={{ color: reportSent ? "#4A9A5A" : "#FF6A6A" }}
            >
              {reportSent ? "SENT" : "SEND"}
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Server Status Bar */}
      <ServerStatusPanel
        accentColor={firstColor(theme.accentColor)}
        labelColor={theme.labelColor}
      />

      {/* Notification Modal */}
      {openNotification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.7)" }}
          onClick={() => setOpenNotification(null)}
        >
          <div
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Title Bar */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: "linear-gradient(90deg, #1A1A5B, #2A2A7B, #1A1A5B)",
                borderTop: "2px solid #3A3A8B",
                borderLeft: "2px solid #3A3A8B",
                borderRight: "2px solid #050520",
              }}
            >
              <div className="flex items-center gap-2">
                <Bell size={12} style={S_TEXT} />
                <span className="text-[11px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>
                  {openNotification.subject}
                </span>
              </div>
              <button
                onClick={() => setOpenNotification(null)}
                className="w-5 h-5 flex items-center justify-center hover:bg-[#3A3A8B] transition-colors"
                style={{ border: "1px solid #3A3A8B", background: "#2A2A6B" }}
              >
                <X size={10} style={S_TEXT} />
              </button>
            </div>

            {/* Modal Body */}
            <div className={`${retro.raised} bg-[#0E0E35] p-5`} style={{ borderTop: "none" }}>
              <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                <pre
                  className="text-[11px] leading-relaxed whitespace-pre-wrap"
                  style={{
                    color: "#C0D0F0",
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  {openNotification.fullMessage}
                </pre>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setOpenNotification(null)}
                  className={`${retro.button} px-6 py-2 text-[12px]`}
                  style={{ color: "#C0D0F0", fontWeight: 600 }}
                >
                  ACKNOWLEDGE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
