import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { retro } from "./retro-styles";
import { GitBranch, Lock, Unlock, Plus, Trash2, X, Check, ChevronDown, Link2, CreditCard, Search, Circle, Copy, Users, EyeOff, Eye, ArrowLeft, ChevronRight, Layers, Pencil, CornerDownRight } from "lucide-react";
import { safeGetItem, safeSetItem, safeGetJson, safeSetJson } from "./safe-storage";
import { firstColor, ts } from "./player-theme";
import { DISPLAY_CONTENTS, S_DIM, S_MUTED, S_RED, S_TEXT } from "./shared-styles";

// ═══════════════════════════════════════════════
// Shared Data Types
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// LocalStorage helpers
// ═══════════════════════════════════════════════

const STORAGE_KEY = "inet-dm-node-trees";
const UNLOCK_KEY_PREFIX = "inet-nodetree-unlocks-";

export function loadNodeTrees(): NodeTree[] {
  try { return safeGetJson(STORAGE_KEY, []); } catch { return []; }
}

export function saveNodeTrees(trees: NodeTree[]) {
  safeSetJson(STORAGE_KEY, trees);
}

export function loadUnlocks(userId: string): Record<string, string[]> {
  try { return safeGetJson(UNLOCK_KEY_PREFIX + userId, {}); } catch { return {}; }
}

export function saveUnlocks(userId: string, unlocks: Record<string, string[]>) {
  safeSetJson(UNLOCK_KEY_PREFIX + userId, unlocks);
}

const fc = firstColor;

// ═══════════════════════════════════════════════
// Card type for display
// ═══════════════════════════════════════════════

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

// ── Shape path generators ──
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

// ═══════════════════════════════════════════════
// PLAYER NODE TREE VIEWER
// ═══════════════════════════════════════════════

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
}

export function PlayerNodeTreeViewer({ playerId, theme, cards }: PlayerNodeTreeViewerProps) {
  const [trees, setTrees] = useState<NodeTree[]>(() => loadNodeTrees());
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewingCard, setViewingCard] = useState<CardRef | null>(null);
  const [unlocks, setUnlocks] = useState<Record<string, string[]>>(() => loadUnlocks(playerId));

  // Refresh data periodically (DM may add trees)
  useEffect(() => {
    const iv = setInterval(() => setTrees(loadNodeTrees()), 3000);
    return () => clearInterval(iv);
  }, []);

  const myTrees = useMemo(() => trees.filter(t => t.assignedTo.includes(playerId) || t.assignedTo.includes("all")), [trees, playerId]);

  useEffect(() => {
    if (myTrees.length > 0 && (!selectedTreeId || !myTrees.find(t => t.id === selectedTreeId))) {
      setSelectedTreeId(myTrees[0].id);
    }
  }, [myTrees, selectedTreeId]);

  const activeTree = myTrees.find(t => t.id === selectedTreeId) || null;
  const treeUnlocks = (selectedTreeId && unlocks[selectedTreeId]) || [];
  const isNodeUnlocked = useCallback((nodeId: string) => treeUnlocks.includes(nodeId), [treeUnlocks]);
  const canUnlockNode = useCallback((node: NodeTreeNode) => {
    if (isNodeUnlocked(node.id)) return false;
    return node.prerequisites.every(preId => treeUnlocks.includes(preId));
  }, [treeUnlocks, isNodeUnlocked]);

  const handleUnlockNode = useCallback((nodeId: string) => {
    const newUnlocks = { ...unlocks, [selectedTreeId!]: [...treeUnlocks, nodeId] };
    setUnlocks(newUnlocks);
    saveUnlocks(playerId, newUnlocks);
  }, [unlocks, selectedTreeId, treeUnlocks, playerId]);

  const selectedNode = activeTree?.nodes.find(n => n.id === selectedNodeId) || null;
  const nodeCards = selectedNode ? selectedNode.cardIds.map(cid => cards.find(c => c.id === cid)).filter(Boolean) as CardRef[] : [];
  const maxRank = useMemo(() => activeTree ? Math.max(0, ...activeTree.nodes.map(n => n.rank)) : 0, [activeTree]);

  if (myTrees.length === 0) {
    return (
      <div className="text-center py-8">
        <GitBranch size={36} style={{ color: "#2A3A5B", margin: "0 auto 12px" }} />
        <div className="text-[14px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>NO NODE TREES</div>
        <div className="text-[12px]" style={S_DIM}>Your DM hasn't assigned any node trees to you yet.</div>
      </div>
    );
  }

  // ── Card detail overlay ──
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
              <div className="text-[12px]" style={{ color: theme.textColor }} dangerouslySetInnerHTML={{ __html: viewingCard.effect }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tree selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px]" style={{ color: theme.labelColor }}>Tree:</span>
        {myTrees.map(t => {
          const tUnlocks = (unlocks[t.id] || []).length;
          return (
            <button
              key={t.id}
              onClick={() => { setSelectedTreeId(t.id); setSelectedNodeId(null); }}
              className={`${selectedTreeId === t.id ? retro.sunken : retro.raised} px-3 py-1.5 text-[11px] transition-colors`}
              style={{
                color: selectedTreeId === t.id ? NT_ACCENT : theme.labelColor,
                fontWeight: selectedTreeId === t.id ? 600 : 400,
                background: selectedTreeId === t.id ? theme.panelBg : theme.cardBg,
              }}
            >
              <GitBranch size={11} className="inline mr-1" />
              {t.name}
              <span className="text-[9px] ml-1 opacity-60">({tUnlocks}/{t.nodes.length})</span>
            </button>
          );
        })}
      </div>

      {activeTree && (
        <div className="flex gap-3 flex-col lg:flex-row">
          {/* Tree canvas */}
          <div className={`${retro.sunken} flex-1 relative`} style={{ background: "#080820", minHeight: 400 }}>
            <svg viewBox="0 0 500 500" className="w-full h-full" style={{ minHeight: 400 }} preserveAspectRatio="xMidYMid meet">
              {[1, 2, 3, 4].map(i => (
                <line key={`hg${i}`} x1={0} y1={i * 100} x2={500} y2={i * 100} stroke="#1A1A3A" strokeWidth={0.5} />
              ))}

              {/* Connections */}
              {activeTree.connections.map((conn, ci) => {
                const fromN = activeTree.nodes.find(n => n.id === conn.from);
                const toN = activeTree.nodes.find(n => n.id === conn.to);
                if (!fromN || !toN) return null;
                const fromUnlocked = isNodeUnlocked(fromN.id);
                const toUnlocked = isNodeUnlocked(toN.id);
                const bothUnlocked = fromUnlocked && toUnlocked;
                const lineColor = bothUnlocked ? (fromN.color || toN.color || NT_ACCENT) : "#2A3A5B";
                return (
                  <line
                    key={`c${ci}`}
                    x1={nodeX(fromN.x)} y1={nodeY(fromN.rank, maxRank)} x2={nodeX(toN.x)} y2={nodeY(toN.rank, maxRank)}
                    stroke={lineColor}
                    strokeWidth={bothUnlocked ? 2.5 : 1.5}
                    strokeDasharray={bothUnlocked ? undefined : "6 4"}
                    opacity={bothUnlocked ? 0.8 : 0.4}
                  />
                );
              })}

              {/* Nodes */}
              {activeTree.nodes.map(node => {
                const ny = nodeY(node.rank, maxRank);
                const nx = nodeX(node.x);
                const unlocked = isNodeUnlocked(node.id);
                const canUnlock = canUnlockNode(node);
                const isSelected = selectedNodeId === node.id;
                const isShrouded = node.shrouded;
                const r = isSelected ? 20 : 16;
                const nColor = resolveNodeColor(node);
                const nShape = node.shape || "circle";
                const darkColor = nColor + "33";

                return (
                  <g key={node.id} style={{ cursor: "pointer" }} onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}>
                    {canUnlock && !unlocked && (
                      <circle cx={nx} cy={ny} r={r + 6} fill="none" stroke={nColor} strokeWidth={1} opacity={0.4}>
                        <animate attributeName="r" values={`${r + 4};${r + 8};${r + 4}`} dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {isSelected && <NodeShapeOutline cx={nx} cy={ny} r={r + 3} shape={nShape} stroke="#FFF" strokeWidth={1.5} opacity={0.6} />}
                    <NodeShapeSvg
                      cx={nx} cy={ny} r={r} shape={nShape}
                      fill={unlocked ? nColor : isShrouded ? "#1A1A3A" : canUnlock ? darkColor : "#0E0E30"}
                      stroke={unlocked ? nColor : isShrouded ? SHROUD_COLOR : canUnlock ? nColor : "#2A3A5B"}
                      strokeWidth={2}
                      opacity={unlocked ? 1 : canUnlock ? 0.9 : 0.5}
                    />
                    {!unlocked && !canUnlock && !isShrouded && (
                      <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill="#3A4A6A" fontSize={12}>🔒</text>
                    )}
                    {isShrouded && !unlocked && (
                      <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill={SHROUD_COLOR} fontSize={11}>?</text>
                    )}
                    {unlocked && <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill="#080820" fontSize={14} fontWeight={800}>✓</text>}
                    {canUnlock && !unlocked && !isShrouded && (
                      <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="middle" fill={nColor} fontSize={11}>◆</text>
                    )}
                    <text
                      x={nx} y={ny + r + 14} textAnchor="middle"
                      fill={isShrouded && !unlocked ? SHROUD_COLOR : unlocked ? "#C0F0D0" : canUnlock ? nColor : "#4A5A7A"}
                      fontSize={9} fontWeight={unlocked ? 600 : 400}
                    >
                      {isShrouded && !unlocked ? "???" : node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label}
                    </text>
                    {node.cardIds.length > 0 && (
                      <g>
                        <circle cx={nx + r - 2} cy={ny - r + 2} r={6} fill={isShrouded && !unlocked ? SHROUD_COLOR : "#FF7A5A"} />
                        <text x={nx + r - 2} y={ny - r + 2.5} textAnchor="middle" dominantBaseline="middle" fill="#FFF" fontSize={8} fontWeight={700}>
                          {isShrouded && !unlocked ? "?" : node.cardIds.length}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Node detail panel */}
          <div className="w-full lg:w-72 shrink-0 space-y-3">
            {selectedNode ? (
              <div style={DISPLAY_CONTENTS}>
                <div className={`${retro.raised} p-3`} style={{ background: theme.panelBg }}>
                  {selectedNode.shrouded && !isNodeUnlocked(selectedNode.id) ? (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="flex items-center gap-2 mb-2">
                        <EyeOff size={14} style={{ color: SHROUD_COLOR }} />
                        <div className="text-[13px]" style={{ color: SHROUD_COLOR, fontWeight: 600 }}>Shrouded Node</div>
                      </div>
                      <div className="text-[10px]" style={{ color: "#5A4A7A" }}>
                        This node's contents are hidden until unlocked. Its rank and requirements are unknown.
                      </div>
                    </div>
                  ) : (
                    <div style={DISPLAY_CONTENTS}>
                      <div className="flex items-center gap-2 mb-1">
                        <ShapePreviewMini shape={selectedNode.shape || "circle"} color={resolveNodeColor(selectedNode)} size={18} />
                        <div className="text-[13px]" style={{ color: resolveNodeColor(selectedNode), fontWeight: 600 }}>{selectedNode.label}</div>
                      </div>
                      {selectedNode.description && (
                        <div className="text-[10px] mb-2 italic" style={{ color: theme.textColor }}>{selectedNode.description}</div>
                      )}
                      <div className="text-[10px] mb-2" style={{ color: theme.labelColor }}>
                        Rank {selectedNode.rank} · {selectedNode.cardIds.length} card{selectedNode.cardIds.length !== 1 ? "s" : ""}
                      </div>
                      {isNodeUnlocked(selectedNode.id) ? (
                        <div className="flex items-center gap-1.5 text-[11px] px-2 py-1" style={{ background: `${resolveNodeColor(selectedNode)}15`, color: resolveNodeColor(selectedNode), border: `1px solid ${resolveNodeColor(selectedNode)}33` }}>
                          <Unlock size={12} /> Unlocked
                        </div>
                      ) : canUnlockNode(selectedNode) ? (
                        <button onClick={() => handleUnlockNode(selectedNode.id)} className={`${retro.button} w-full text-[11px] flex items-center justify-center gap-1.5 py-2`} style={{ color: "#080820", background: resolveNodeColor(selectedNode) }}>
                          <Unlock size={12} /> Unlock Node
                        </button>
                      ) : (
                        <div className="text-[10px] px-2 py-1" style={{ background: "#FF6A6A11", color: "#FF6A6A", border: "1px solid #FF6A6A33" }}>
                          <Lock size={10} className="inline mr-1" />
                          Requires: {selectedNode.prerequisites.map(pId => {
                            const preNode = activeTree.nodes.find(n => n.id === pId);
                            return preNode?.shrouded && !isNodeUnlocked(preNode.id) ? "???" : preNode?.label || "?";
                          }).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cards in this node — clickable */}
                {!(selectedNode.shrouded && !isNodeUnlocked(selectedNode.id)) && nodeCards.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px]" style={{ color: theme.labelColor }}>Cards ({nodeCards.length}):</div>
                    {nodeCards.map(card => (
                      <button
                        key={card.id}
                        onClick={() => setViewingCard(card)}
                        className={`${retro.raised} p-3 w-full text-left hover:brightness-110 transition-all cursor-pointer`}
                        style={{ background: theme.cardBg }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <CreditCard size={12} style={{ color: "#FF7A5A" }} />
                          <span className="text-[12px]" style={{ color: "#FF7A5A", fontWeight: 600 }}>{card.name}</span>
                          <ChevronRight size={10} className="ml-auto" style={{ color: "#4A5A7A" }} />
                        </div>
                        <div className="text-[9px] mb-1" style={{ color: theme.labelColor }}>
                          {card.type}{card.actionCost ? ` · ${card.actionCost}` : ""}
                        </div>
                        {card.effect && (
                          <div className="text-[10px]" style={{ color: theme.textColor, opacity: 0.8 }}>
                            {card.effect.replace(/<[^>]*>/g, "").slice(0, 80)}{card.effect.replace(/<[^>]*>/g, "").length > 80 ? "…" : ""}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedNode.shrouded && !isNodeUnlocked(selectedNode.id) && selectedNode.cardIds.length > 0 && (
                  <div className={`${retro.sunken} p-3 text-center`} style={{ background: "#1A1A3A" }}>
                    <EyeOff size={16} style={{ color: SHROUD_COLOR, margin: "0 auto 6px" }} />
                    <div className="text-[10px]" style={{ color: SHROUD_COLOR }}>Cards hidden — unlock this node to reveal</div>
                  </div>
                )}
                {nodeCards.length === 0 && !(selectedNode.shrouded && !isNodeUnlocked(selectedNode.id)) && (
                  <div className="text-[10px] text-center py-3" style={S_DIM}>No cards assigned to this node</div>
                )}
              </div>
            ) : (
              <div className={`${retro.sunken} p-4 text-center`} style={{ background: "#080820" }}>
                <Circle size={24} style={{ color: "#2A3A5B", margin: "0 auto 8px" }} />
                <div className="text-[11px]" style={S_DIM}>Click a node to view details</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════
// DM NODE TREE BUILDER
// ═════════════���═════════════════════════════════

interface DMNodeTreeBuilderProps {
  players: { id: string; name: string }[];
  cards: CardRef[];
  onCardNodeAssign?: (cardId: string, treeId: string, nodeId: string) => void;
  onCardNodeUnassign?: (cardId: string) => void;
}

type DmEditorTab = "properties" | "prereqs" | "cards" | "connections";

export function DMNodeTreeBuilder({ players, cards, onCardNodeAssign, onCardNodeUnassign }: DMNodeTreeBuilderProps) {
  const [trees, setTrees] = useState<NodeTree[]>(() => loadNodeTrees());
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

  useEffect(() => { saveNodeTrees(trees); }, [trees]);

  const selectedTree = trees.find(t => t.id === selectedTreeId) || null;
  const editingNode = selectedTree?.nodes.find(n => n.id === editingNodeId) || null;

  // ── Tree CRUD ──
  const createTree = useCallback(() => {
    const name = newTreeName.trim();
    if (!name) return;
    const tree: NodeTree = {
      id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, assignedTo: [], nodes: [], connections: [],
    };
    setTrees(prev => [...prev, tree]);
    setSelectedTreeId(tree.id);
    setNewTreeName("");
    setShowNewTreeForm(false);
  }, [newTreeName]);

  const deleteTree = useCallback((id: string) => {
    const tree = trees.find(t => t.id === id);
    if (tree) {
      for (const node of tree.nodes) {
        for (const cid of node.cardIds) { onCardNodeUnassign?.(cid); }
      }
    }
    setTrees(prev => prev.filter(t => t.id !== id));
    if (selectedTreeId === id) { setSelectedTreeId(null); setEditingNodeId(null); }
    setConfirmDeleteTree(null);
  }, [selectedTreeId, trees, onCardNodeUnassign]);

  const duplicateTree = useCallback((id: string) => {
    const src = trees.find(t => t.id === id);
    if (!src) return;
    const newId = `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nodeIdMap: Record<string, string> = {};
    const newNodes = src.nodes.map(n => {
      const nid = `nd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nodeIdMap[n.id] = nid;
      return { ...n, id: nid, prerequisites: [...n.prerequisites], cardIds: [...n.cardIds] };
    });
    newNodes.forEach(n => { n.prerequisites = n.prerequisites.map(p => nodeIdMap[p] || p); });
    const newConns = src.connections.map(c => ({ from: nodeIdMap[c.from] || c.from, to: nodeIdMap[c.to] || c.to }));
    const clone: NodeTree = { id: newId, name: src.name + " (Copy)", assignedTo: [], nodes: newNodes, connections: newConns };
    setTrees(prev => [...prev, clone]);
    setSelectedTreeId(newId);
  }, [trees]);

  const updateTree = useCallback((updater: (t: NodeTree) => NodeTree) => {
    if (!selectedTreeId) return;
    setTrees(prev => prev.map(t => t.id === selectedTreeId ? updater(t) : t));
  }, [selectedTreeId]);

  // ─��� Node CRUD ──
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

  // ── Connections ──
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

  // ── Drag ──
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
    updateNode(draggingNode, { x: newX, rank: newRank });
  }, [draggingNode, maxRank, updateNode, snapToGrid]);

  const handleSvgMouseUp = useCallback(() => setDraggingNode(null), []);

  // ── Card search ──
  const filteredCards = useMemo(() => {
    if (!cardSearch) return cards;
    const q = cardSearch.toLowerCase();
    return cards.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  // ── Node connections for the editing node ──
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

  // ── Node list filter ──
  const filteredNodes = useMemo(() => {
    if (!selectedTree) return [];
    const sorted = [...selectedTree.nodes].sort((a, b) => b.rank - a.rank);
    if (!nodeSearch) return sorted;
    const q = nodeSearch.toLowerCase();
    return sorted.filter(n => n.label.toLowerCase().includes(q));
  }, [selectedTree, nodeSearch]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <GitBranch size={16} style={{ color: NT_ACCENT }} />
        <span className="text-[13px]" style={{ color: NT_ACCENT, fontWeight: 600 }}>Node Trees</span>
        <span className="text-[10px]" style={S_MUTED}>({trees.length})</span>
        <div className="flex-1" />
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
      <div className={`${retro.sunken} bg-[#0C0C2E] p-3`}>
        {trees.length === 0 ? (
          <div className="text-[12px] text-center py-4" style={S_DIM}>No node trees yet. Click "New Tree" to start.</div>
        ) : (
          <div className="space-y-1">
            {trees.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-[#FFFFFF06]"
                style={{ background: selectedTreeId === t.id ? `${NT_ACCENT}12` : "transparent", borderLeft: selectedTreeId === t.id ? `2px solid ${NT_ACCENT}` : "2px solid transparent" }}
                onClick={() => { setSelectedTreeId(t.id); setEditingNodeId(null); setConnectingFrom(null); setConfirmDeleteTree(null); setRenamingTreeId(null); }}
              >
                <GitBranch size={13} style={{ color: selectedTreeId === t.id ? NT_ACCENT : "#4A5A7A" }} />
                {renamingTreeId === t.id ? (
                  <input autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { setTrees(prev => prev.map(tr => tr.id === t.id ? { ...tr, name: renameValue.trim() || tr.name } : tr)); setRenamingTreeId(null); }
                      if (e.key === "Escape") setRenamingTreeId(null);
                    }}
                    onBlur={() => { setTrees(prev => prev.map(tr => tr.id === t.id ? { ...tr, name: renameValue.trim() || tr.name } : tr)); setRenamingTreeId(null); }}
                    className={`${retro.sunken} bg-[#0A0A28] px-2 py-0.5 text-[12px] flex-1 outline-none`}
                    style={{ color: NT_ACCENT }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-[12px] flex-1 truncate" style={{ color: selectedTreeId === t.id ? NT_ACCENT : "#8A9ABB", fontWeight: selectedTreeId === t.id ? 600 : 400 }}>
                    {t.name}
                  </span>
                )}
                <span className="text-[9px] shrink-0" style={{ color: "#4A5A7A" }}>{t.nodes.length}n</span>
                <span className="text-[9px] shrink-0" style={{ color: t.assignedTo.length > 0 ? "#5A9AFF" : "#3A4A6A" }}>
                  {t.assignedTo.length === 0 ? "—" : t.assignedTo.includes("all") ? "All" : `${t.assignedTo.length}p`}
                </span>
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
            ))}
          </div>
        )}
      </div>

      {/* ── Selected tree editor ── */}
      {selectedTree && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className={`${retro.raised} p-3 flex items-center gap-2 flex-wrap`} style={{ background: "#0E0E35" }}>
            <span className="text-[12px] mr-1" style={{ color: NT_ACCENT, fontWeight: 600 }}>{selectedTree.name}</span>
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
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 cursor-pointer text-[9px]" style={S_MUTED}>
              <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} className="w-3 h-3" />
              Snap
            </label>
            <button onClick={() => setShowNodeList(p => !p)} className={`${retro.button} px-2 py-1 text-[9px]`} style={{ color: showNodeList ? NT_ACCENT : "#5A6A8A" }}>
              <Layers size={10} />
            </button>
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
                        {node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label}
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

                  {/* ─ Properties tab ─ */}
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

                  {/* ─ Prerequisites tab ─ */}
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

                  {/* ─ Cards tab ─ */}
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

                  {/* ─ Connections tab ─ */}
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
