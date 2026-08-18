import React, { useState, useCallback, Suspense, useMemo, memo, startTransition, useEffect } from "react";
import { useNavigate, Navigate } from "react-router";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_TEXT, S_ACCENT, S_GREEN, S_RED, S_ACCENT_HDR } from "./shared-styles";
import { ArrowLeft, Gamepad2, Cat, Trophy, Trash2, Palette, CircleDot, Skull, ArrowUp, ShoppingBag, Compass, type LucideIcon } from "lucide-react";
import { importWithStaleChunkRecovery } from "@/lib/lazy-module";
import { useInterfaceSession } from "./session-context";
import { listPrototypeRooms } from "@/lib/adventure-prototype-api";

const SnakeGame = React.lazy(() => importWithStaleChunkRecovery(() => import("./snake-game")).then((module) => ({ default: module.SnakeGame })));
const RunnerGame = React.lazy(() => importWithStaleChunkRecovery(() => import("./runner-game")).then((module) => ({ default: module.RunnerGame })));
const PartyColor = React.lazy(() => importWithStaleChunkRecovery(() => import("./party-color")).then((module) => ({ default: module.PartyColor })));
const OsuGame = React.lazy(() => importWithStaleChunkRecovery(() => import("./osu-game")).then((module) => ({ default: module.OsuGame })));
const BossFightLauncher = React.lazy(() => importWithStaleChunkRecovery(() => import("./boss-fight-launcher")).then((module) => ({ default: module.BossFightLauncher })));
const DoodleJumpGame = React.lazy(() => importWithStaleChunkRecovery(() => import("./doodle-jump-game")).then((module) => ({ default: module.DoodleJumpGame })));
const AdventurePrototype = React.lazy(() => importWithStaleChunkRecovery(() => import("./adventure-prototype")).then((module) => ({ default: module.AdventurePrototype })));
const ArcadeStore = React.lazy(() => importWithStaleChunkRecovery(() => import("./arcade-store")).then((module) => ({ default: module.ArcadeStore })));
import {
  saveScore,
  getTopScores,
  getLeaderboard,
  clearLeaderboard,
  scoreToCredits,
  addCredits,
  type LeaderboardEntry,
} from "./game-leaderboard";
import { safeGetItem } from "./safe-storage";

interface GameEntry {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  component: React.ComponentType<{ onBack: () => void; onScoreSave?: (score: number) => void }>;
}

const GAMES: GameEntry[] = [
  {
    id: "snake",
    name: "SNAKE",
    icon: Gamepad2,
    description: "Classic snake game. Eat pixels, grow longer, don't crash.",
    component: SnakeGame,
  },
  {
    id: "runner",
    name: "ALIEN CAT RUNNER",
    icon: Cat,
    description: "Endless runner. Jump over obstacles and survive as long as you can!",
    component: RunnerGame,
  },
  {
    id: "partycolor",
    name: "PARTY COLOR",
    icon: Palette,
    description: "Shared pixel canvas. Everyone draws together - the DM sets the prompt!",
    component: PartyColor,
  },
  {
    id: "osu",
    name: "RHYTHM CIRCLES",
    icon: CircleDot,
    description: "Simplified Osu! - Click circles to the beat. Build combos for huge scores!",
    component: OsuGame,
  },
  {
    id: "bossfight",
    name: "BOSS FIGHT",
    icon: Skull,
    description: "Undertale-style boss battle! Dodge bullets, fight or show mercy to GNARPY OF DOOM.",
    component: BossFightLauncher,
  },
  {
    id: "doodlejump",
    name: "DOODLE JUMP",
    icon: ArrowUp,
    description: "Jump from platform to platform and climb as high as you can! Watch out for fragile ones.",
    component: DoodleJumpGame,
  },
];

type Tab = "games" | "store" | "leaderboard";

const G_GOLD = { color: "#FFD700" } as const;
const G_GAME_CARD_BORDER = { borderLeft: "4px solid #2A2A6B" } as const;
const G_GAME_TITLE = { color: "#4A7BFF", fontWeight: 600, fontFamily: "'Courier New', monospace" } as const;
const G_YOU_BADGE = { color: "#4A7BFF", background: "rgba(74, 123, 255, 0.15)", border: "1px solid rgba(74, 123, 255, 0.3)" } as const;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getRankStyle = (index: number) => {
  switch (index) {
    case 0: return { color: "#FFD700", label: "1ST" };
    case 1: return { color: "#C0C0C0", label: "2ND" };
    case 2: return { color: "#CD7F32", label: "3RD" };
    default: return { color: "#3A4A6A", label: `${index + 1}` };
  }
};

const GameCard = memo(function GameCard({
  game,
  bestScore,
  onSelect,
}: {
  game: GameEntry;
  bestScore: number | null;
  onSelect: () => void;
}) {
  const Icon = game.icon;
  return (
    <button
      onClick={onSelect}
      className={`${retro.raised} bg-[#0E0E35] p-5 text-left hover:bg-[#141450] transition-all cursor-pointer group`}
      style={G_GAME_CARD_BORDER}
    >
      <div className="flex items-start gap-3">
        <div className={`${retro.sunken} bg-[#0A0A28] p-3 group-hover:bg-[#0C0C30] transition-colors`}>
          <Icon size={28} style={S_ACCENT} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] mb-1" style={G_GAME_TITLE}>{game.name}</div>
          <div className="text-[11px]" style={S_MUTED}>{game.description}</div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-[10px] flex items-center gap-1" style={S_GREEN}>PLAY</div>
            {bestScore !== null && (
              <div className="text-[10px] flex items-center gap-1" style={G_GOLD}>
                <Trophy size={9} /> {bestScore}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
});

const LeaderboardRow = memo(function LeaderboardRow({
  entry,
  idx,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  idx: number;
  isCurrentUser: boolean;
}) {
  const rank = getRankStyle(idx);
  return (
    <div
      className="grid gap-2 px-3 py-2.5 text-[11px] transition-colors"
      style={{
        gridTemplateColumns: "50px 1fr 1fr 100px 1fr",
        borderBottom: "1px solid #0E0E2E",
        background: isCurrentUser
          ? "rgba(74, 123, 255, 0.05)"
          : idx % 2 === 0
          ? "rgba(10, 10, 40, 0.3)"
          : "transparent",
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div className="flex items-center" style={{ color: rank.color, fontWeight: idx < 3 ? 700 : 400 }}>
        {idx < 3 ? (
          <span className="flex items-center gap-1"><Trophy size={10} />{rank.label}</span>
        ) : (
          <span>{rank.label}</span>
        )}
      </div>
      <div className="flex items-center truncate" style={{ color: isCurrentUser ? "#4A7BFF" : "#C0D0F0" }}>
        {entry.player}
        {isCurrentUser && (
          <span className="ml-2 text-[9px] px-1.5 py-0.5" style={G_YOU_BADGE}>YOU</span>
        )}
      </div>
      <div className="flex items-center truncate" style={S_MUTED}>{entry.gameName}</div>
      <div className="flex items-center justify-end" style={{ color: idx === 0 ? "#FFD700" : "#4AFF4A", fontWeight: idx < 3 ? 700 : 400 }}>
        {entry.score.toLocaleString()}
      </div>
      <div className="flex items-center justify-end truncate" style={S_DIM}>{formatDate(entry.date)}</div>
    </div>
  );
});

export function Game() {
  const navigate = useNavigate();
  const { isDM } = useInterfaceSession();
  const currentUser = safeGetItem("inet-user") || "";
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [activeAdventure, setActiveAdventure] = useState(false);
  const [prototypeInvitationCount, setPrototypeInvitationCount] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>("games");
  const [leaderboardFilter, setLeaderboardFilter] = useState<string>("all");
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);

  const arcadeGameIds = useMemo(() => new Set(GAMES.map((game) => game.id)), []);
  const selectedGame = GAMES.find((g) => g.id === activeGame);

  useEffect(() => {
    if (isDM) {
      setPrototypeInvitationCount(0);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const refreshInvitations = async () => {
      try {
        const rooms = await listPrototypeRooms();
        if (!cancelled) setPrototypeInvitationCount(rooms.length);
      } catch {
        if (!cancelled) setPrototypeInvitationCount(0);
      }
    };
    const poll = () => {
      void refreshInvitations().finally(() => {
        if (!cancelled) timer = window.setTimeout(poll, 5000);
      });
    };
    const onFocus = () => { void refreshInvitations(); };
    poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [isDM]);

  const handleScoreSave = useCallback(
    (gameId: string, gameName: string) => (score: number) => {
      saveScore(gameId, gameName, currentUser, score);
      const earned = scoreToCredits(gameId, score);
      if (earned > 0) addCredits(earned);
      setLeaderboardVersion((v) => v + 1);
    },
    [currentUser]
  );

  if (!currentUser) return <Navigate to="/" />;

  const getFilteredEntries = (): LeaderboardEntry[] => {
    if (leaderboardFilter === "all") {
      return getLeaderboard()
        .filter((entry) => arcadeGameIds.has(entry.gameId))
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
    }
    return getTopScores(leaderboardFilter, 50);
  };

  const handleClearLeaderboard = () => {
    if (leaderboardFilter === "all") {
      clearLeaderboard();
    } else {
      clearLeaderboard(leaderboardFilter);
    }
    setLeaderboardVersion((v) => v + 1);
  };

  const entries = getFilteredEntries();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0A0A3B 0%, #080830 40%, #060625 100%)",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Top toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={S_ACCENT}>
            I-NET Interface
          </span>
          <span className="text-[11px]" style={S_DIM}>
            |
          </span>
          <span className="text-[11px]" style={S_DIM}>
            Game Arcade
          </span>
          {selectedGame && (
            <div style={DISPLAY_CONTENTS}>
              <span className="text-[11px]" style={S_DIM}>
                &gt;
              </span>
              <span className="text-[11px]" style={S_MUTED}>
                {selectedGame.name}
              </span>
            </div>
          )}
          {activeAdventure && (
            <div style={DISPLAY_CONTENTS}>
              <span className="text-[11px]" style={S_DIM}>
                &gt;
              </span>
              <span className="text-[11px]" style={S_MUTED}>
                Adventure Prototype
              </span>
            </div>
          )}
          {!selectedGame && !activeAdventure && activeTab === "leaderboard" && (
            <div style={DISPLAY_CONTENTS}>
              <span className="text-[11px]" style={S_DIM}>
                &gt;
              </span>
              <span className="text-[11px]" style={S_MUTED}>
                Leaderboards
              </span>
            </div>
          )}
          {!selectedGame && !activeAdventure && activeTab === "store" && (
            <div style={DISPLAY_CONTENTS}>
              <span className="text-[11px]" style={S_DIM}>
                &gt;
              </span>
              <span className="text-[11px]" style={S_MUTED}>
                Store
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={S_MUTED}>
            Logged in as: <span style={S_TEXT}>{currentUser}</span>
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-4 max-w-[1600px] mx-auto w-full">
        {/* Back button */}
        <button
          onClick={() => navigate("/interface")}
          className={`${retro.button} px-4 py-1.5 text-[11px] flex items-center gap-2 self-start mb-4`}
          style={S_ACCENT}
        >
          <ArrowLeft size={12} /> Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            {activeAdventure ? (
              <Compass size={28} style={{ color: "#64E0FF" }} />
            ) : activeTab === "leaderboard" && !selectedGame ? (
              <Trophy size={28} style={{ color: "#FFD700" }} />
            ) : activeTab === "store" && !selectedGame ? (
              <ShoppingBag size={28} style={{ color: "#FFD700" }} />
            ) : (
              <Gamepad2 size={28} style={S_ACCENT} />
            )}
            <h1
              className="text-[32px] tracking-tight"
              style={{
                color: "#4A7BFF",
                fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
                textShadow: "0 0 20px rgba(74,123,255,0.3)",
              }}
            >
              {selectedGame
                ? selectedGame.name
                : activeAdventure
                ? "Adventure Prototype"
                : activeTab === "leaderboard"
                ? "Leaderboards"
                : activeTab === "store"
                ? "Game Store"
                : "Game Arcade"}
            </h1>
          </div>
          <div className="text-[12px]" style={S_MUTED}>
            {selectedGame
              ? selectedGame.description
              : activeAdventure
              ? "A focused shared-turn test for rooms, movement, attacks, and live synchronization."
              : activeTab === "leaderboard"
              ? "All-time high scores across all I-NET arcade games."
              : activeTab === "store"
              ? "Browse and purchase additional I-NET arcade content."
              : `I-NET Game Module - ${GAMES.length + (isDM || prototypeInvitationCount > 0 ? 1 : 0)} game${GAMES.length + (isDM || prototypeInvitationCount > 0 ? 1 : 0) !== 1 ? "s" : ""} available`}
          </div>
        </div>

        {/* Tabs - only show when not in a game */}
        {!selectedGame && !activeAdventure && (
          <div className="flex mb-4 gap-0" style={{ borderBottom: "2px solid #1A1A4B" }}>
            <button
              onClick={() => setActiveTab("games")}
              className="px-5 py-2 text-[12px] flex items-center gap-2 transition-colors"
              style={{
                color: activeTab === "games" ? "#C0D0F0" : "#3A4A6A",
                background: activeTab === "games" ? "#12123A" : "transparent",
                borderTop: activeTab === "games" ? "2px solid #4A7BFF" : "2px solid transparent",
                borderLeft: activeTab === "games" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderRight: activeTab === "games" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderBottom: activeTab === "games" ? "2px solid #12123A" : "none",
                marginBottom: "-2px",
                cursor: "pointer",
              }}
            >
              <Gamepad2 size={13} /> GAMES
            </button>
            <button
              onClick={() => setActiveTab("store")}
              className="px-5 py-2 text-[12px] flex items-center gap-2 transition-colors"
              style={{
                color: activeTab === "store" ? "#FFD700" : "#3A4A6A",
                background: activeTab === "store" ? "#12123A" : "transparent",
                borderTop:
                  activeTab === "store" ? "2px solid #FFD700" : "2px solid transparent",
                borderLeft:
                  activeTab === "store" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderRight:
                  activeTab === "store" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderBottom: activeTab === "store" ? "2px solid #12123A" : "none",
                marginBottom: "-2px",
                cursor: "pointer",
              }}
            >
              <ShoppingBag size={13} /> STORE
            </button>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className="px-5 py-2 text-[12px] flex items-center gap-2 transition-colors"
              style={{
                color: activeTab === "leaderboard" ? "#FFD700" : "#3A4A6A",
                background: activeTab === "leaderboard" ? "#12123A" : "transparent",
                borderTop:
                  activeTab === "leaderboard" ? "2px solid #FFD700" : "2px solid transparent",
                borderLeft:
                  activeTab === "leaderboard" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderRight:
                  activeTab === "leaderboard" ? "1px solid #1A1A4B" : "1px solid transparent",
                borderBottom: activeTab === "leaderboard" ? "2px solid #12123A" : "none",
                marginBottom: "-2px",
                cursor: "pointer",
              }}
            >
              <Trophy size={13} /> LEADERBOARDS
            </button>
          </div>
        )}

        {/* Content area */}
        <div className={`${retro.sunken} bg-[#0C0C2E] flex-1 p-6`}>
          {selectedGame ? (
            /* Active Game */
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6" style={{ border: "2px solid #2A2A5B", borderTop: "2px solid #4A7BFF", borderRadius: "50%", animation: "game-spin 0.8s linear infinite" }} />
                  <span className="text-[11px] font-mono" style={{ color: "#4A4A7A" }}>Loading game...</span>
                  <style>{`@keyframes game-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              </div>
            }>
              <selectedGame.component
                onBack={() => setActiveGame(null)}
                onScoreSave={handleScoreSave(selectedGame.id, selectedGame.name)}
              />
            </Suspense>
          ) : activeAdventure ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <span className="text-[11px] font-mono" style={{ color: "#4A4A7A" }}>Loading Adventure prototype...</span>
              </div>
            }>
              <AdventurePrototype onBack={() => setActiveAdventure(false)} />
            </Suspense>
          ) : activeTab === "games" ? (
            /* Game Menu */
            <div>
              <div className="mb-4 pb-3" style={{ borderBottom: "1px solid #1A1A4B" }}>
                <div className="text-[13px]" style={S_ACCENT_HDR}>
                  SELECT A GAME
                </div>
                <div className="text-[10px] mt-1" style={S_DIM}>
                  Choose from the available I-NET arcade titles below.
                </div>
              </div>

              {(isDM || prototypeInvitationCount > 0) && (
                <div className="mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setActiveGame(null);
                        setActiveAdventure(true);
                        setActiveTab("games");
                      });
                    }}
                    className={`${retro.raised} w-full p-4 text-left transition-colors hover:bg-[#0D203A]`}
                    style={{ borderLeft: "4px solid #64E0FF", background: "#08162A" }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`${retro.sunken} bg-[#061126] p-3`}>
                        <Compass size={28} style={{ color: "#64E0FF" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <div className="text-[15px] font-bold" style={{ color: "#64E0FF", fontFamily: "'Courier New', monospace" }}>
                            ADVENTURE
                          </div>
                          <span className="border px-2 py-0.5 text-[9px]" style={{ color: "#FFD37A", borderColor: "#8A682D", background: "#2A210D" }}>
                            {isDM ? "DM ONLY" : "INVITED"}
                          </span>
                          <span className="border px-2 py-0.5 text-[9px]" style={{ color: "#8FF0B8", borderColor: "#285D43", background: "#0B2A1A" }}>
                            PROTOTYPE
                          </span>
                        </div>
                        <div className="text-[11px]" style={S_MUTED}>
                          {isDM
                            ? "Create private rooms, invite player profiles, and test synchronized grid turns."
                            : `${prototypeInvitationCount} open invitation${prototypeInvitationCount === 1 ? "" : "s"} waiting for this profile.`}
                        </div>
                        <div className="mt-2 text-[10px]" style={{ color: "#64E0FF" }}>{isDM ? "OPEN PROTOTYPE" : "OPEN INVITATIONS"}</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {GAMES.map((game) => {
                  const Icon = game.icon;
                  const topScores = getTopScores(game.id, 1);
                  const bestScore = topScores.length > 0 ? topScores[0].score : null;
                  return (
                    <GameCard
                      key={game.id}
                      game={game}
                      bestScore={bestScore}
                      onSelect={() => {
                        startTransition(() => {
                          setActiveGame(game.id);
                          setActiveTab("games");
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : activeTab === "store" ? (
            /* Store Tab */
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <span className="text-[11px] font-mono" style={{ color: "#4A4A7A" }}>Loading store...</span>
              </div>
            }>
              <ArcadeStore />
            </Suspense>
          ) : (
            /* Leaderboard Tab */
            <div>
              {/* Filter bar */}
              <div
                className="flex items-center justify-between mb-4 pb-3"
                style={{ borderBottom: "1px solid #1A1A4B" }}
              >
                <div className="flex items-center gap-3">
                  <div className="text-[13px]" style={{ color: "#FFD700", fontWeight: 600 }}>
                    HIGH SCORES
                  </div>
                  <select
                    value={leaderboardFilter}
                    onChange={(e) => setLeaderboardFilter(e.target.value)}
                    className="text-[11px] px-3 py-1 cursor-pointer"
                    style={{
                      background: "#0A0A28",
                      color: "#C0D0F0",
                      border: "1px solid #2A2A5B",
                      outline: "none",
                    }}
                  >
                    <option value="all">All Games</option>
                    {GAMES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={S_DIM}>
                    {entries.length} record{entries.length !== 1 ? "s" : ""}
                  </span>
                  {entries.length > 0 && (
                    <button
                      onClick={handleClearLeaderboard}
                      className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`}
                      style={S_RED}
                      title="Clear leaderboard"
                    >
                      <Trash2 size={10} /> CLEAR
                    </button>
                  )}
                </div>
              </div>

              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px]">
                  <Trophy size={36} style={{ color: "#1A1A4B" }} className="mb-3" />
                  <div className="text-[14px] mb-1" style={S_DIM}>
                    No scores recorded yet.
                  </div>
                  <div className="text-[11px]" style={{ color: "#2A2A4B" }}>
                    Play a game and your scores will appear here.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {/* Table header */}
                  <div
                    className="grid gap-2 px-3 py-2 text-[10px]"
                    style={{
                      gridTemplateColumns: "50px 1fr 1fr 100px 1fr",
                      ...S_MUTED,
                      borderBottom: "1px solid #1A1A4B",
                      fontFamily: "'Courier New', monospace",
                    }}
                  >
                    <div>RANK</div>
                    <div>PLAYER</div>
                    <div>GAME</div>
                    <div style={{ textAlign: "right" }}>SCORE</div>
                    <div style={{ textAlign: "right" }}>DATE</div>
                  </div>

                  {/* Table rows */}
                  {entries.map((entry, idx) => {
                    const rank = getRankStyle(idx);
                    const isCurrentUser = entry.player === currentUser;
                    return (
                      <LeaderboardRow
                        key={entry.id}
                        entry={entry}
                        idx={idx}
                        isCurrentUser={isCurrentUser}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
