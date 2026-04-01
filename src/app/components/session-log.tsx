import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { RichTextEditor } from "./rich-text-editor";
import { getPlayerTheme, buildPageGradient, firstColor, ts, bc } from "./player-theme";
import { safeGetItem } from "./safe-storage";
import { appStore } from "@/lib/app-store";
import {
  ArrowLeft, Plus, Trash2, Save, X, Edit, ChevronDown, ChevronRight,
  BookOpen, Calendar, Clock, Scroll, Users, MessageSquare, Pin, PinOff,
  Search, SortAsc, SortDesc, Hash, Link2, FileText, ExternalLink, Milestone,
} from "lucide-react";

// ════════════════════════════════════════════
// Types
// ════════════════════════════════════════════

interface SessionEntry {
  id: string;
  sessionNumber: number;
  title: string;
  date: string;          // In-game date string (free text)
  realDate: string;      // Real-world date ISO string
  summary: string;       // DM's session summary (rich text)
  dmNotes: string;       // Private DM notes (only visible to DM)
  highlights: string[];  // Key moments / bullet points
  attendees: string[];   // Player IDs who attended
  pinned: boolean;
  tags: string[];
}

interface PlayerNote {
  id: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  content: string;       // Rich text
  createdAt: string;
}

interface TimelineDataLite {
  books?: Array<{
    name: string;
    lanes: Array<{
      name: string;
      color: string;
      events: Array<{ id: string; title: string; sessionId?: string }>;
    }>;
  }>;
}

interface WikiPageLite {
  id: string;
  title: string;
}

function loadLocalPlayers(): Array<{ id: string; name: string }> {
  try {
    const raw = safeGetItem("inet-dm-players");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadLocalSessions(): SessionEntry[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadLocalPlayerNotes(): PlayerNote[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_PLAYER_NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadLocalTimelineData(): TimelineDataLite {
  try {
    const raw = safeGetItem("inet-campaign-timeline-v2");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadLocalWikiPages(): WikiPageLite[] {
  try {
    const raw = safeGetItem("inet-dm-sites");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════

const STORAGE_KEY_SESSIONS = "inet-session-log";
const STORAGE_KEY_PLAYER_NOTES = "inet-session-player-notes";

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ════════════════════════════════════════════
// Component
// ════════════════════════════════════════════

export function SessionLog() {
  const navigate = useNavigate();
  const theme = getPlayerTheme();
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUser === "DM";

  const [players, setPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>(loadLocalSessions);
  const [playerNotes, setPlayerNotes] = useState<PlayerNote[]>(loadLocalPlayerNotes);
  const [timelineData, setTimelineData] = useState<TimelineDataLite>(loadLocalTimelineData);
  const [wikiPages, setWikiPages] = useState<WikiPageLite[]>(loadLocalWikiPages);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionSaveStatus, setSessionSaveStatus] = useState<"saving" | "saved" | "error" | null>(null);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);
  const saveToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSessionLog() {
      try {
        setSessionLoading(true);
        setSessionSaveError(null);

        const [remotePlayers, remoteSessions, remoteNotes, remoteTimeline, remoteSites] = await Promise.all([
          appStore.listPlayers<any>().catch(() => loadLocalPlayers() as any),
          appStore.loadSessionLogState<SessionEntry[]>(loadLocalSessions()),
          appStore.loadSessionPlayerNotes<PlayerNote[]>(loadLocalPlayerNotes()),
          appStore.loadCampaignTimelineState<TimelineDataLite>(loadLocalTimelineData()).catch(() => loadLocalTimelineData()),
          appStore.listSites<WikiPageLite>().catch(() => loadLocalWikiPages()),
        ]);

        if (cancelled) return;

        setPlayers(Array.isArray(remotePlayers)
          ? remotePlayers.map((player: any) => ({ id: player.id, name: player.name || player.playerName || player.title || player.id }))
          : loadLocalPlayers());
        setSessions(Array.isArray(remoteSessions) ? remoteSessions : loadLocalSessions());
        setPlayerNotes(Array.isArray(remoteNotes) ? remoteNotes : loadLocalPlayerNotes());
        setTimelineData(remoteTimeline && Array.isArray(remoteTimeline.books) ? remoteTimeline : loadLocalTimelineData());
        setWikiPages(Array.isArray(remoteSites) ? remoteSites.map((page: any) => ({ id: page.id, title: page.title })) : loadLocalWikiPages());
      } catch (err) {
        if (!cancelled) {
          setSessionSaveError(err instanceof Error ? err.message : "Failed to load session log.");
        }
      } finally {
        if (!cancelled) {
          hasHydratedRef.current = true;
          setSessionLoading(false);
        }
      }
    }

    void hydrateSessionLog();
    return () => {
      cancelled = true;
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      setSessionSaveStatus("saving");
      setSessionSaveError(null);
      void appStore
        .saveSessionLogState<SessionEntry[]>(sessions)
        .then(() => {
          setSessionSaveStatus("saved");
          if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
          saveToastTimerRef.current = window.setTimeout(() => setSessionSaveStatus(null), 1400);
        })
        .catch((err) => {
          setSessionSaveStatus("error");
          setSessionSaveError(err instanceof Error ? err.message : "Failed to save sessions.");
        });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [sessions]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    const timeout = window.setTimeout(() => {
      setSessionSaveStatus("saving");
      setSessionSaveError(null);
      void appStore
        .saveSessionPlayerNotes<PlayerNote[]>(playerNotes)
        .then(() => {
          setSessionSaveStatus("saved");
          if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
          saveToastTimerRef.current = window.setTimeout(() => setSessionSaveStatus(null), 1400);
        })
        .catch((err) => {
          setSessionSaveStatus("error");
          setSessionSaveError(err instanceof Error ? err.message : "Failed to save player notes.");
        });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [playerNotes]);

  // UI state
  const [editingSession, setEditingSession] = useState<SessionEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [addingNoteForSession, setAddingNoteForSession] = useState<string | null>(null);

  // ── Highlight edit state ──
  const [newHighlight, setNewHighlight] = useState("");

  // ── Computed ──
  const nextSessionNumber = useMemo(() => {
    if (sessions.length === 0) return 1;
    return Math.max(...sessions.map(s => s.sessionNumber)) + 1;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = [...sessions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.highlights.some(h => h.toLowerCase().includes(q))
      );
    }
    // Pinned first, then sort by session number
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return sortNewest
        ? b.sessionNumber - a.sessionNumber
        : a.sessionNumber - b.sessionNumber;
    });
    return result;
  }, [sessions, searchQuery, sortNewest]);

  // ── Handlers ──
  const startCreating = useCallback(() => {
    const entry: SessionEntry = {
      id: uid(),
      sessionNumber: nextSessionNumber,
      title: `Session ${nextSessionNumber}`,
      date: "",
      realDate: new Date().toISOString().slice(0, 10),
      summary: "",
      dmNotes: "",
      highlights: [],
      attendees: players.map(p => p.id),
      pinned: false,
      tags: [],
    };
    setEditingSession(entry);
    setIsCreating(true);
    setNewHighlight("");
  }, [nextSessionNumber, players]);

  const saveSession = useCallback(() => {
    if (!editingSession) return;
    if (isCreating) {
      setSessions(prev => [...prev, editingSession]);
    } else {
      setSessions(prev => prev.map(s => s.id === editingSession.id ? editingSession : s));
    }
    setEditingSession(null);
    setIsCreating(false);
  }, [editingSession, isCreating]);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setPlayerNotes(prev => prev.filter(n => n.sessionId !== id));
    if (expandedSessionId === id) setExpandedSessionId(null);
  }, [expandedSessionId]);

  const togglePin = useCallback((id: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s));
  }, []);

  const addHighlight = useCallback(() => {
    if (!editingSession || !newHighlight.trim()) return;
    setEditingSession({
      ...editingSession,
      highlights: [...editingSession.highlights, newHighlight.trim()],
    });
    setNewHighlight("");
  }, [editingSession, newHighlight]);

  const removeHighlight = useCallback((idx: number) => {
    if (!editingSession) return;
    setEditingSession({
      ...editingSession,
      highlights: editingSession.highlights.filter((_, i) => i !== idx),
    });
  }, [editingSession]);

  const toggleAttendee = useCallback((playerId: string) => {
    if (!editingSession) return;
    const has = editingSession.attendees.includes(playerId);
    setEditingSession({
      ...editingSession,
      attendees: has
        ? editingSession.attendees.filter(id => id !== playerId)
        : [...editingSession.attendees, playerId],
    });
  }, [editingSession]);

  // Player notes
  const savePlayerNote = useCallback((sessionId: string) => {
    if (!newNoteContent.trim()) return;
    const note: PlayerNote = {
      id: uid(),
      sessionId,
      playerId: currentUserId,
      playerName: currentUser,
      content: newNoteContent.trim(),
      createdAt: new Date().toISOString(),
    };
    setPlayerNotes(prev => [...prev, note]);
    setNewNoteContent("");
    setAddingNoteForSession(null);
  }, [newNoteContent, currentUserId, currentUser]);

  const deletePlayerNote = useCallback((noteId: string) => {
    setPlayerNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  const getSessionNotes = useCallback((sessionId: string) => {
    return playerNotes.filter(n => n.sessionId === sessionId);
  }, [playerNotes]);

  // ── Tag input state ──
  const [newTag, setNewTag] = useState("");

  const addTag = useCallback(() => {
    if (!editingSession || !newTag.trim()) return;
    const tag = newTag.trim().toLowerCase();
    if (!editingSession.tags.includes(tag)) {
      setEditingSession({ ...editingSession, tags: [...editingSession.tags, tag] });
    }
    setNewTag("");
  }, [editingSession, newTag]);

  const removeTag = useCallback((tag: string) => {
    if (!editingSession) return;
    setEditingSession({ ...editingSession, tags: editingSession.tags.filter(t => t !== tag) });
  }, [editingSession]);

  // ════════════════════════════════════════════
  // Render: Session Editor
  // ════════════════════════════════════════════
  if (sessionLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: buildPageGradient(theme.pageBg),
          fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
        }}
      >
        <div className={`${retro.sunken} p-5 text-center`} style={{ background: theme.panelBg, color: theme.textColor }}>
          <div className="text-[13px] mb-1">Loading session log...</div>
          {sessionSaveError && <div className="text-[11px]" style={{ color: "#FF8A8A" }}>{sessionSaveError}</div>}
        </div>
      </div>
    );
  }

  if (editingSession) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: buildPageGradient(theme.pageBg),
          fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
        }}
      >
        {/* Toolbar */}
        <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setEditingSession(null); setIsCreating(false); }}
              className="text-[11px] hover:opacity-80 flex items-center gap-1"
              style={{ color: firstColor(theme.accentColor) }}
            >
              <ArrowLeft size={12} />
              Cancel
            </button>
            <span className="text-[11px]" style={{ color: theme.labelColor }}>|</span>
            <span className="text-[11px]" style={{ color: theme.labelColor }}>
              {isCreating ? "New Session Entry" : "Edit Session Entry"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {sessionSaveStatus && (
              <span
                className="text-[10px] px-2 py-1"
                style={{
                  color: sessionSaveStatus === "error" ? "#FF8A8A" : sessionSaveStatus === "saved" ? "#7AE29A" : "#9AB6FF",
                  border: `1px solid ${sessionSaveStatus === "error" ? "#5A1A1A" : sessionSaveStatus === "saved" ? "#1F4A2D" : "#233A6B"}`,
                  background: sessionSaveStatus === "error" ? "#1A0A0A" : sessionSaveStatus === "saved" ? "#0A1A12" : "#0A1024",
                }}
              >
                {sessionSaveStatus === "saving" ? "Saving..." : sessionSaveStatus === "saved" ? "Saved" : "Save failed"}
              </span>
            )}
            <button
              onClick={saveSession}
              className={`${retro.button} text-[11px] flex items-center gap-1`}
              style={{ color: "#4ACA6A" }}
            >
              <Save size={12} />
              Save
            </button>
          </div>
        </div>

        {/* Editor form */}
        <div className="flex-1 px-4 py-6 max-w-[900px] mx-auto w-full space-y-5 overflow-y-auto">
          {/* Session Number + Title */}
          <div className="flex gap-4 items-start">
            <div className="flex-shrink-0">
              <label className="text-[10px] block mb-1" style={{ color: theme.labelColor }}>SESSION #</label>
              <input
                type="number"
                value={editingSession.sessionNumber}
                onChange={e => setEditingSession({ ...editingSession, sessionNumber: parseInt(e.target.value) || 1 })}
                className={`${retro.sunken} w-[70px] px-2 py-1.5 text-[13px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] block mb-1" style={{ color: theme.labelColor }}>TITLE</label>
              <input
                type="text"
                value={editingSession.title}
                onChange={e => setEditingSession({ ...editingSession, title: e.target.value })}
                className={`${retro.sunken} w-full px-3 py-1.5 text-[13px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
                placeholder="Session title..."
              />
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[10px] block mb-1" style={{ color: theme.labelColor }}>
                <Calendar size={10} className="inline mr-1" />
                IN-GAME DATE
              </label>
              <input
                type="text"
                value={editingSession.date}
                onChange={e => setEditingSession({ ...editingSession, date: e.target.value })}
                className={`${retro.sunken} w-full px-3 py-1.5 text-[13px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
                placeholder="e.g. 14th of Lunara, Year 3"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] block mb-1" style={{ color: theme.labelColor }}>
                <Clock size={10} className="inline mr-1" />
                REAL DATE
              </label>
              <input
                type="date"
                value={editingSession.realDate}
                onChange={e => setEditingSession({ ...editingSession, realDate: e.target.value })}
                className={`${retro.sunken} w-full px-3 py-1.5 text-[13px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
              />
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label className="text-[10px] block mb-2" style={{ color: theme.labelColor }}>
              <Users size={10} className="inline mr-1" />
              ATTENDEES
            </label>
            <div className="flex gap-2 flex-wrap">
              {players.map(p => {
                const attending = editingSession.attendees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleAttendee(p.id)}
                    className={`${attending ? retro.sunken : retro.raised} px-3 py-1 text-[11px] transition-colors`}
                    style={{
                      background: attending ? theme.inputBg : theme.cardBg,
                      color: attending ? firstColor(theme.accentColor) : theme.labelColor,
                      fontWeight: attending ? 600 : 400,
                    }}
                  >
                    {attending ? "+" : "-"} {p.name}
                  </button>
                );
              })}
              {players.length === 0 && (
                <span className="text-[11px]" style={{ color: theme.labelColor }}>
                  No players found. Add players in the DM Area first.
                </span>
              )}
            </div>
          </div>

          {/* Summary (Rich Text) */}
          <div>
            <label className="text-[10px] block mb-1" style={{ color: theme.labelColor }}>
              <Scroll size={10} className="inline mr-1" />
              SESSION SUMMARY
            </label>
            <div className={`${retro.sunken}`} style={{ background: theme.inputBg }}>
              <RichTextEditor
                value={editingSession.summary}
                onChange={val => setEditingSession({ ...editingSession, summary: val })}
                placeholder="What happened this session..."
                minHeight={120}
              />
            </div>
            <div className="text-[9px] mt-1" style={{ color: theme.labelColor, opacity: 0.7 }}>
              Tip: Use [[Article Name]] or [[Article Name|Display Text]] to create inline wiki links
            </div>
          </div>

          {/* Highlights */}
          <div>
            <label className="text-[10px] block mb-2" style={{ color: theme.labelColor }}>
              <Hash size={10} className="inline mr-1" />
              KEY MOMENTS / HIGHLIGHTS
            </label>
            <div className="space-y-1 mb-2">
              {editingSession.highlights.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: "#FFAA4A" }}>*</span>
                  <span className="flex-1 text-[12px]" style={{ color: theme.textColor }}>{h}</span>
                  <button onClick={() => removeHighlight(i)} className="hover:opacity-70">
                    <X size={12} style={{ color: "#FF6A6A" }} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newHighlight}
                onChange={e => setNewHighlight(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addHighlight(); } }}
                className={`${retro.sunken} flex-1 px-3 py-1.5 text-[12px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
                placeholder="Add a key moment..."
              />
              <button onClick={addHighlight} className={`${retro.button} text-[11px] flex items-center gap-1`} style={{ color: firstColor(theme.accentColor) }}>
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] block mb-2" style={{ color: theme.labelColor }}>TAGS</label>
            <div className="flex gap-1 flex-wrap mb-2">
              {editingSession.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] flex items-center gap-1"
                  style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.dividerColor}` }}
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                className={`${retro.sunken} flex-1 px-3 py-1 text-[11px]`}
                style={{ background: theme.inputBg, color: theme.textColor, border: "none" }}
                placeholder="Add tag..."
              />
              <button onClick={addTag} className={`${retro.button} text-[11px]`} style={{ color: firstColor(theme.accentColor) }}>
                Add
              </button>
            </div>
          </div>

          {/* DM Notes (private) */}
          {isDM && (
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "#FF6A6A" }}>
                <span style={{ color: "#FF6A6A" }}>DM ONLY NOTES (hidden from players)</span>
              </label>
              <div className={`${retro.sunken}`} style={{ background: "#1A0A0A", border: "1px solid #3A1A1A" }}>
                <RichTextEditor
                  value={editingSession.dmNotes}
                  onChange={val => setEditingSession({ ...editingSession, dmNotes: val })}
                  placeholder="Private DM notes for this session..."
                  minHeight={80}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ���═══════════════════════════════════════════
  // Render: Session List
  // ════════════════════════════════════════════
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: buildPageGradient(theme.pageBg),
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ background: theme.toolbarBg }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/interface")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={{ color: firstColor(theme.accentColor) }}
          >
            <ArrowLeft size={12} />
            Back
          </button>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>|</span>
          <span className="text-[11px]" style={{ color: theme.labelColor }}>
            Session Log
          </span>
        </div>
        <span className="text-[11px]" style={{ color: theme.labelColor }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
        </span>
      </div>

      <div className="flex-1 px-4 py-6 max-w-[900px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-[28px] tracking-tight mb-1"
              style={{
                ...ts(theme.headerColor),
                fontWeight: 700,
                fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif",
                textShadow: "2px 2px 0px #0A0A3B",
              }}
            >
              <BookOpen size={24} className="inline mr-2" style={{ verticalAlign: "text-bottom" }} />
              Campaign Journal
            </h1>
            <p className="text-[12px]" style={{ color: theme.labelColor }}>
              Chronicle your adventures session by session
            </p>
          </div>
          {isDM && (
            <button
              onClick={startCreating}
              className={`${retro.button} text-[12px] flex items-center gap-2`}
              style={{ color: firstColor(theme.accentColor) }}
            >
              <Plus size={14} />
              New Session
            </button>
          )}
        </div>

        {sessionSaveError && (
          <div className={`${retro.sunken} px-3 py-2 mb-4 text-[11px]`} style={{ background: "#1A0A0A", color: "#FF8A8A", border: "1px solid #5A1A1A" }}>
            {sessionSaveError}
          </div>
        )}

        {/* Search & Sort Bar */}
        <div className="flex gap-3 mb-5 items-center">
          <div className={`${retro.sunken} flex-1 flex items-center gap-2 px-3 py-1.5`} style={{ background: theme.inputBg }}>
            <Search size={13} style={{ color: theme.labelColor }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-[12px]"
              style={{ color: theme.textColor }}
              placeholder="Search sessions..."
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="hover:opacity-70">
                <X size={12} style={{ color: theme.labelColor }} />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortNewest(prev => !prev)}
            className={`${retro.button} text-[11px] flex items-center gap-1`}
            style={{ color: theme.textColor }}
            title={sortNewest ? "Newest first" : "Oldest first"}
          >
            {sortNewest ? <SortDesc size={13} /> : <SortAsc size={13} />}
            {sortNewest ? "Newest" : "Oldest"}
          </button>
        </div>

        {/* Session List */}
        {filteredSessions.length === 0 ? (
          <div className={`${retro.sunken} p-8 text-center`} style={{ background: theme.panelBg }}>
            <BookOpen size={32} className="mx-auto mb-3" style={{ color: theme.labelColor, opacity: 0.5 }} />
            <p className="text-[13px] mb-1" style={{ color: theme.textColor }}>
              {sessions.length === 0 ? "No sessions recorded yet" : "No sessions match your search"}
            </p>
            <p className="text-[11px]" style={{ color: theme.labelColor }}>
              {sessions.length === 0 && isDM
                ? "Click \"New Session\" to chronicle your first adventure!"
                : sessions.length === 0
                ? "The DM hasn't logged any sessions yet."
                : "Try different search terms."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map(session => {
              const isExpanded = expandedSessionId === session.id;
              const notes = getSessionNotes(session.id);
              const attendeeNames = session.attendees.map(id => {
                const p = players.find(pl => pl.id === id);
                return p?.name || "Unknown";
              });

              // Find timeline events linked to this session
              const linkedTimelineEvents: { id: string; title: string; bookName: string; laneName: string; laneColor: string }[] = (() => {
                if (!timelineData?.books) return [];
                const results: { id: string; title: string; bookName: string; laneName: string; laneColor: string }[] = [];
                for (const book of timelineData.books || []) {
                  for (const lane of book.lanes || []) {
                    for (const ev of lane.events || []) {
                      if (ev.sessionId === session.id) {
                        results.push({ id: ev.id, title: ev.title, bookName: book.name, laneName: lane.name, laneColor: lane.color });
                      }
                    }
                  }
                }
                return results;
              })();

              // Find wiki pages referenced in summary via [[...]] syntax
              const referencedWikiPages: { id: string; title: string }[] = (() => {
                const wikiLinkPattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
                const matches = new Set<string>();
                let match: RegExpExecArray | null;
                const text = session.summary + " " + session.dmNotes;
                while ((match = wikiLinkPattern.exec(text)) !== null) {
                  matches.add(match[1].trim().toLowerCase());
                }
                return wikiPages.filter((page) => matches.has(page.title.toLowerCase()));
              })();

              return (
                <div
                  key={session.id}
                  className={`${retro.raised}`}
                  style={{ background: theme.cardBg }}
                >
                  {/* Session header row */}
                  <button
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isExpanded
                        ? <ChevronDown size={14} style={{ color: firstColor(theme.accentColor) }} />
                        : <ChevronRight size={14} style={{ color: theme.labelColor }} />}
                    </div>

                    {/* Session number badge */}
                    <div
                      className="flex-shrink-0 w-[42px] h-[42px] flex items-center justify-center text-[14px] font-bold"
                      style={{
                        ...bc(theme.inputBg),
                        color: firstColor(theme.accentColor),
                        border: `2px solid ${theme.dividerColor}`,
                      }}
                    >
                      #{session.sessionNumber}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold truncate" style={{ color: theme.textColor }}>
                          {session.title}
                        </span>
                        {session.pinned && (
                          <Pin size={12} style={{ color: "#FFAA4A" }} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {session.date && (
                          <span className="text-[10px]" style={{ color: theme.labelColor }}>
                            <Calendar size={9} className="inline mr-1" />
                            {session.date}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: theme.labelColor }}>
                          <Clock size={9} className="inline mr-1" />
                          {session.realDate}
                        </span>
                        {attendeeNames.length > 0 && (
                          <span className="text-[10px]" style={{ color: theme.labelColor }}>
                            <Users size={9} className="inline mr-1" />
                            {attendeeNames.length} player{attendeeNames.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {notes.length > 0 && (
                          <span className="text-[10px]" style={{ color: "#7AC4A0" }}>
                            <MessageSquare size={9} className="inline mr-1" />
                            {notes.length} note{notes.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {/* Tags */}
                      {session.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {session.tags.map(tag => (
                            <span
                              key={tag}
                              className="px-1.5 py-0 text-[9px]"
                              style={{ background: theme.tagBg, color: theme.tagText, border: `1px solid ${theme.dividerColor}` }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4" style={{ borderTop: `1px solid ${theme.dividerColor}` }}>
                      {/* DM action buttons */}
                      {isDM && (
                        <div className="flex gap-2 pt-3">
                          <button
                            onClick={() => { setEditingSession(session); setIsCreating(false); setNewHighlight(""); }}
                            className={`${retro.button} text-[11px] flex items-center gap-1`}
                            style={{ color: firstColor(theme.accentColor) }}
                          >
                            <Edit size={12} /> Edit
                          </button>
                          <button
                            onClick={() => togglePin(session.id)}
                            className={`${retro.button} text-[11px] flex items-center gap-1`}
                            style={{ color: session.pinned ? "#FFAA4A" : theme.textColor }}
                          >
                            {session.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                            {session.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button
                            onClick={() => { if (confirm("Delete this session entry?")) deleteSession(session.id); }}
                            className={`${retro.button} text-[11px] flex items-center gap-1`}
                            style={{ color: "#FF6A6A" }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}

                      {/* Attendees */}
                      {attendeeNames.length > 0 && (
                        <div>
                          <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>ATTENDEES</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {attendeeNames.map(name => (
                              <span
                                key={name}
                                className="px-2 py-0.5 text-[11px]"
                                style={{ background: theme.inputBg, color: theme.textColor, border: `1px solid ${theme.dividerColor}` }}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {session.summary && (
                        <div>
                          <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>SUMMARY</div>
                          <div
                            className={`${retro.sunken} p-3 text-[12px] leading-relaxed`}
                            style={{ background: theme.panelBg, color: theme.textColor }}
                          >
                            <RenderFormattedText text={session.summary} />
                          </div>
                        </div>
                      )}

                      {/* Highlights */}
                      {session.highlights.length > 0 && (
                        <div>
                          <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>KEY MOMENTS</div>
                          <div className={`${retro.sunken} p-3`} style={{ background: theme.panelBg }}>
                            {session.highlights.map((h, i) => (
                              <div key={i} className="flex items-start gap-2 mb-1 last:mb-0">
                                <span className="text-[11px] mt-0.5" style={{ color: "#FFAA4A" }}>*</span>
                                <span className="text-[12px]" style={{ color: theme.textColor }}>{h}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* DM Notes (DM only) */}
                      {isDM && session.dmNotes && (
                        <div>
                          <div className="text-[10px] mb-1" style={{ color: "#FF6A6A" }}>DM NOTES (private)</div>
                          <div
                            className={`${retro.sunken} p-3 text-[12px] leading-relaxed`}
                            style={{ background: "#1A0A0A", color: "#FFAAAA", border: "1px solid #3A1A1A" }}
                          >
                            <RenderFormattedText text={session.dmNotes} />
                          </div>
                        </div>
                      )}

                      {/* Linked Timeline Events */}
                      {linkedTimelineEvents.length > 0 && (
                        <div>
                          <div className="text-[10px] mb-1 flex items-center gap-1" style={{ color: theme.labelColor }}>
                            <Milestone size={10} />
                            TIMELINE EVENTS ({linkedTimelineEvents.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {linkedTimelineEvents.map((tlEv, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-1 flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  background: tlEv.laneColor + "15",
                                  border: `1px solid ${tlEv.laneColor}30`,
                                  color: tlEv.laneColor,
                                }}
                                onClick={() => navigate(`/interface/campaign-timeline?jump=${tlEv.id}`)}
                              >
                                <Milestone size={9} />
                                {tlEv.title}
                                <span className="text-[8px]" style={{ color: theme.labelColor }}>
                                  ({tlEv.bookName} / {tlEv.laneName})
                                </span>
                                <ExternalLink size={8} />
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Referenced Wiki Articles */}
                      {referencedWikiPages.length > 0 && (
                        <div>
                          <div className="text-[10px] mb-1 flex items-center gap-1" style={{ color: theme.labelColor }}>
                            <Link2 size={10} />
                            REFERENCED ARTICLES ({referencedWikiPages.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {referencedWikiPages.map(page => (
                              <span
                                key={page.id}
                                className="text-[10px] px-2 py-0.5 flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                                style={{
                                  background: "#0A1A3A",
                                  border: "1px solid #2A4A6B",
                                  color: "#6A9AFF",
                                }}
                                onClick={() => navigate(`/interface/inet-page/${page.id}`)}
                              >
                                <FileText size={8} />
                                {page.title}
                                <ExternalLink size={7} />
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Player Notes */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px]" style={{ color: theme.labelColor }}>
                            <MessageSquare size={10} className="inline mr-1" />
                            PLAYER NOTES ({notes.length})
                          </div>
                          {!isDM && addingNoteForSession !== session.id && (
                            <button
                              onClick={() => { setAddingNoteForSession(session.id); setNewNoteContent(""); }}
                              className={`${retro.button} text-[10px] flex items-center gap-1`}
                              style={{ color: firstColor(theme.accentColor) }}
                            >
                              <Plus size={11} /> Add Note
                            </button>
                          )}
                        </div>

                        {notes.length > 0 && (
                          <div className="space-y-2">
                            {notes.map(note => (
                              <div
                                key={note.id}
                                className={`${retro.sunken} p-2.5`}
                                style={{ background: theme.panelBg }}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] font-semibold" style={{ color: firstColor(theme.accentColor) }}>
                                    {note.playerName}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px]" style={{ color: theme.labelColor }}>
                                      {new Date(note.createdAt).toLocaleDateString()}
                                    </span>
                                    {(isDM || note.playerId === currentUserId) && (
                                      <button onClick={() => deletePlayerNote(note.id)} className="hover:opacity-70">
                                        <Trash2 size={11} style={{ color: "#FF6A6A" }} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[12px]" style={{ color: theme.textColor }}>
                                  <RenderFormattedText text={note.content} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add note form */}
                        {addingNoteForSession === session.id && (
                          <div className={`${retro.sunken} p-3 mt-2`} style={{ background: theme.inputBg }}>
                            <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>Your note:</div>
                            <textarea
                              value={newNoteContent}
                              onChange={e => setNewNoteContent(e.target.value)}
                              className="w-full bg-transparent border-none outline-none text-[12px] resize-none"
                              style={{ color: theme.textColor, minHeight: 60 }}
                              placeholder="Write your notes about this session..."
                            />
                            <div className="flex gap-2 mt-2 justify-end">
                              <button
                                onClick={() => setAddingNoteForSession(null)}
                                className={`${retro.button} text-[10px]`}
                                style={{ color: theme.labelColor }}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => savePlayerNote(session.id)}
                                className={`${retro.button} text-[10px]`}
                                style={{ color: "#4ACA6A" }}
                              >
                                <Save size={11} className="inline mr-1" />
                                Save
                              </button>
                            </div>
                          </div>
                        )}

                        {notes.length === 0 && addingNoteForSession !== session.id && (
                          <div className="text-[11px]" style={{ color: theme.labelColor, opacity: 0.6 }}>
                            No player notes yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}