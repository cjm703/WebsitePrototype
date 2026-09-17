import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { retro } from "./retro-styles";
import { GitBranch, Lock, Unlock, Plus, Trash2, X, Check, ChevronDown, Link2, CreditCard, Search, Circle, Copy, Users, EyeOff, Eye, ArrowLeft, ChevronRight, Layers, Pencil, CornerDownRight, ZoomIn, ZoomOut, Scan } from "lucide-react";
import { appStore } from "@/lib/app-store";
import { loadDMNodeTrees, loadPlayerState, saveDMNodeTrees, savePlayerState } from "@/lib/player-state-api";
import { DISPLAY_CONTENTS, S_DIM, S_MUTED, S_RED, S_TEXT } from "./shared-styles";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

// Shared data types
export type NodeShape = "circle" | "diamond" | "hexagon" | "square" | "star" | "triangle";

export interface NodeTreeNode {
  id: string;
  label: string;
  description?: string;
  x: number; // 0-100 percent
  y: number; // 0-100 percent (0 = top, 100 = bottom)
  rank: number; // 0 = lowest (bottom), higher = top
  cardIds: string[]; // 1-3 cards
  prerequisites: string[]; // node ids that must be unlocked first
  unlocked?: boolean;
  shrouded?: boolean; // if true, cards are hidden from player view
  color?: string; // custom node color
  shape?: NodeShape; // node shape, defaults to circle
}

export interface NodeTree {
  id: string;
  name: string;
  assignedTo: string[]; // player ids
  nodes: NodeTreeNode[];
  connections: { from: string; to: string }[]; // node id pairs
}


// Card type for display
interface CardRef {
  id: string;
  name: string;
  type: string;
  effect: string;
  actionCost: string;
}

const NT_ACCENT = "#5AE0B0";
const SHROUD_COLOR = "#8A5ABB";

// Shared coord helpers
function nodeY(rank: number, maxRank: number) {
  const mr = Math.max(maxRank, 1);
  return 460 - (rank / mr) * 420;
}
function nodeX(x: number) { return x * 4.6 + 20; }
function playerNodeY(rank: number, maxRank: number, mapHeight: number) {
  return mapHeight - 75 - (rank / Math.max(maxRank, 1)) * (mapHeight - 150);
}
function playerNodeX(x: number) { return Math.max(42, Math.min(458, x * 4.16 + 42)); }

// Shape path generators
const ALL_SHAPES: NodeShape[] = ["circle", "diamond", "hexagon", "square", "star", "triangle"];

function shapePath(cx: number, cy: number, r: number, shape: NodeShape): string {
  switch (shape) {
    case "diamond": {
      const s = r * 1.15;
      return `M${cx},${cy - s} L${cx + s},${cy} L${cx},${cy + s} L${cx - s},${cy} Z`;
    }
    case "hexagon": {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `M${pts.join(" L")} Z`;
    }
    case "square": {
      const s = r * 0.85;
      return `M${cx - s},${cy - s} L${cx + s},${cy - s} L${cx + s},${cy + s} L${cx - s},${cy + s} Z`;
    }
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.45;
        pts.push(`${cx + rad * Math.cos(angle)},${cy + rad * Math.sin(angle)}`);
      }
      return `M${pts.join(" L")} Z`;
    }
    case "triangle": {
      const h = r * 1.1;
      return `M${cx},${cy - h} L${cx + h * 0.95},${cy + h * 0.6} L${cx - h * 0.95},${cy + h * 0.6} Z`;
    }
    default: return ""; // circle uses <circle> element
  }
}

// SVG shape element - renders a circle or path
function NodeShapeSvg({ cx, cy, r, shape, fill, stroke, strokeWidth, opacity }: {
  cx: number; cy: number; r: number; shape: NodeShape;
  fill: string; stroke: string; strokeWidth: number; opacity?: number;
}) {
  if (shape === "circle" || !shape) {
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
  }
  return <path d={shapePath(cx, cy, r, shape)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

// Outline shape for selection rings
function NodeShapeOutline({ cx, cy, r, shape, stroke, strokeWidth, opacity }: {
  cx: number; cy: number; r: number; shape: NodeShape;
  stroke: string; strokeWidth: number; opacity?: number;
}) {
  if (shape === "circle" || !shape) {
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
  }
  return <path d={shapePath(cx, cy, r, shape)} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
}

// Color palette for nodes
const NODE_COLORS = [
  { id: "default", label: "Default", value: "" },
  { id: "green", label: "Green", value: "#5AE0B0" },
  { id: "blue", label: "Blue", value: "#5A9AFF" },
  { id: "red", label: "Red", value: "#FF6A6A" },
  { id: "orange", label: "Orange", value: "#FF7A5A" },
  { id: "gold", label: "Gold", value: "#FFD700" },
  { id: "purple", label: "Purple", value: "#B05AFF" },
  { id: "pink", label: "Pink", value: "#FF5AAA" },
  { id: "cyan", label: "Cyan", value: "#5AE0E0" },
  { id: "white", label: "White", value: "#E0E0F0" },
];

// Resolve a node's display color
function resolveNodeColor(node: { color?: string; shrouded?: boolean }, fallback: string = NT_ACCENT): string {
  if (node.shrouded) return SHROUD_COLOR;
  return node.color || fallback;
}

function resolvePlayerNodeColor(node: NodeTreeNode, unlocked: boolean): string {
  return node.shrouded && !unlocked ? SHROUD_COLOR : node.color || NT_ACCENT;
}

function playerNodeLabelLines(label: string): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["Unnamed Node"];
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    if (current && `${current} ${word}`.length <= 18) lines[lines.length - 1] = `${current} ${word}`;
    else lines.push(word.length > 18 ? `${word.slice(0, 17)}…` : word);
  }
  if (lines.length <= 2) return lines;
  return [lines[0], `${lines[1].slice(0, 16)}…`];
}

export function collectRevealedTreeCardIds(
  tree: Pick<NodeTree, "nodes"> | null,
  unlockedIds: readonly string[],
  existingCardIds?: ReadonlySet<string>,
): Set<string> {
  const unlocked = new Set(unlockedIds);
  return new Set(
    (tree?.nodes || [])
      .filter((node) => unlocked.has(node.id))
      .flatMap((node) => node.cardIds)
      .filter((cardId) => !existingCardIds || existingCardIds.has(cardId)),
  );
}

// Small shape preview for UI (non-SVG context, using inline SVG)
function ShapePreviewMini({ shape, color, size = 14, selected }: { shape: NodeShape; color: string; size?: number; selected?: boolean }) {
  const r = size / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {shape === "circle" || !shape
        ? <circle cx={cx} cy={cy} r={r} fill={color} stroke={selected ? "#FFF" : "none"} strokeWidth={selected ? 1 : 0} />
        : <path d={shapePath(cx, cy, r, shape)} fill={color} stroke={selected ? "#FFF" : "none"} strokeWidth={selected ? 1 : 0} />
      }
    </svg>
  );
}

// Player node tree viewer
interface PlayerNodeTreeViewerProps {
  playerId: string;
  theme: {
    accentColor: string;
    panelBg: string;
    inputBg: string;
    textColor: string;
    labelColor: string;
    cardBg: string;
    panelBorder: string;
  };
  cards: CardRef[];
  onUnlocksChange?: (unlocks: Record<string, string[]>) => void;
}

export function PlayerNodeTreeViewer({ playerId, theme, cards, onUnlocksChange }: PlayerNodeTreeViewerProps) {
  const [trees, setTrees] = useState<NodeTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<CardRef | null>(null);
  const [unlocks, setUnlocks] = useState<Record<string, string[]>>({});
  const [mapZoom, setMapZoom] = useState(1);
  const [fitMap, setFitMap] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [celebratingNodeId, setCelebratingNodeId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!celebratingNodeId) return undefined;
    const timeout = window.setTimeout(() => setCelebratingNodeId(null), 1400);
    return () => window.clearTimeout(timeout);
  }, [celebratingNodeId]);

  useEffect(() => {
    if (!selectedNodeId || window.innerWidth >= 1280) return undefined;
    const timeout = window.setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest" }), 50);
    return () => window.clearTimeout(timeout);
  }, [selectedNodeId, prefersReducedMotion]);


  useEffect(() => {
    let cancelled = false;

    async function loadViewerData() {
      try {
        setError(null);

        const [treeData, playerState] = await Promise.all([
          appStore.listNodeTrees<NodeTree>(),
          loadPlayerState(),
        ]);

        const unlockData = (playerState?.nodeUnlocks ?? {}) as Record<string, string[]>;

        if (cancelled) return;

        setTrees(treeData);
        setUnlocks(unlockData);
        onUnlocksChange?.(unlockData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load node trees");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadViewerData();

    return () => {
      cancelled = true;
    };
  }, [playerId, onUnlocksChange]);

  const myTrees = useMemo(
    () => trees.filter((t) => t.assignedTo.includes(playerId) || t.assignedTo.includes("all")),
    [trees, playerId],
  );

  useEffect(() => {
    if (myTrees.length === 0) {
      setSelectedTreeId(null);
      setSelectedNodeId(null);
      return;
    }

    if (!selectedTreeId || !myTrees.find((t) => t.id === selectedTreeId)) {
      setSelectedTreeId(myTrees[0].id);
      setSelectedNodeId(null);
    }
  }, [myTrees, selectedTreeId]);

  const activeTree = myTrees.find((t) => t.id === selectedTreeId) || null;
  const treeUnlocks = (selectedTreeId && unlocks[selectedTreeId]) || [];

  const isNodeUnlocked = useCallback(
    (nodeId: string) => treeUnlocks.includes(nodeId),
    [treeUnlocks],
  );

  const canUnlockNode = useCallback(
    (node: NodeTreeNode) => {
      if (isNodeUnlocked(node.id)) return false;
      return node.prerequisites.every((preId) => treeUnlocks.includes(preId));
    },
    [treeUnlocks, isNodeUnlocked],
  );

  const handleUnlockNode = useCallback(
    async (nodeId: string) => {
      if (!selectedTreeId) return;
      const node = activeTree?.nodes.find((entry) => entry.id === nodeId);
      if (!node || !canUnlockNode(node)) return;

      const currentTreeUnlocks = unlocks[selectedTreeId] || [];
      if (currentTreeUnlocks.includes(nodeId)) return;

      const newUnlocks = {
        ...unlocks,
        [selectedTreeId]: [...currentTreeUnlocks, nodeId],
      };

      try {
        setError(null);
        await savePlayerState({ nodeUnlocks: newUnlocks });
        setUnlocks(newUnlocks);
        onUnlocksChange?.(newUnlocks);
        setCelebratingNodeId(nodeId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unlock node");
      }
    },
    [unlocks, selectedTreeId, activeTree, canUnlockNode, onUnlocksChange],
  );

  const selectedNode = activeTree?.nodes.find((n) => n.id === selectedNodeId) || null;
  const nodeCards = selectedNode && isNodeUnlocked(selectedNode.id)
    ? selectedNode.cardIds
        .map((cid) => cards.find((c) => c.id === cid))
        .filter(Boolean) as CardRef[]
    : [];
  const maxRank = useMemo(
    () => (activeTree ? Math.max(0, ...activeTree.nodes.map((n) => n.rank)) : 0),
    [activeTree],
  );
  const mapHeight = Math.max(500, maxRank * 95 + 150);
  const revealedCardIds = useMemo(
    () => collectRevealedTreeCardIds(activeTree, treeUnlocks, new Set(cards.map((card) => card.id))),
    [activeTree, treeUnlocks, cards],
  );
  const unlockedNodeCount = activeTree?.nodes.filter((node) => isNodeUnlocked(node.id)).length || 0;
  const unlockableNodeCount = useMemo(
    () => (activeTree ? activeTree.nodes.filter((node) => !isNodeUnlocked(node.id) && canUnlockNode(node)).length : 0),
    [activeTree, canUnlockNode, isNodeUnlocked],
  );

  if (loading) {
    return (
      <div className="text-center py-8">
        <GitBranch size={36} style={{ color: "#2A3A5B", margin: "0 auto 12px" }} />
        <div className="text-[14px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>
          LOADING NODE TREES
        </div>
        <div className="text-[12px]" style={S_DIM}>Loading saved node tree data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <GitBranch size={36} style={{ color: "#5A2A2A", margin: "0 auto 12px" }} />
        <div className="text-[14px] mb-2" style={{ color: "#FF8A8A", fontWeight: 600 }}>
          NODE TREE ERROR
        </div>
        <div className="text-[12px]" style={{ color: "#D8A0A0" }}>{error}</div>
      </div>
    );
  }

  if (myTrees.length === 0) {
    return (
      <div className="text-center py-8">
        <GitBranch size={36} style={{ color: "#2A3A5B", margin: "0 auto 12px" }} />
        <div className="text-[14px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>NO NODE TREES</div>
        <div className="text-[12px]" style={S_DIM}>Your DM hasn't assigned any node trees to you yet.</div>
      </div>
    );
  }

  // Card detail overlay
  if (viewingCard) {
    return (
      <div className="space-y-3">
        <button onClick={() => setViewingCard(null)} className="flex items-center gap-1 text-[12px] hover:opacity-80" style={{ color: NT_ACCENT }}>
          <ArrowLeft size={14} /> Back to Node Tree
        </button>
        <div className={`${retro.raised} p-4`} style={{ background: theme.panelBg }}>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} style={{ color: "#FF7A5A" }} />
            <h2 className="text-[16px]" style={{ color: "#FF7A5A", fontWeight: 600 }}>{viewingCard.name}</h2>
          </div>
          <div className="flex gap-3 flex-wrap mb-3">
            {viewingCard.type && (
              <span className="text-[10px] px-2 py-0.5" style={{ background: "#FF7A5A18", color: "#FF7A5A", border: "1px solid #FF7A5A33" }}>{viewingCard.type}</span>
            )}
            {viewingCard.actionCost && (
              <span className="text-[10px] px-2 py-0.5" style={{ background: "#FFD70018", color: "#FFD700", border: "1px solid #FFD70033" }}>Cost: {viewingCard.actionCost}</span>
            )}
          </div>
          {viewingCard.effect && (
            <div className={`${retro.sunken} p-3`} style={{ background: theme.inputBg }}>
              <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>Effect:</div>
              <div className="text-[12px]" style={{ color: theme.textColor }} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(viewingCard.effect) }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tree selector */}
      <div className="flex items-center gap-2 flex-wrap" aria-label="Choose a node tree">
        <span className="text-[10px] uppercase tracking-[0.12em] mr-1" style={{ color: theme.labelColor }}>Your paths</span>
        {myTrees.map(t => {
          const tUnlocks = t.nodes.filter((node) => (unlocks[t.id] || []).includes(node.id)).length;
          return (
            <button
              key={t.id}
              onClick={() => { setSelectedTreeId(t.id); setSelectedNodeId(null); }}
              aria-pressed={selectedTreeId === t.id}
              className={`${selectedTreeId === t.id ? retro.sunken : retro.raised} px-3 py-2 text-[11px] transition-colors`}
              style={{
                color: selectedTreeId === t.id ? NT_ACCENT : theme.labelColor,
                fontWeight: selectedTreeId === t.id ? 600 : 400,
                background: selectedTreeId === t.id ? theme.panelBg : theme.cardBg,
                border: `1px solid ${selectedTreeId === t.id ? `${NT_ACCENT}80` : theme.panelBorder}`,
              }}
            >
              <GitBranch size={11} className="inline mr-1" />
              {t.name}
              <span className="text-[9px] ml-2 opacity-70">{tUnlocks}/{t.nodes.length}</span>
            </button>
          );
        })}
      </div>

      {activeTree && (
        <div className="space-y-4">
          <div className={`${retro.raised} relative overflow-hidden p-4 sm:p-5`} style={{ background: "radial-gradient(circle at 88% 0%, #18365A 0%, #101936 36%, #090D25 100%)", border: `1px solid ${NT_ACCENT}44` }}>
            <div className="absolute -right-8 -top-10 w-40 h-40 rounded-full pointer-events-none" style={{ background: `${NT_ACCENT}13`, filter: "blur(34px)" }} />
            <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${NT_ACCENT}17`, border: `1px solid ${NT_ACCENT}66`, color: NT_ACCENT }}><GitBranch size={19} /></div>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.17em] mb-1" style={{ color: NT_ACCENT }}>Progression constellation</div>
                  <h3 className="text-[18px] sm:text-[21px] leading-tight font-bold break-words" style={{ color: theme.textColor }}>{activeTree.name}</h3>
                  <p className="text-[11px] mt-1" style={{ color: theme.labelColor }}>Follow the lit paths to reveal the next part of your story.</p>
                </div>
              </div>
              <div className="shrink-0 sm:text-right">
                <div className="text-[20px] font-bold" style={{ color: NT_ACCENT }}>{unlockedNodeCount}<span className="text-[12px] font-normal" style={{ color: theme.labelColor }}> / {activeTree.nodes.length} nodes</span></div>
                <div className="text-[10px]" style={{ color: theme.labelColor }}>{unlockableNodeCount} ready to unlock · {revealedCardIds.size} revealed card{revealedCardIds.size === 1 ? "" : "s"}</div>
              </div>
            </div>
            <div className="relative mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: "#273552" }} role="progressbar" aria-label={`${activeTree.name} progress`} aria-valuenow={unlockedNodeCount} aria-valuemin={0} aria-valuemax={activeTree.nodes.length}>
              <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${activeTree.nodes.length ? (unlockedNodeCount / activeTree.nodes.length) * 100 : 0}%`, background: `linear-gradient(90deg, #4A8EB3, ${NT_ACCENT})`, boxShadow: `0 0 12px ${NT_ACCENT}88` }} />
            </div>
            <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px]" style={{ color: theme.labelColor }}>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: NT_ACCENT, boxShadow: `0 0 8px ${NT_ACCENT}` }} />Unlocked</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: "#FFD166", background: "#FFD16633" }} />Ready</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: "#667899", background: "#172038" }} />Locked</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: SHROUD_COLOR, background: `${SHROUD_COLOR}33` }} />Shrouded</span>
            </div>
          </div>

          <div className="flex gap-4 flex-col xl:flex-row items-start">
            <div className={`${retro.sunken} w-full xl:flex-1 xl:min-w-0 overflow-hidden`} style={{ background: "#080E22", border: "1px solid #2A4561" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap px-3 sm:px-4 py-3" style={{ background: "#0D1931", borderBottom: "1px solid #25415B" }}>
                <div>
                  <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: NT_ACCENT }}><GitBranch size={13} /> Constellation map</div>
                  <div className="text-[9px] mt-0.5" style={{ color: theme.labelColor }}>Select a node to inspect its path and rewards.</div>
                </div>
                <div className="flex items-center gap-1.5" aria-label="Map zoom controls">
                  <button type="button" aria-label="Zoom out" onClick={() => { if (mapZoom <= 1) setFitMap(true); else { setMapZoom((value) => Math.max(1, value - 0.25)); setFitMap(false); } }} className={`${retro.button} p-2`} style={{ color: theme.textColor }}><ZoomOut size={14} /></button>
                  <button type="button" aria-label="Fit map to width" aria-pressed={fitMap} onClick={() => { setMapZoom(1); setFitMap(true); }} className={`${retro.button} px-2.5 py-2 text-[10px] flex items-center gap-1`} style={{ color: fitMap ? NT_ACCENT : theme.textColor }}><Scan size={13} /> Fit</button>
                  <button type="button" aria-label="Zoom in" onClick={() => { setFitMap(false); setMapZoom((value) => Math.min(2, value + 0.25)); }} className={`${retro.button} p-2`} style={{ color: theme.textColor }}><ZoomIn size={14} /></button>
                </div>
              </div>
              <div className="overflow-auto overscroll-contain" style={{ scrollbarColor: "#385C77 #091329", maxHeight: "min(78vh, 860px)" }}>
              <svg viewBox={`0 0 500 ${mapHeight}`} role="group" aria-label={`${activeTree.name} progression map`} className="block h-auto" style={{ width: fitMap ? "100%" : `max(${Math.round(620 * mapZoom)}px, ${Math.round(100 * mapZoom)}%)`, aspectRatio: `500 / ${mapHeight}` }} preserveAspectRatio="xMidYMid meet">
                <defs>
                  <radialGradient id="player-tree-sky" cx="50%" cy="40%" r="75%"><stop offset="0%" stopColor="#132642" /><stop offset="65%" stopColor="#0B1730" /><stop offset="100%" stopColor="#070D20" /></radialGradient>
                  <pattern id="player-tree-stars" width="86" height="76" patternUnits="userSpaceOnUse"><circle cx="11" cy="17" r="0.9" fill="#A4C9E6" opacity="0.42" /><circle cx="62" cy="51" r="0.7" fill="#A4C9E6" opacity="0.35" /><circle cx="37" cy="68" r="0.55" fill="#D1E5F1" opacity="0.24" /></pattern>
                </defs>
                <rect width="500" height={mapHeight} fill="url(#player-tree-sky)" />
                <rect width="500" height={mapHeight} fill="url(#player-tree-stars)" />
                {Array.from(new Set(activeTree.nodes.map((node) => node.rank))).sort((a, b) => a - b).map((rank) => (
                  <g key={`rank-${rank}`}>
                    <line x1={24} y1={playerNodeY(rank, maxRank, mapHeight)} x2={476} y2={playerNodeY(rank, maxRank, mapHeight)} stroke="#4A6C89" strokeWidth={0.6} strokeDasharray="2 7" opacity={0.38} />
                    <text x={27} y={playerNodeY(rank, maxRank, mapHeight) - 28} fill="#6D91A8" fontSize={8} fontWeight={700} letterSpacing={1.2}>RANK {rank}</text>
                  </g>
                ))}

                {activeTree.connections.map((conn, ci) => {
                  const fromN = activeTree.nodes.find((n) => n.id === conn.from);
                  const toN = activeTree.nodes.find((n) => n.id === conn.to);
                  if (!fromN || !toN) return null;
                  const fromUnlocked = isNodeUnlocked(fromN.id);
                  const toUnlocked = isNodeUnlocked(toN.id);
                  const bothUnlocked = fromUnlocked && toUnlocked;
                  const nextReady = !bothUnlocked && ((fromUnlocked && canUnlockNode(toN)) || (toUnlocked && canUnlockNode(fromN)));
                  const lineColor = bothUnlocked ? (fromN.color || toN.color || NT_ACCENT) : nextReady ? "#FFD166" : "#44607B";
                  return (
                    <g key={`c${ci}`}>
                      {bothUnlocked && <line x1={playerNodeX(fromN.x)} y1={playerNodeY(fromN.rank, maxRank, mapHeight)} x2={playerNodeX(toN.x)} y2={playerNodeY(toN.rank, maxRank, mapHeight)} stroke={lineColor} strokeWidth={9} opacity={0.11} />}
                      <line x1={playerNodeX(fromN.x)} y1={playerNodeY(fromN.rank, maxRank, mapHeight)} x2={playerNodeX(toN.x)} y2={playerNodeY(toN.rank, maxRank, mapHeight)} stroke={lineColor} strokeWidth={bothUnlocked ? 3 : 1.7} strokeDasharray={bothUnlocked ? undefined : nextReady ? "3 5" : "2 6"} strokeLinecap="round" opacity={bothUnlocked ? 0.9 : nextReady ? 0.8 : 0.42} />
                    </g>
                  );
                })}

                {activeTree.nodes.map((node) => {
                  const ny = playerNodeY(node.rank, maxRank, mapHeight);
                  const nx = playerNodeX(node.x);
                  const unlocked = isNodeUnlocked(node.id);
                  const canUnlock = canUnlockNode(node);
                  const isSelected = selectedNodeId === node.id;
                  const isShrouded = !!node.shrouded && !unlocked;
                  const r = 19;
                  const nColor = resolvePlayerNodeColor(node, unlocked);
                  const nShape = node.shape || "circle";
                  const labelLines = isShrouded ? ["Unknown Node"] : playerNodeLabelLines(node.label);
                  const labelAnchor = nx < 95 ? "start" : nx > 405 ? "end" : "middle";
                  const cardCount = unlocked ? node.cardIds.filter((cardId) => cards.some((card) => card.id === cardId)).length : 0;
                  const nodeState = unlocked ? "unlocked" : canUnlock ? "ready to unlock" : "locked";

                  return (
                    <g key={node.id} role="button" tabIndex={0} aria-label={`${isShrouded ? "Shrouded node" : node.label}, ${nodeState}`} aria-pressed={isSelected} style={{ cursor: "pointer", outline: "none" }} onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedNodeId(node.id === selectedNodeId ? null : node.id); } }} onFocus={() => setFocusedNodeId(node.id)} onBlur={() => setFocusedNodeId(null)}>
                      <title>{isShrouded ? "Shrouded node" : node.label} — {nodeState}</title>
                      <circle cx={nx} cy={ny} r={30} fill="transparent" />
                      {unlocked && <circle cx={nx} cy={ny} r={r + 11} fill={nColor} opacity={0.12} />}
                      {unlocked && <circle cx={nx} cy={ny} r={r + 6} fill="none" stroke={nColor} strokeWidth={1} opacity={0.45} />}
                      {canUnlock && !unlocked && (
                        <circle cx={nx} cy={ny} r={r + 8} fill="none" stroke={isShrouded ? SHROUD_COLOR : "#FFD166"} strokeWidth={1.4} opacity={0.72}>
                          {!prefersReducedMotion && <animate attributeName="r" values={`${r + 6};${r + 11};${r + 6}`} dur="2.5s" repeatCount="indefinite" />}
                          {!prefersReducedMotion && <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2.5s" repeatCount="indefinite" />}
                        </circle>
                      )}
                      {celebratingNodeId === node.id && !prefersReducedMotion && (
                        <circle cx={nx} cy={ny} r={r + 5} fill="none" stroke={nColor} strokeWidth={2} opacity={0.85}>
                          <animate attributeName="r" values={`${r + 5};${r + 28}`} dur="1.2s" fill="freeze" />
                          <animate attributeName="opacity" values="0.85;0" dur="1.2s" fill="freeze" />
                        </circle>
                      )}
                      {(isSelected || focusedNodeId === node.id) && <NodeShapeOutline cx={nx} cy={ny} r={r + 12} shape={nShape} stroke="#F1FAFF" strokeWidth={1.6} opacity={0.9} />}
                      <NodeShapeSvg
                        cx={nx}
                        cy={ny}
                        r={r}
                        shape={nShape}
                        fill={unlocked ? nColor : isShrouded ? "#211A39" : canUnlock ? `${nColor}30` : "#172039"}
                        stroke={unlocked ? "#E5FFFA" : isShrouded ? SHROUD_COLOR : canUnlock ? nColor : "#687D9B"}
                        strokeWidth={unlocked || isSelected ? 2.3 : 1.8}
                      />
                      {!unlocked && !canUnlock && !isShrouded && (
                        <g fill="none" stroke="#9EB0C9" strokeWidth={1.6} strokeLinecap="round"><path d={`M${nx - 5},${ny - 2} v-4 a5,5 0 0 1 10,0 v4`} /><rect x={nx - 7} y={ny - 2} width={14} height={10} rx={2} /></g>
                      )}
                      {isShrouded && !unlocked && (
                        <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill="#D7B5FF" fontSize={17} fontWeight={700}>?</text>
                      )}
                      {unlocked && (
                        <path d={`M${nx - 8},${ny} l6,6 11,-13`} fill="none" stroke="#071A22" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
                      )}
                      {canUnlock && !unlocked && !isShrouded && (
                        <path d={`M${nx - 7},${ny} h14 M${nx},${ny - 7} v14`} fill="none" stroke="#FFE7A7" strokeWidth={2.4} strokeLinecap="round" />
                      )}
                      <text
                        x={nx}
                        y={ny + r + 16}
                        textAnchor={labelAnchor}
                        fill={isShrouded ? "#B69ACF" : unlocked ? "#D5FFF5" : canUnlock ? "#FFE3A1" : "#9EAFCA"}
                        fontSize={10.5}
                        fontWeight={unlocked || canUnlock ? 700 : 500}
                        paintOrder="stroke"
                        stroke="#091329"
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                      >
                        {labelLines.map((line, index) => <tspan key={`${node.id}-line-${index}`} x={nx} dy={index === 0 ? 0 : 13}>{line}</tspan>)}
                      </text>
                      {cardCount > 0 && (
                        <g>
                          <circle cx={nx + r - 1} cy={ny - r + 1} r={8} fill="#FF8C71" stroke="#091329" strokeWidth={1.8} />
                          <text x={nx + r - 1} y={ny - r + 2} textAnchor="middle" dominantBaseline="middle" fill="#141522" fontSize={9} fontWeight={800}>
                            {cardCount}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-[9px]" style={{ color: theme.labelColor, borderTop: "1px solid #25415B", background: "#0B172C" }}>
                <span>{fitMap ? "Fit view. Zoom in to inspect details." : "Scroll horizontally on smaller screens to explore."}</span>
                <span className="shrink-0" style={{ color: NT_ACCENT }}>{fitMap ? "FIT" : `${Math.round(mapZoom * 100)}%`}</span>
              </div>
            </div>

            <div ref={detailsRef} className="w-full xl:w-80 shrink-0 space-y-3 scroll-mt-4 xl:sticky xl:top-4">
              {selectedNode ? (
                <div className="space-y-3">
                  <div className={`${retro.raised} p-4`} style={{ background: "linear-gradient(160deg, #142541, #0C1430)", border: `1px solid ${resolvePlayerNodeColor(selectedNode, isNodeUnlocked(selectedNode.id))}66` }}>
                    <div className="text-[9px] uppercase tracking-[0.14em] mb-3" style={{ color: theme.labelColor }}>Selected node</div>
                    {selectedNode.shrouded && !isNodeUnlocked(selectedNode.id) ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${SHROUD_COLOR}25`, color: SHROUD_COLOR }}><EyeOff size={17} /></div>
                          <div className="text-[16px]" style={{ color: "#D7B5FF", fontWeight: 700 }}>Shrouded Node</div>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: theme.textColor }}>
                          This part of the path is still a mystery. Its name, story, and rewards will appear when you unlock it.
                        </p>
                        {canUnlockNode(selectedNode) ? (
                          <button onClick={() => void handleUnlockNode(selectedNode.id)} className={`${retro.button} w-full text-[11px] font-semibold flex items-center justify-center gap-2 py-2.5`} style={{ color: "#160E29", background: "#C79CF6" }}><Unlock size={14} /> Unlock Unknown Node</button>
                        ) : (
                          <div className="text-[10px] flex items-center gap-1.5 px-3 py-2" style={{ color: "#C2ABD9", background: `${SHROUD_COLOR}15`, border: `1px solid ${SHROUD_COLOR}44` }}><Lock size={12} /> Follow the preceding path to reach this node.</div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${resolvePlayerNodeColor(selectedNode, isNodeUnlocked(selectedNode.id))}22`, border: `1px solid ${resolvePlayerNodeColor(selectedNode, isNodeUnlocked(selectedNode.id))}66` }}><ShapePreviewMini shape={selectedNode.shape || "circle"} color={resolvePlayerNodeColor(selectedNode, isNodeUnlocked(selectedNode.id))} size={19} /></div>
                          <div className="min-w-0">
                            <div className="text-[15px] leading-tight font-bold break-words" style={{ color: theme.textColor }}>{selectedNode.label}</div>
                            <div className="text-[10px] mt-1" style={{ color: theme.labelColor }}>Rank {selectedNode.rank}</div>
                          </div>
                        </div>
                        {selectedNode.description && (
                          <p className="text-[11px] leading-relaxed" style={{ color: theme.textColor }}>{selectedNode.description}</p>
                        )}
                        {isNodeUnlocked(selectedNode.id) ? (
                          <div className="flex items-center gap-2 text-[11px] px-3 py-2" style={{ background: `${resolvePlayerNodeColor(selectedNode, true)}20`, color: "#CAFFF1", border: `1px solid ${resolvePlayerNodeColor(selectedNode, true)}66` }}>
                            <Check size={14} /> Unlocked · {nodeCards.length} revealed card{nodeCards.length === 1 ? "" : "s"}
                          </div>
                        ) : canUnlockNode(selectedNode) ? (
                          <button onClick={() => void handleUnlockNode(selectedNode.id)} className={`${retro.button} w-full text-[11px] font-semibold flex items-center justify-center gap-2 py-2.5`} style={{ color: "#241A05", background: "#FFD166" }}>
                            <Unlock size={14} /> Unlock Node
                          </button>
                        ) : (
                          <div className="text-[10px] px-3 py-2 leading-relaxed" style={{ background: "#26324A", color: "#C4D4E9", border: "1px solid #5B7295" }}>
                            <Lock size={12} className="inline mr-1.5 align-middle" />
                            Requires {selectedNode.prerequisites.map((pId) => {
                              const preNode = activeTree.nodes.find((n) => n.id === pId);
                              return preNode?.shrouded && !isNodeUnlocked(preNode.id) ? "an unknown node" : preNode?.label || "an earlier node";
                            }).join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isNodeUnlocked(selectedNode.id) && nodeCards.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: "#FFAE93" }}><CreditCard size={12} /> Revealed cards</div>
                      {nodeCards.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => setViewingCard(card)}
                          className={`${retro.raised} p-3 w-full text-left hover:brightness-110 transition-all cursor-pointer`}
                          style={{ background: theme.cardBg, border: "1px solid #FF8C7144" }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <CreditCard size={13} style={{ color: "#FFAE93" }} />
                            <span className="text-[12px]" style={{ color: "#FFAE93", fontWeight: 700 }}>{card.name}</span>
                            <ChevronRight size={10} className="ml-auto" style={{ color: "#4A5A7A" }} />
                          </div>
                          <div className="text-[10px] mb-1" style={{ color: theme.labelColor }}>
                            {card.type}{card.actionCost ? ` | ${card.actionCost}` : ""}
                          </div>
                          {card.effect && (
                            <div className="text-[10px] leading-relaxed" style={{ color: theme.textColor, opacity: 0.85 }}>
                              {card.effect.replace(/<[^>]*>/g, "").slice(0, 80)}
                              {card.effect.replace(/<[^>]*>/g, "").length > 80 ? "..." : ""}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {!isNodeUnlocked(selectedNode.id) && (
                    <div className={`${retro.sunken} p-4 text-center`} style={{ background: "#101A31", border: "1px dashed #435A76" }}>
                      <EyeOff size={17} style={{ color: "#9AACC5", margin: "0 auto 7px" }} />
                      <div className="text-[11px]" style={{ color: theme.textColor }}>Rewards are concealed until this node is unlocked.</div>
                    </div>
                  )}
                  {isNodeUnlocked(selectedNode.id) && nodeCards.length === 0 && (
                    <div className="text-[11px] text-center py-3" style={S_DIM}>No cards assigned to this node.</div>
                  )}
                </div>
              ) : (
                <div className={`${retro.sunken} p-6 text-center`} style={{ background: "#101A31", border: "1px dashed #365270" }}>
                  <Circle size={27} style={{ color: "#6789A9", margin: "0 auto 10px" }} />
                  <div className="text-[12px] font-semibold" style={{ color: theme.textColor }}>Choose a node</div>
                  <div className="text-[10px] mt-1" style={S_DIM}>Select a star on the map to see its path and rewards.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// DM node tree builder
interface DMNodeTreeBuilderProps {
  players: { id: string; name: string }[];
  cards: CardRef[];
  onCardNodeAssign?: (cardId: string, treeId: string, nodeId: string) => void;
  onCardNodeUnassign?: (cardId: string) => void;
}

type DmEditorTab = "properties" | "prereqs" | "cards" | "connections";

export function DMNodeTreeBuilder({ players, cards, onCardNodeAssign, onCardNodeUnassign }: DMNodeTreeBuilderProps) {
  const [trees, setTrees] = useState<NodeTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showNewTreeForm, setShowNewTreeForm] = useState(false);
  const [newTreeName, setNewTreeName] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [assignDropdown, setAssignDropdown] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<DmEditorTab>("properties");
  const [nodeSearch, setNodeSearch] = useState("");
  const [showNodeList, setShowNodeList] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [confirmDeleteTree, setConfirmDeleteTree] = useState<string | null>(null);
  const [renamingTreeId, setRenamingTreeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const treesRef = useRef<NodeTree[]>([]);


  const selectedTree = trees.find(t => t.id === selectedTreeId) || null;
  const editingNode = selectedTree?.nodes.find(n => n.id === editingNodeId) || null;

  useEffect(() => {
    treesRef.current = trees;
  }, [trees]);


async function persistTrees(next: NodeTree[]) {
  treesRef.current = next;
  setTrees(next);

  try {
    setError(null);
    await saveDMNodeTrees(next as unknown as Record<string, unknown>[]);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to save node trees");
    throw err;
  }
}

const commitRenameTree = useCallback(async (treeId: string) => {
  const trimmed = renameValue.trim();
  if (!trimmed) {
    setRenamingTreeId(null);
    return;
  }

  const next = treesRef.current.map((tr) =>
    tr.id === treeId ? { ...tr, name: trimmed } : tr
  );

  await persistTrees(next);
  setRenamingTreeId(null);
}, [renameValue]);

useEffect(() => {
  let cancelled = false;

  async function loadDmNodeTrees() {
    try {
      setError(null);
      const data = await loadDMNodeTrees() as NodeTree[];

      if (cancelled) return;
      setTrees(data);
    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load node trees");
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  }

  void loadDmNodeTrees();

  return () => {
    cancelled = true;
  };
}, []);

  // Tree CRUD
  const createTree = useCallback(async () => {
    const name = newTreeName.trim();
    if (!name) return;

    const tree: NodeTree = {
      id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      assignedTo: [],
      nodes: [],
      connections: [],
    };

    await persistTrees([...treesRef.current, tree]);
    setSelectedTreeId(tree.id);
    setNewTreeName("");
    setShowNewTreeForm(false);
  }, [newTreeName]);

  const deleteTree = useCallback(async (id: string) => {
    const currentTrees = treesRef.current;
    const tree = currentTrees.find((t) => t.id === id);

    if (tree) {
      for (const node of tree.nodes) {
        for (const cid of node.cardIds) {
          onCardNodeUnassign?.(cid);
        }
      }
    }

    const next = currentTrees.filter((t) => t.id !== id);
    await persistTrees(next);

    if (selectedTreeId === id) {
      setSelectedTreeId(null);
      setEditingNodeId(null);
    }

    setConfirmDeleteTree(null);
  }, [selectedTreeId, onCardNodeUnassign]);

  const duplicateTree = useCallback(async (id: string) => {
    const currentTrees = treesRef.current;
    const src = currentTrees.find((t) => t.id === id);
    if (!src) return;

    const newId = `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nodeIdMap: Record<string, string> = {};

    const newNodes = src.nodes.map((n) => {
      const nid = `nd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nodeIdMap[n.id] = nid;
      return {
        ...n,
        id: nid,
        prerequisites: [...n.prerequisites],
        cardIds: [...n.cardIds],
      };
    });

    newNodes.forEach((n) => {
      n.prerequisites = n.prerequisites.map((p) => nodeIdMap[p] || p);
    });

    const newConns = src.connections.map((c) => ({
      from: nodeIdMap[c.from] || c.from,
      to: nodeIdMap[c.to] || c.to,
    }));

    const clone: NodeTree = {
      id: newId,
      name: src.name + " (Copy)",
      assignedTo: [],
      nodes: newNodes,
      connections: newConns,
    };

    await persistTrees([...currentTrees, clone]);
    setSelectedTreeId(newId);
  }, []);

  const updateTree = useCallback(async (updater: (t: NodeTree) => NodeTree) => {
    if (!selectedTreeId) return;

    const next = treesRef.current.map((t) =>
      t.id === selectedTreeId ? updater(t) : t
    );

    await persistTrees(next);
  }, [selectedTreeId]);


  // Node CRUD
  const addNode = useCallback(() => {
    const existingRanks = selectedTree?.nodes.map(n => n.rank) || [];
    const nextRank = existingRanks.length > 0 ? Math.max(...existingRanks) + 1 : 0;
    const node: NodeTreeNode = {
      id: `nd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: "New Node",
      x: 45 + Math.random() * 10,
      y: 50,
      rank: Math.min(nextRank, 20),
      cardIds: [],
      prerequisites: [],
    };
    updateTree(t => ({ ...t, nodes: [...t.nodes, node] }));
    setEditingNodeId(node.id);
    setEditorTab("properties");
  }, [updateTree, selectedTree]);

  const deleteNode = useCallback((nodeId: string) => {
    const node = selectedTree?.nodes.find(n => n.id === nodeId);
    if (node) {
      for (const cid of node.cardIds) { onCardNodeUnassign?.(cid); }
    }
    updateTree(t => ({
      ...t,
      nodes: t.nodes.filter(n => n.id !== nodeId).map(n => ({
        ...n, prerequisites: n.prerequisites.filter(p => p !== nodeId),
      })),
      connections: t.connections.filter(c => c.from !== nodeId && c.to !== nodeId),
    }));
    if (editingNodeId === nodeId) setEditingNodeId(null);
  }, [updateTree, editingNodeId, selectedTree, onCardNodeUnassign]);

  const duplicateNode = useCallback((nodeId: string) => {
    const src = selectedTree?.nodes.find(n => n.id === nodeId);
    if (!src) return;
    const newNode: NodeTreeNode = {
      ...src,
      id: `nd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: src.label + " (Copy)",
      x: Math.min(100, src.x + 8),
      prerequisites: [...src.prerequisites],
      cardIds: [...src.cardIds],
    };
    updateTree(t => ({ ...t, nodes: [...t.nodes, newNode] }));
    setEditingNodeId(newNode.id);
  }, [updateTree, selectedTree]);

  const updateNode = useCallback((nodeId: string, updates: Partial<NodeTreeNode>) => {
    updateTree(t => ({
      ...t,
      nodes: t.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n),
    }));
  }, [updateTree]);

  const updateNodeLocal = useCallback((nodeId: string, updates: Partial<NodeTreeNode>) => {
    if (!selectedTreeId) return;

    setTrees((prev) => {
      const next = prev.map((t) =>
        t.id === selectedTreeId
          ? {
              ...t,
              nodes: t.nodes.map((n) => n.id === nodeId ? { ...n, ...updates } : n),
            }
          : t
      );

      treesRef.current = next;
      return next;
    });
  }, [selectedTreeId]);

  // Connections
  const toggleConnection = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    updateTree(t => {
      const exists = t.connections.some(c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId));
      if (exists) {
        return { ...t, connections: t.connections.filter(c => !((c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId))) };
      }
      return { ...t, connections: [...t.connections, { from: fromId, to: toId }] };
    });
  }, [updateTree]);

  const removeConnection = useCallback((fromId: string, toId: string) => {
    updateTree(t => ({
      ...t,
      connections: t.connections.filter(c => !((c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId))),
    }));
  }, [updateTree]);

  const toggleAssign = useCallback((playerId: string) => {
    updateTree(t => {
      const has = t.assignedTo.includes(playerId);
      return { ...t, assignedTo: has ? t.assignedTo.filter(p => p !== playerId) : [...t.assignedTo, playerId] };
    });
  }, [updateTree]);

  const maxRank = useMemo(() => selectedTree ? Math.max(0, ...selectedTree.nodes.map(n => n.rank)) : 0, [selectedTree]);

  // Drag
  const handleSvgMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom === "__waiting__") { setConnectingFrom(nodeId); return; }
    if (connectingFrom && connectingFrom !== "__waiting__") {
      toggleConnection(connectingFrom, nodeId);
      setConnectingFrom(null);
      return;
    }
    setDraggingNode(nodeId);
    setEditingNodeId(nodeId);
  }, [connectingFrom, toggleConnection]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * 500;
    const svgY = ((e.clientY - rect.top) / rect.height) * 500;

    let newX = Math.max(0, Math.min(100, (svgX - 20) / 4.6));
    const mxR = Math.max(maxRank, 5);
    const yNorm = Math.max(0, Math.min(100, ((460 - svgY) / 420) * 100));
    let newRank = Math.round((yNorm / 100) * mxR);

    if (snapToGrid) {
      newX = Math.round(newX / 5) * 5;
      newRank = Math.max(0, newRank);
    }

    updateNodeLocal(draggingNode, { x: newX, rank: newRank });
  }, [draggingNode, maxRank, snapToGrid, updateNodeLocal]);

  const handleSvgMouseUp = useCallback(async () => {
    if (!draggingNode) return;

    const latestTrees = treesRef.current;
    setDraggingNode(null);
    await persistTrees(latestTrees);
  }, [draggingNode]);

  // Card search
  const filteredCards = useMemo(() => {
    if (!cardSearch) return cards;
    const q = cardSearch.toLowerCase();
    return cards.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  // Node connections for the editing node
  const editingNodeConnections = useMemo(() => {
    if (!editingNode || !selectedTree) return [];
    return selectedTree.connections
      .filter(c => c.from === editingNode.id || c.to === editingNode.id)
      .map(c => {
        const otherId = c.from === editingNode.id ? c.to : c.from;
        const otherNode = selectedTree.nodes.find(n => n.id === otherId);
        return { connFrom: c.from, connTo: c.to, otherId, otherLabel: otherNode?.label || "?" };
      });
  }, [editingNode, selectedTree]);

  // Node list filter
  const filteredNodes = useMemo(() => {
    if (!selectedTree) return [];
    const sorted = [...selectedTree.nodes].sort((a, b) => b.rank - a.rank);
    if (!nodeSearch) return sorted;
    const q = nodeSearch.toLowerCase();
    return sorted.filter(n => n.label.toLowerCase().includes(q));
  }, [selectedTree, nodeSearch]);

  if (loading) {
    return (
      <div className="text-[12px] text-center py-6" style={S_DIM}>
        Loading node trees...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-[12px] text-center py-6" style={S_RED}>
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`${retro.raised} p-4 flex flex-wrap items-start justify-between gap-3`} style={{ background: "#0E0E35", border: "1px solid #1A1A4B" }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <GitBranch size={16} style={{ color: NT_ACCENT }} />
            <span className="text-[13px]" style={{ color: NT_ACCENT, fontWeight: 600 }}>Node Trees</span>
            <span className="text-[10px] px-2 py-0.5" style={{ color: "#8AB8FF", border: "1px solid #223256", background: "#0A0A28" }}>
              {trees.length} total
            </span>
          </div>
          <div className="text-[10px] mt-2 max-w-[760px]" style={S_MUTED}>
            Build progression trees, assign them to players, and place cards directly on nodes so Personal Files and the card editor stay in sync.
          </div>
        </div>
        <button onClick={() => setShowNewTreeForm(true)} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`} style={{ color: NT_ACCENT }}>
          <Plus size={12} /> New Tree
        </button>
      </div>

      {/* New tree form */}
      {showNewTreeForm && (
        <div className={`${retro.raised} p-3 flex items-center gap-2`} style={{ background: "#0E0E35" }}>
          <input autoFocus type="text" value={newTreeName} onChange={e => setNewTreeName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createTree(); if (e.key === "Escape") setShowNewTreeForm(false); }}
            placeholder="Tree name..." className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[12px] flex-1 outline-none`} style={S_TEXT}
          />
          <button onClick={createTree} className={`${retro.button} px-3 py-1.5 text-[11px]`} style={{ color: NT_ACCENT }}><Check size={12} /></button>
          <button onClick={() => setShowNewTreeForm(false)} className={`${retro.button} px-3 py-1.5 text-[11px]`} style={S_RED}><X size={12} /></button>
        </div>
      )}

      {/* Tree list */}
      <div className={`${retro.sunken} bg-[#0C0C2E] p-3`} style={{ border: "1px solid #15324A" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px]" style={{ color: "#7CAFD4", fontWeight: 700 }}>TREE LIBRARY</div>
            <div className="text-[10px] mt-1" style={S_DIM}>Select a tree to edit its canvas, nodes, assignments, and rewards.</div>
          </div>
          <span className="text-[9px] px-2 py-1" style={{ color: "#7CAFD4", border: "1px solid #1A3A4F", background: "#0A0A28" }}>
            {trees.length} tree{trees.length === 1 ? "" : "s"}
          </span>
        </div>
        {trees.length === 0 ? (
          <div className="text-[12px] text-center py-4" style={S_DIM}>No node trees yet. Click "New Tree" to start.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {trees.map(t => (
              <div key={t.id} className={`${retro.raised} px-3 py-3 cursor-pointer transition-colors hover:bg-[#FFFFFF06]`}
                style={{ background: selectedTreeId === t.id ? `${NT_ACCENT}12` : "#0E0E35", border: selectedTreeId === t.id ? `1px solid ${NT_ACCENT}55` : "1px solid #1A1A4B", borderLeft: selectedTreeId === t.id ? `3px solid ${NT_ACCENT}` : "3px solid transparent" }}
                onClick={() => { setSelectedTreeId(t.id); setEditingNodeId(null); setConnectingFrom(null); setConfirmDeleteTree(null); setRenamingTreeId(null); }}
              >
                <div className="flex items-start gap-2">
                  <GitBranch size={13} style={{ color: selectedTreeId === t.id ? NT_ACCENT : "#4A5A7A", marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    {renamingTreeId === t.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === "Enter") await commitRenameTree(t.id);
                          if (e.key === "Escape") setRenamingTreeId(null);
                        }}
                        onBlur={async () => {
                          await commitRenameTree(t.id);
                        }}
                        className={`${retro.sunken} bg-[#0A0A28] px-2 py-0.5 text-[12px] w-full outline-none`}
                        style={{ color: NT_ACCENT }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-[12px] block truncate" style={{ color: selectedTreeId === t.id ? NT_ACCENT : "#8A9ABB", fontWeight: selectedTreeId === t.id ? 600 : 400 }}>
                        {t.name}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="text-[8px] px-1.5 py-0.5" style={{ color: "#7CAFD4", background: "#0A0A28", border: "1px solid #1A3A4F" }}>{t.nodes.length} nodes</span>
                      <span className="text-[8px] px-1.5 py-0.5" style={{ color: "#FFD700", background: "#0A0A28", border: "1px solid #473A12" }}>{t.connections.length} links</span>
                      <span className="text-[8px] px-1.5 py-0.5" style={{ color: "#FF9A7A", background: "#0A0A28", border: "1px solid #4A2A1A" }}>{new Set(t.nodes.flatMap((node) => node.cardIds)).size} cards</span>
                      <span className="text-[8px] px-1.5 py-0.5" style={{ color: t.assignedTo.length > 0 ? "#5A9AFF" : "#6A728A", background: "#0A0A28", border: "1px solid #1A1A4B" }}>
                        {t.assignedTo.length === 0 ? "No players" : t.assignedTo.includes("all") ? "All players" : `${t.assignedTo.length} player${t.assignedTo.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={e => { e.stopPropagation(); setRenamingTreeId(t.id); setRenameValue(t.name); }} className="hover:opacity-80 p-0.5" title="Rename"><Pencil size={10} style={S_MUTED} /></button>
                    <button onClick={e => { e.stopPropagation(); duplicateTree(t.id); }} className="hover:opacity-80 p-0.5" title="Duplicate"><Copy size={11} style={S_MUTED} /></button>
                    {confirmDeleteTree === t.id ? (
                      <div style={DISPLAY_CONTENTS}>
                        <button onClick={e => { e.stopPropagation(); deleteTree(t.id); }} className="hover:opacity-80 p-0.5" title="Confirm delete"><Check size={11} style={S_RED} /></button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteTree(null); }} className="hover:opacity-80 p-0.5" title="Cancel"><X size={11} style={S_MUTED} /></button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteTree(t.id); }} className="hover:opacity-80 p-0.5" title="Delete"><Trash2 size={11} style={S_RED} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected tree editor */}
      {selectedTree && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: "Assigned Players", value: selectedTree.assignedTo.includes("all") ? "All Players" : `${selectedTree.assignedTo.length}`, accent: "#5A9AFF" },
              { label: "Node Count", value: `${selectedTree.nodes.length}`, accent: NT_ACCENT },
              { label: "Connection Count", value: `${selectedTree.connections.length}`, accent: "#FFD700" },
              { label: "Card Count", value: `${new Set(selectedTree.nodes.flatMap((node) => node.cardIds)).size}`, accent: "#FF7A5A" },
            ].map((summary) => (
              <div
                key={summary.label}
                className={`${retro.sunken} px-4 py-3`}
                style={{ background: "#0C0C2E", borderLeft: `3px solid ${summary.accent}66` }}
              >
                <div className="text-[9px] uppercase tracking-[0.06em] mb-1" style={S_MUTED}>{summary.label}</div>
                <div className="text-[13px] break-words" style={{ color: "#C0D0F0", fontWeight: 700 }}>{summary.value}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className={`${retro.raised} p-4 space-y-3`} style={{ background: "#0E0E35", border: "1px solid #1A1A4B" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[12px]" style={{ color: NT_ACCENT, fontWeight: 600 }}>{selectedTree.name}</div>
                <div className="text-[10px] mt-1 max-w-[720px]" style={S_MUTED}>
                  Use the canvas for placement, the node list for quick jumps, and the editor panel for detailed node setup.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Assign */}
                <div className="relative">
                  <button onClick={() => setAssignDropdown(p => !p)} className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1`} style={{ color: "#5A9AFF" }}>
                    <Users size={11} /> Assign ({selectedTree.assignedTo.length}) <ChevronDown size={9} />
                  </button>
                  {assignDropdown && (
                    <div className={`${retro.raised} absolute right-0 top-full mt-1 z-30 w-52 p-2`} style={{ background: "#0E0E35" }}>
                      <button onClick={() => toggleAssign("all")} className="w-full flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-[#FFFFFF06]"
                        style={{ color: selectedTree.assignedTo.includes("all") ? NT_ACCENT : "#8A9ABB" }}>
                        <div className="w-3 h-3 rounded-sm flex items-center justify-center" style={{ background: selectedTree.assignedTo.includes("all") ? NT_ACCENT : "#1A1A3B", border: `1px solid ${selectedTree.assignedTo.includes("all") ? NT_ACCENT : "#2A3A5B"}` }}>
                          {selectedTree.assignedTo.includes("all") && <Check size={8} style={{ color: "#080820" }} />}
                        </div>
                        All Players
                      </button>
                      {players.map(p => (
                        <button key={p.id} onClick={() => toggleAssign(p.id)} className="w-full flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-[#FFFFFF06]"
                          style={{ color: selectedTree.assignedTo.includes(p.id) ? NT_ACCENT : "#8A9ABB" }}>
                          <div className="w-3 h-3 rounded-sm flex items-center justify-center" style={{ background: selectedTree.assignedTo.includes(p.id) ? NT_ACCENT : "#1A1A3B", border: `1px solid ${selectedTree.assignedTo.includes(p.id) ? NT_ACCENT : "#2A3A5B"}` }}>
                            {selectedTree.assignedTo.includes(p.id) && <Check size={8} style={{ color: "#080820" }} />}
                          </div>
                          {p.name}
                        </button>
                      ))}
                      <button onClick={() => setAssignDropdown(false)} className="w-full text-[9px] mt-1 text-center py-1" style={S_MUTED}>Close</button>
                    </div>
                  )}
                </div>
                <button onClick={addNode} className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1`} style={{ color: NT_ACCENT }}>
                  <Plus size={11} /> Node
                </button>
                <button onClick={() => setConnectingFrom(connectingFrom ? null : "__waiting__")}
                  className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1`}
                  style={{ color: connectingFrom ? "#FF6A6A" : "#FFD700" }}>
                  <Link2 size={11} /> {connectingFrom ? "Cancel" : "Link"}
                </button>
                <button onClick={() => setShowNodeList(p => !p)} className={`${retro.button} px-2.5 py-1.5 text-[10px] flex items-center gap-1`} style={{ color: showNodeList ? NT_ACCENT : "#5A6A8A" }}>
                  <Layers size={10} /> {showNodeList ? "Hide List" : "Show List"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px]" style={S_MUTED}>
                <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} className="w-3 h-3" />
                Snap to grid
              </label>
              <span className="text-[9px] px-2 py-0.5" style={{ color: "#7CAFD4", border: "1px solid #1A3A4F", background: "#0A0A28" }}>
                Drag nodes on the canvas to reposition them
              </span>
            </div>
          </div>

          {/* Connection mode hint */}
          {connectingFrom && (
            <div className="text-[10px] px-3 py-1" style={{ color: "#FFD700", background: "#FFD70011", border: "1px solid #FFD70033" }}>
              {connectingFrom === "__waiting__"
                ? "Click a node to start linking, then click another node."
                : `Click another node to link/unlink from "${selectedTree.nodes.find(n => n.id === connectingFrom)?.label}"`}
            </div>
          )}

          <div className="flex gap-3 flex-col xl:flex-row">
            {/* Node list sidebar */}
            {showNodeList && (
              <div className="w-full xl:w-48 shrink-0 space-y-2">
                <div className="relative">
                  <Search size={10} className="absolute left-2 top-[7px]" style={{ color: "#4A5A7A" }} />
                  <input type="text" value={nodeSearch} onChange={e => setNodeSearch(e.target.value)} placeholder="Search nodes..."
                    className={`${retro.sunken} bg-[#0A0A28] pl-6 pr-2 py-1.5 text-[10px] w-full outline-none`} style={S_TEXT}
                  />
                </div>
                <div className={`${retro.sunken} bg-[#080820] overflow-y-auto`} style={{ maxHeight: 460 }}>
                  {filteredNodes.length === 0 ? (
                    <div className="text-[10px] text-center py-4" style={S_DIM}>No nodes</div>
                  ) : filteredNodes.map(n => (
                    <button key={n.id}
                      onClick={() => { setEditingNodeId(n.id); setEditorTab("properties"); }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[#FFFFFF06] transition-colors"
                      style={{ background: editingNodeId === n.id ? `${NT_ACCENT}15` : "transparent", borderLeft: editingNodeId === n.id ? `2px solid ${NT_ACCENT}` : "2px solid transparent" }}
                    >
                      <ShapePreviewMini shape={n.shape || "circle"} color={resolveNodeColor(n)} size={14} selected={editingNodeId === n.id} />
                      <span className="text-[10px] flex-1 truncate" style={{ color: editingNodeId === n.id ? NT_ACCENT : "#8A9ABB" }}>{n.label}</span>
                      <span className="text-[8px] shrink-0" style={S_DIM}>R{n.rank}</span>
                      {n.shrouded && <EyeOff size={8} style={{ color: SHROUD_COLOR }} />}
                      {n.cardIds.length > 0 && <span className="text-[8px] px-1 rounded-sm" style={{ background: "#FF7A5A22", color: "#FF7A5A" }}>{n.cardIds.length}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Canvas */}
            <div className={`${retro.sunken} flex-1 relative select-none`} style={{ background: "#080820", minHeight: 420 }}>
              <svg ref={svgRef} viewBox="0 0 500 500" className="w-full h-full"
                style={{ minHeight: 420, cursor: draggingNode ? "grabbing" : "default" }}
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp} onMouseLeave={handleSvgMouseUp}
              >
                {/* Grid */}
                {snapToGrid && Array.from({ length: 21 }, (_, i) => (
                  <line key={`vg${i}`} x1={i * 5 * 4.6 + 20} y1={30} x2={i * 5 * 4.6 + 20} y2={470} stroke="#0D0D28" strokeWidth={0.3} />
                ))}
                {Array.from({ length: Math.max(maxRank, 5) + 1 }, (_, i) => {
                  const y = nodeY(i, Math.max(maxRank, 5));
                  return (
                    <g key={`rank${i}`}>
                      <line x1={0} y1={y} x2={500} y2={y} stroke="#1A1A3A" strokeWidth={0.5} />
                      <text x={4} y={y - 3} fill="#1A2A4A" fontSize={7}>R{i}</text>
                    </g>
                  );
                })}

                {/* Connections */}
                {selectedTree.connections.map((conn, ci) => {
                  const fromN = selectedTree.nodes.find(n => n.id === conn.from);
                  const toN = selectedTree.nodes.find(n => n.id === conn.to);
                  if (!fromN || !toN) return null;
                  const mxR = Math.max(maxRank, 5);
                  const isHighlighted = editingNodeId && (conn.from === editingNodeId || conn.to === editingNodeId);
                  return (
                    <line key={`c${ci}`}
                      x1={nodeX(fromN.x)} y1={nodeY(fromN.rank, mxR)} x2={nodeX(toN.x)} y2={nodeY(toN.rank, mxR)}
                      stroke={isHighlighted ? "#FFD700" : NT_ACCENT} strokeWidth={isHighlighted ? 2.5 : 1.5}
                      opacity={isHighlighted ? 0.8 : 0.4}
                    />
                  );
                })}

                {/* Nodes */}
                {selectedTree.nodes.map(node => {
                  const mxR = Math.max(maxRank, 5);
                  const ny = nodeY(node.rank, mxR);
                  const nx = nodeX(node.x);
                  const isSelected = editingNodeId === node.id;
                  const isConnFrom = connectingFrom === node.id;
                  const r = isSelected ? 20 : 16;
                  const nColor = resolveNodeColor(node);
                  const nShape = node.shape || "circle";

                  return (
                    <g key={node.id} style={{ cursor: draggingNode === node.id ? "grabbing" : "grab" }}
                      onMouseDown={e => {
                        if (connectingFrom === "__waiting__") { setConnectingFrom(node.id); e.stopPropagation(); return; }
                        if (connectingFrom && connectingFrom !== "__waiting__") { toggleConnection(connectingFrom, node.id); setConnectingFrom(null); e.stopPropagation(); return; }
                        handleSvgMouseDown(e, node.id);
                      }}
                    >
                      {isSelected && <NodeShapeOutline cx={nx} cy={ny} r={r + 3} shape={nShape} stroke="#FFF" strokeWidth={1.5} opacity={0.5} />}
                      {isConnFrom && <NodeShapeOutline cx={nx} cy={ny} r={r + 5} shape={nShape} stroke="#FFD700" strokeWidth={2} opacity={0.7} />}
                      <NodeShapeSvg cx={nx} cy={ny} r={r} shape={nShape}
                        fill={isSelected ? nColor : node.shrouded ? "#1A1A3A" : nColor + "33"}
                        stroke={isConnFrom ? "#FFD700" : nColor}
                        strokeWidth={2}
                      />
                      {node.shrouded && (
                        <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill={isSelected ? "#080820" : SHROUD_COLOR} fontSize={10} fontWeight={600}>?</text>
                      )}
                      {!node.shrouded && (
                        <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill={isSelected ? "#080820" : nColor} fontSize={10} fontWeight={600}>
                          {node.label.slice(0, 3).toUpperCase()}
                        </text>
                      )}
                      <text x={nx} y={ny + r + 14} textAnchor="middle" fill={node.shrouded ? "#6A5A8A" : "#8A9ABB"} fontSize={8}>
                        {node.label.length > 14 ? `${node.label.slice(0, 13)}...` : node.label}
                      </text>
                      {node.cardIds.length > 0 && (
                        <g>
                          <circle cx={nx + r - 2} cy={ny - r + 2} r={6} fill={node.shrouded ? SHROUD_COLOR : "#FF7A5A"} />
                          <text x={nx + r - 2} y={ny - r + 2.5} textAnchor="middle" dominantBaseline="middle" fill="#FFF" fontSize={8} fontWeight={700}>{node.cardIds.length}</text>
                        </g>
                      )}
                      {node.prerequisites.length > 0 && (
                        <g>
                          <circle cx={nx - r + 2} cy={ny - r + 2} r={5} fill="#FFD700" opacity={0.7} />
                          <text x={nx - r + 2} y={ny - r + 2.5} textAnchor="middle" dominantBaseline="middle" fill="#080820" fontSize={7} fontWeight={700}>{node.prerequisites.length}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Node editor panel */}
            <div className="w-full xl:w-80 shrink-0 space-y-2">
              {editingNode ? (
                <div style={DISPLAY_CONTENTS}>
                  {/* Node editor header */}
                  <div className={`${retro.raised} p-2 flex items-center gap-2`} style={{ background: "#0E0E35" }}>
                    <ShapePreviewMini shape={editingNode.shape || "circle"} color={resolveNodeColor(editingNode)} size={16} />
                    <span className="text-[12px] flex-1 truncate" style={{ color: NT_ACCENT, fontWeight: 600 }}>{editingNode.label}</span>
                    <button onClick={() => duplicateNode(editingNode.id)} className="hover:opacity-80 p-0.5" title="Duplicate node"><Copy size={11} style={S_MUTED} /></button>
                    <button onClick={() => deleteNode(editingNode.id)} className="hover:opacity-80 p-0.5" title="Delete node"><Trash2 size={11} style={S_RED} /></button>
                    <button onClick={() => setEditingNodeId(null)} className="hover:opacity-80 p-0.5" title="Close"><X size={11} style={S_MUTED} /></button>
                  </div>

                  {/* Sub-tabs */}
                  <div className="flex gap-px">
                    {([
                      { id: "properties" as const, label: "Props", icon: Pencil },
                      { id: "prereqs" as const, label: "Prereqs", icon: CornerDownRight },
                      { id: "cards" as const, label: "Cards", icon: CreditCard },
                      { id: "connections" as const, label: "Links", icon: Link2 },
                    ]).map(tab => (
                      <button key={tab.id} onClick={() => setEditorTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[9px] transition-colors ${editorTab === tab.id ? retro.sunken : retro.raised}`}
                        style={{ color: editorTab === tab.id ? NT_ACCENT : "#5A6A8A", fontWeight: editorTab === tab.id ? 600 : 400, background: editorTab === tab.id ? "#0A0A28" : "#0E0E35" }}
                      >
                        <tab.icon size={9} /> {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Properties tab */}
                  {editorTab === "properties" && (
                    <div className={`${retro.raised} p-3 space-y-2`} style={{ background: "#0E0E35" }}>
                      <label className="text-[9px] block" style={S_MUTED}>Label:</label>
                      <input type="text" value={editingNode.label} onChange={e => updateNode(editingNode.id, { label: e.target.value })}
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[12px] w-full outline-none`} style={S_TEXT}
                      />
                      <label className="text-[9px] block" style={S_MUTED}>Description (optional):</label>
                      <textarea value={editingNode.description || ""} onChange={e => updateNode(editingNode.id, { description: e.target.value || undefined })}
                        rows={2} placeholder="Flavor text or notes..."
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[11px] w-full outline-none resize-y`} style={S_TEXT}
                      />
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[9px] block mb-0.5" style={S_MUTED}>Rank:</label>
                          <input type="number" min={0} value={editingNode.rank}
                            onChange={e => updateNode(editingNode.id, { rank: Math.max(0, parseInt(e.target.value) || 0) })}
                            className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[12px] w-full outline-none`} style={S_TEXT}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[9px] block mb-0.5" style={S_MUTED}>X (0-100):</label>
                          <input type="number" min={0} max={100} value={Math.round(editingNode.x)}
                            onChange={e => updateNode(editingNode.id, { x: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                            className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[12px] w-full outline-none`} style={S_TEXT}
                          />
                        </div>
                      </div>
                      <input type="range" min={0} max={100} value={editingNode.x}
                        onChange={e => updateNode(editingNode.id, { x: parseFloat(e.target.value) })} className="w-full"
                      />
                      {/* Shape picker */}
                      <label className="text-[9px] block pt-1" style={S_MUTED}>Shape:</label>
                      <div className="flex gap-1 flex-wrap">
                        {ALL_SHAPES.map(s => {
                          const isActive = (editingNode.shape || "circle") === s;
                          return (
                            <button key={s} onClick={() => updateNode(editingNode.id, { shape: s })}
                              className={`${isActive ? retro.sunken : retro.raised} p-1.5 flex flex-col items-center gap-0.5`}
                              style={{ background: isActive ? "#0A0A28" : "#0E0E35", minWidth: 38 }}
                              title={s.charAt(0).toUpperCase() + s.slice(1)}
                            >
                              <ShapePreviewMini shape={s} color={resolveNodeColor(editingNode)} size={16} selected={isActive} />
                              <span className="text-[7px]" style={{ color: isActive ? "#C0D0F0" : "#4A5A7A" }}>{s.slice(0, 4)}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Color picker */}
                      <label className="text-[9px] block pt-1" style={S_MUTED}>Color:</label>
                      <div className="flex gap-1 flex-wrap">
                        {NODE_COLORS.map(c => {
                          const isActive = (editingNode.color || "") === c.value;
                          const displayColor = c.value || NT_ACCENT;
                          return (
                            <button key={c.id} onClick={() => updateNode(editingNode.id, { color: c.value || undefined })}
                              className="relative w-6 h-6 rounded-sm flex items-center justify-center transition-transform hover:scale-110"
                              style={{ background: displayColor, outline: isActive ? "2px solid #FFF" : "1px solid #2A3A5B", outlineOffset: 1 }}
                              title={c.label}
                            >
                              {isActive && <Check size={10} style={{ color: "#080820" }} />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Shrouded toggle */}
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => updateNode(editingNode.id, { shrouded: !editingNode.shrouded })}
                          className={`${retro.button} flex items-center gap-1.5 px-3 py-1.5 text-[10px]`}
                          style={{ color: editingNode.shrouded ? SHROUD_COLOR : "#5A6A8A" }}
                        >
                          {editingNode.shrouded ? <EyeOff size={11} /> : <Eye size={11} />}
                          {editingNode.shrouded ? "Shrouded" : "Visible"}
                        </button>
                        <span className="text-[8px]" style={S_DIM}>
                          {editingNode.shrouded ? "Cards hidden until unlocked" : "Cards visible to players"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Prerequisites tab */}
                  {editorTab === "prereqs" && (
                    <div className={`${retro.raised} p-3`} style={{ background: "#0E0E35" }}>
                      <div className="text-[10px] mb-2" style={{ color: "#FFD700", fontWeight: 600 }}>
                        Prerequisites ({editingNode.prerequisites.length})
                      </div>
                      <div className="text-[8px] mb-2" style={S_DIM}>
                        Player must unlock all checked nodes before this one becomes available.
                      </div>
                      {selectedTree.nodes.filter(n => n.id !== editingNode.id).sort((a, b) => a.rank - b.rank).map(n => {
                        const isPrereq = editingNode.prerequisites.includes(n.id);
                        return (
                          <button key={n.id}
                            onClick={() => updateNode(editingNode.id, { prerequisites: isPrereq ? editingNode.prerequisites.filter(p => p !== n.id) : [...editingNode.prerequisites, n.id] })}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] hover:bg-[#FFFFFF06] transition-colors"
                            style={{ color: isPrereq ? NT_ACCENT : "#5A6A8A" }}
                          >
                            <div className="w-3 h-3 rounded-sm shrink-0 flex items-center justify-center" style={{ background: isPrereq ? NT_ACCENT : "#1A1A3B", border: `1px solid ${isPrereq ? NT_ACCENT : "#2A3A5B"}` }}>
                              {isPrereq && <Check size={8} style={{ color: "#080820" }} />}
                            </div>
                            <span className="flex-1 text-left truncate">{n.label}</span>
                            <span className="text-[8px] shrink-0" style={S_DIM}>R{n.rank}</span>
                          </button>
                        );
                      })}
                      {selectedTree.nodes.length <= 1 && <div className="text-[10px] py-2" style={S_DIM}>Add more nodes first</div>}
                    </div>
                  )}

                  {/* Cards tab */}
                  {editorTab === "cards" && (
                    <div className={`${retro.raised} p-3`} style={{ background: "#0E0E35" }}>
                      <div className="text-[10px] mb-2" style={{ color: "#FF7A5A", fontWeight: 600 }}>
                        Cards ({editingNode.cardIds.length}/3)
                      </div>
                      {editingNode.cardIds.map(cid => {
                        const card = cards.find(c => c.id === cid);
                        return (
                          <div key={cid} className="flex items-center gap-1.5 px-2 py-1.5 mb-1" style={{ background: "#FF7A5A12", border: "1px solid #FF7A5A33" }}>
                            <CreditCard size={10} style={{ color: "#FF7A5A" }} />
                            <span className="text-[10px] flex-1 truncate" style={{ color: "#FF7A5A" }}>{card?.name || cid}</span>
                            <span className="text-[8px]" style={{ color: "#5A4A3A" }}>{card?.type}</span>
                            <button onClick={() => {
                              updateNode(editingNode.id, { cardIds: editingNode.cardIds.filter(c => c !== cid) });
                              onCardNodeUnassign?.(cid);
                            }} className="hover:opacity-80 shrink-0">
                              <X size={10} style={S_RED} />
                            </button>
                          </div>
                        );
                      })}
                      {editingNode.cardIds.length < 3 && (
                        <div style={DISPLAY_CONTENTS}>
                          <div className="relative mt-2">
                            <Search size={10} className="absolute left-2 top-[7px]" style={{ color: "#4A5A7A" }} />
                            <input type="text" value={cardSearch} onChange={e => setCardSearch(e.target.value)} placeholder="Search cards..."
                              className={`${retro.sunken} bg-[#0A0A28] pl-6 pr-2 py-1.5 text-[10px] w-full outline-none`} style={S_TEXT}
                            />
                          </div>
                          <div className="max-h-[160px] overflow-y-auto mt-1">
                            {filteredCards.filter(c => !editingNode.cardIds.includes(c.id)).slice(0, 30).map(card => (
                              <button key={card.id}
                                onClick={() => {
                                  updateNode(editingNode.id, { cardIds: [...editingNode.cardIds, card.id] });
                                  if (selectedTreeId) onCardNodeAssign?.(card.id, selectedTreeId, editingNode.id);
                                }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] hover:bg-[#FFFFFF06] text-left transition-colors"
                                style={{ color: "#8A9ABB" }}
                              >
                                <Plus size={9} style={{ color: NT_ACCENT }} />
                                <span className="flex-1 truncate">{card.name}</span>
                                <span className="text-[8px] shrink-0" style={{ color: "#4A5A7A" }}>{card.type}</span>
                              </button>
                            ))}
                            {filteredCards.filter(c => !editingNode.cardIds.includes(c.id)).length === 0 && (
                              <div className="text-[10px] text-center py-2" style={S_DIM}>
                                {cards.length === 0 ? "No cards created yet" : "No matching cards"}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Connections tab */}
                  {editorTab === "connections" && (
                    <div className={`${retro.raised} p-3`} style={{ background: "#0E0E35" }}>
                      <div className="text-[10px] mb-2" style={{ color: "#FFD700", fontWeight: 600 }}>
                        Connections ({editingNodeConnections.length})
                      </div>
                      {editingNodeConnections.length === 0 ? (
                        <div className="text-[10px] py-2" style={S_DIM}>
                          No connections. Use the "Link" button in the toolbar, or add below.
                        </div>
                      ) : editingNodeConnections.map((conn, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 mb-1" style={{ background: "#FFD70012", border: "1px solid #FFD70022" }}>
                          <Link2 size={10} style={{ color: "#FFD700" }} />
                          <span className="text-[10px] flex-1 truncate" style={{ color: "#FFD700" }}>{conn.otherLabel}</span>
                          <button onClick={() => removeConnection(conn.connFrom, conn.connTo)} className="hover:opacity-80 shrink-0" title="Remove connection">
                            <X size={10} style={S_RED} />
                          </button>
                        </div>
                      ))}
                      {/* Quick-add connection */}
                      <div className="mt-2">
                        <div className="text-[9px] mb-1" style={S_MUTED}>Quick-add connection:</div>
                        <div className="max-h-[120px] overflow-y-auto">
                          {selectedTree.nodes
                            .filter(n => n.id !== editingNode.id && !editingNodeConnections.some(c => c.otherId === n.id))
                            .sort((a, b) => a.rank - b.rank)
                            .map(n => (
                              <button key={n.id} onClick={() => toggleConnection(editingNode.id, n.id)}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] hover:bg-[#FFFFFF06] text-left transition-colors"
                                style={{ color: "#6A7A9A" }}
                              >
                                <Plus size={9} style={{ color: "#FFD700" }} />
                                <span className="flex-1 truncate">{n.label}</span>
                                <span className="text-[8px] shrink-0" style={S_DIM}>R{n.rank}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`${retro.sunken} p-4 text-center`} style={{ background: "#080820" }}>
                  <Circle size={24} style={{ color: "#2A3A5B", margin: "0 auto 8px" }} />
                  <div className="text-[11px] mb-1" style={S_DIM}>Select a node to edit</div>
                  <div className="text-[9px]" style={{ color: "#2A3A5A" }}>Click on canvas or use the node list</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
