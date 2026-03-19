import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import {
  ArrowLeft, ZoomIn, ZoomOut, Maximize2, Filter,
  Eye, FileText, Link2, Tag, FolderOpen, BookOpen,
} from "lucide-react";
import { safeGetJson } from "./safe-storage";
import { DISPLAY_CONTENTS, S_ACCENT, S_DIM, S_LINK, S_MUTED, S_SUBTLE } from "./shared-styles";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface SitePage {
  id: string;
  title: string;
  category: string;
  tags: string[];
  seeAlso: string[];
  subcategories: { id: string; name: string; type: string; articleId?: string; children: any[] }[];
  relatedArticleIds: string[];
  body: string;
  sections: { id: string; heading: string; body: string }[];
  panels?: { id: string; title: string; content: string; assignedTo: string[]; style?: string }[];
  wikiTags?: string[];
}

interface GraphNode {
  id: string;
  title: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tags: string[];
  wikiTags: string[];
  connectionCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "seeAlso" | "subcategory" | "wikiLink" | "related" | "sharedWikiTag";
}

// ═══════════════════════════════════════════
// Category colors
// ═══════════════════════════════════════════

const CATEGORY_COLORS: Record<string, string> = {
  NPCs: "#FF6ABB",
  Locations: "#4AFF6A",
  Quests: "#FFAA4A",
  Items: "#4A9AFF",
  Bestiary: "#FF6A6A",
  Factions: "#9A7ABB",
  Lore: "#6AEAFF",
  Uncategorized: "#5A6A8A",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || `hsl(${Math.abs(category.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360}, 70%, 65%)`;
}

// ═══════════════════════════════════════════
// Extract wiki links from HTML content
// ═══════════════════════════════════════════

function extractWikiLinks(html: string): string[] {
  const ids: string[] = [];
  // Extract from data-article-id attributes (inserted via wiki-link-dialog)
  const attrRegex = /data-article-id="([^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function extractBracketWikiLinks(html: string, titleToId: Map<string, string>): string[] {
  const ids: string[] = [];
  const regex = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].trim().toLowerCase();
    const resolved = titleToId.get(name);
    if (resolved) ids.push(resolved);
  }
  return ids;
}

function migrateSectionsToPanels(pg: SitePage): { id: string; title: string; content: string }[] {
  const existingPanels = (pg.panels || []).map((p) => ({ id: p.id, title: p.title, content: p.content }));
  const legacySections = (pg.sections || []);
  if (legacySections.length === 0) return existingPanels;
  const converted = legacySections.map((sec) => ({
    id: sec.id.startsWith("sec-") ? sec.id.replace("sec-", "panel-") : `panel-${sec.id}`,
    title: sec.heading || "",
    content: sec.body || "",
  }));
  return [...converted, ...existingPanels];
}

function extractAllWikiLinks(page: SitePage, titleToId: Map<string, string>): string[] {
  const ids = new Set<string>();
  const allPanels = migrateSectionsToPanels(page);
  const texts = [
    page.body || "",
    ...allPanels.map((p) => p.content || ""),
  ];
  for (const text of texts) {
    extractWikiLinks(text).forEach((id) => ids.add(id));
    extractBracketWikiLinks(text, titleToId).forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

// ═══════════════════════════════════════════
// Force-directed layout simulation
// ═══════════════════════════════════════════

function applyForces(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  const REPULSION = 3000;
  const ATTRACTION = 0.008;
  const DAMPING = 0.85;
  const CENTER_GRAVITY = 0.01;

  const cx = width / 2;
  const cy = height / 2;

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx += fx;
      nodes[i].vy += fy;
      nodes[j].vx -= fx;
      nodes[j].vy -= fy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const force = dist * ATTRACTION;
    const fx = (dx / Math.max(dist, 1)) * force;
    const fy = (dy / Math.max(dist, 1)) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Center gravity
  for (const node of nodes) {
    node.vx += (cx - node.x) * CENTER_GRAVITY;
    node.vy += (cy - node.y) * CENTER_GRAVITY;
  }

  // Apply velocity with damping
  for (const node of nodes) {
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;
    // Keep in bounds
    node.x = Math.max(60, Math.min(width - 60, node.x));
    node.y = Math.max(60, Math.min(height - 60, node.y));
  }
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════

export function WikiGraph() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterWikiTag, setFilterWikiTag] = useState<string>("all");
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSimulating, setIsSimulating] = useState(true);
  const [graphReady, setGraphReady] = useState(false);
  const tickCountRef = useRef(0);

  // Build graph from localStorage data
  useEffect(() => {
    const pages: SitePage[] = safeGetJson("inet-dm-sites", []);
    const pageIds = new Set(pages.map((p) => p.id));

    const nodes: GraphNode[] = pages.map((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(pages.length, 1);
      const radius = Math.min(dimensions.w, dimensions.h) * 0.3;
      return {
        id: p.id,
        title: p.title || "Untitled",
        category: p.category || "Uncategorized",
        x: dimensions.w / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: dimensions.h / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        tags: p.tags || [],
        wikiTags: p.wikiTags || [],
        connectionCount: 0,
      };
    });

    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();
    const addEdge = (src: string, tgt: string, type: GraphEdge["type"]) => {
      if (!pageIds.has(src) || !pageIds.has(tgt) || src === tgt) return;
      const key = [src, tgt].sort().join("__") + type;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ source: src, target: tgt, type });
    };

    const titleToId = new Map<string, string>();
    for (const page of pages) {
      titleToId.set(page.title.toLowerCase(), page.id);
    }

    for (const page of pages) {
      // See Also links
      (page.seeAlso || []).forEach((targetId) => addEdge(page.id, targetId, "seeAlso"));
      // Related articles
      (page.relatedArticleIds || []).forEach((targetId) => addEdge(page.id, targetId, "related"));
      // Subcategory article links
      const walkSub = (subs: SitePage["subcategories"]) => {
        for (const sc of subs) {
          if (sc.type === "article" && sc.articleId) addEdge(page.id, sc.articleId, "subcategory");
          if (sc.children) walkSub(sc.children);
        }
      };
      walkSub(page.subcategories || []);
      // Wiki links in content
      extractAllWikiLinks(page, titleToId).forEach((targetId) => addEdge(page.id, targetId, "wikiLink"));
      // Shared wiki tags
      const sharedTags = page.wikiTags || [];
      for (const tag of sharedTags) {
        for (const otherPage of pages) {
          if (otherPage.id !== page.id && (otherPage.wikiTags || []).includes(tag)) {
            addEdge(page.id, otherPage.id, "sharedWikiTag");
          }
        }
      }
    }

    // Count connections per node
    const connCount = new Map<string, number>();
    for (const edge of edges) {
      connCount.set(edge.source, (connCount.get(edge.source) || 0) + 1);
      connCount.set(edge.target, (connCount.get(edge.target) || 0) + 1);
    }
    for (const node of nodes) {
      node.connectionCount = connCount.get(node.id) || 0;
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    setIsSimulating(true);
    tickCountRef.current = 0;
    setGraphReady(true);
  }, []);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const render = () => {
      if (!running) return;

      const { w, h } = dimensions;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      // Apply physics
      if (isSimulating && tickCountRef.current < 200) {
        applyForces(nodesRef.current, edgesRef.current, w, h);
        tickCountRef.current += 1;
      }

      // Clear
      ctx.fillStyle = "#060620";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "#0A0A30";
      ctx.lineWidth = 0.5;
      const gridSize = 40 * zoom;
      const offsetX = (panOffset.x * zoom) % gridSize;
      const offsetY = (panOffset.y * zoom) % gridSize;
      for (let x = offsetX; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = offsetY; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Filter
      let visibleNodes = filterCategory === "all" ? nodes : nodes.filter((n) => n.category === filterCategory);
      if (filterWikiTag !== "all") {
        visibleNodes = visibleNodes.filter((n) => n.wikiTags.includes(filterWikiTag));
      }
      const visibleIds = new Set(visibleNodes.map((n) => n.id));
      const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

      // Draw edges
      const EDGE_COLORS: Record<string, string> = {
        seeAlso: "#4A7BFF55",
        subcategory: "#4AFF6A55",
        wikiLink: "#FF6ABB55",
        related: "#FFAA4A55",
        sharedWikiTag: "#9A7ABB55",
      };

      for (const edge of visibleEdges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;

        ctx.strokeStyle = EDGE_COLORS[edge.type] || "#2A3A5A55";
        ctx.lineWidth = hoveredNode && (hoveredNode.id === edge.source || hoveredNode.id === edge.target) ? 2 : 1;

        if (hoveredNode && (hoveredNode.id === edge.source || hoveredNode.id === edge.target)) {
          ctx.strokeStyle = EDGE_COLORS[edge.type]?.replace("55", "CC") || "#2A3A5ACC";
        }

        if (edge.type === "sharedWikiTag") {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw nodes
      for (const node of visibleNodes) {
        const color = getCategoryColor(node.category);
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const radius = Math.max(8, Math.min(20, 8 + node.connectionCount * 2));

        // Glow
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = `${color}33`;
          ctx.fill();
        }

        // Outer circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isHovered || isSelected ? color : `${color}AA`;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#FFFFFF" : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#0C0C2E";
        ctx.fill();

        // Label
        ctx.font = `${isHovered || isSelected ? "bold" : "normal"} ${Math.max(10, 11 / zoom)}px Tahoma, Verdana, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = isHovered || isSelected ? "#FFFFFF" : `${color}CC`;

        // Label background
        const textWidth = ctx.measureText(node.title).width;
        const labelY = node.y + radius + 14;
        ctx.fillStyle = "#060620CC";
        ctx.fillRect(node.x - textWidth / 2 - 4, labelY - 10, textWidth + 8, 14);
        ctx.fillStyle = isHovered || isSelected ? "#FFFFFF" : `${color}CC`;
        ctx.fillText(node.title, node.x, labelY);
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [dimensions, zoom, panOffset, hoveredNode, selectedNode, filterCategory, filterWikiTag, isSimulating]);

  // Mouse handling
  const getNodeAt = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left - panOffset.x) / zoom;
    const my = (clientY - rect.top - panOffset.y) / zoom;

    for (const node of nodesRef.current) {
      const dx = node.x - mx;
      const dy = node.y - my;
      const radius = Math.max(8, Math.min(20, 8 + node.connectionCount * 2));
      if (dx * dx + dy * dy < (radius + 5) * (radius + 5)) return node;
    }
    return null;
  }, [zoom, panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPanOffset((prev) => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
      return;
    }
    const node = getNodeAt(e.clientX, e.clientY);
    setHoveredNode(node);
    if (canvasRef.current) canvasRef.current.style.cursor = node ? "pointer" : "grab";
  }, [isDragging, getNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) {
      setSelectedNode(node);
    } else {
      setIsDragging(true);
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  }, [getNodeAt]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (canvasRef.current) canvasRef.current.style.cursor = hoveredNode ? "pointer" : "grab";
  }, [hoveredNode]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const node = getNodeAt(e.clientX, e.clientY);
    if (node) navigate(`/interface/wiki-editor/${node.id}`);
  }, [getNodeAt, navigate]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  // Attach wheel event listener with { passive: false }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Get all unique categories
  const categories = Array.from(new Set(nodesRef.current.map((n) => n.category)));

  // Get all unique wiki tags
  const allWikiTags = Array.from(new Set(nodesRef.current.flatMap((n) => n.wikiTags)));

  // Edge type legend
  const EDGE_TYPES = [
    { type: "seeAlso", label: "See Also", color: "#4A7BFF" },
    { type: "subcategory", label: "Subcategory", color: "#4AFF6A" },
    { type: "wikiLink", label: "Wiki Link", color: "#FF6ABB" },
    { type: "related", label: "Related", color: "#FFAA4A" },
    { type: "sharedWikiTag", label: "Shared Wiki Tag", color: "#9A7ABB" },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#060620", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}>
      {/* Toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between`} style={{ borderBottom: "2px solid #050520" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/interface/dm-area")}
            className="text-[11px] hover:opacity-80 flex items-center gap-1"
            style={S_ACCENT}
          >
            <ArrowLeft size={12} /> Back to DM Area
          </button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px] flex items-center gap-1" style={S_LINK}>
            <Link2 size={11} /> Article Interlink Graph
          </span>
          <span className="text-[9px] px-2 py-0.5" style={{ color: "#5A6A8A", background: "#0A0A20", border: "1px solid #1A1A4B" }}>
            {nodesRef.current.length} articles &middot; {edgesRef.current.length} connections
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Category filter */}
          <Filter size={10} style={S_MUTED} />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-[10px] bg-[#0A0A28] px-2 py-1 outline-none cursor-pointer"
            style={{ color: "#6A9AFF", border: "1px solid #1A2A4B" }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {allWikiTags.length > 0 && (
            <div style={DISPLAY_CONTENTS}>
              <BookOpen size={10} style={{ color: "#9A5ABB" }} />
              <select
                value={filterWikiTag}
                onChange={(e) => setFilterWikiTag(e.target.value)}
                className="text-[10px] bg-[#0A0A28] px-2 py-1 outline-none cursor-pointer"
                style={{ color: "#D07AFF", border: "1px solid #3A1A5B" }}
              >
                <option value="all">All Wiki Tags</option>
                {allWikiTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
          {/* Zoom controls */}
          <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className={`${retro.button} px-2 py-1`}>
            <ZoomIn size={12} style={S_LINK} />
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))} className={`${retro.button} px-2 py-1`}>
            <ZoomOut size={12} style={S_LINK} />
          </button>
          <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} className={`${retro.button} px-2 py-1`}>
            <Maximize2 size={12} style={S_LINK} />
          </button>
        </div>
      </div>

      {/* Graph area */}
      <div className="flex-1 relative" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: "grab" }}
        />

        {/* Legend */}
        <div
          className="absolute bottom-4 left-4 p-3"
          style={{ background: "#0C0C2EEE", border: "1px solid #1A1A4B", zIndex: 10 }}
        >
          <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>Legend</div>
          <div className="space-y-1">
            {EDGE_TYPES.map((et) => (
              <div key={et.type} className="flex items-center gap-2 text-[10px]">
                <div style={{
                  width: 16, height: 2,
                  background: et.type === "sharedWikiTag"
                    ? `repeating-linear-gradient(90deg, ${et.color} 0px, ${et.color} 3px, transparent 3px, transparent 6px)`
                    : et.color,
                }} />
                <span style={{ color: et.color }}>{et.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2" style={{ borderTop: "1px solid #1A1A3B" }}>
            <div className="text-[9px]" style={S_DIM}>Double-click node to edit article</div>
            <div className="text-[9px]" style={S_DIM}>Drag to pan, scroll to zoom</div>
          </div>
        </div>

        {/* Category legend */}
        {categories.length > 0 && (
          <div
            className="absolute top-4 right-4 p-3"
            style={{ background: "#0C0C2EEE", border: "1px solid #1A1A4B", zIndex: 10 }}
          >
            <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>Categories</div>
            <div className="space-y-1">
              {categories.map((cat) => (
                <div key={cat} className="flex items-center gap-2 text-[10px]">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: getCategoryColor(cat) }} />
                  <span style={{ color: getCategoryColor(cat) }}>{cat}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected node info panel */}
        {selectedNode && (
          <div
            className="absolute bottom-4 right-4 p-4 w-[280px]"
            style={{ background: "#0C0C2EEE", border: `1px solid ${getCategoryColor(selectedNode.category)}44`, zIndex: 10 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px]" style={{ color: getCategoryColor(selectedNode.category), fontWeight: 600 }}>{selectedNode.title}</span>
              <button onClick={() => setSelectedNode(null)} className="hover:opacity-80"><Eye size={10} style={S_MUTED} /></button>
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center gap-2">
                <FolderOpen size={9} style={S_MUTED} />
                <span style={S_SUBTLE}>{selectedNode.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link2 size={9} style={S_MUTED} />
                <span style={S_SUBTLE}>{selectedNode.connectionCount} connections</span>
              </div>
              {selectedNode.tags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag size={9} className="shrink-0 mt-0.5" style={S_MUTED} />
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.tags.map((t) => (
                      <span key={t} className="text-[8px] px-1.5 py-0.5" style={{ color: "#6A9AFF", background: "#0A0A30", border: "1px solid #1A2A5B" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {selectedNode.wikiTags.length > 0 && (
                <div className="flex items-start gap-2">
                  <BookOpen size={9} className="shrink-0 mt-0.5" style={{ color: "#9A5ABB" }} />
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.wikiTags.map((t) => (
                      <span key={t} className="text-[8px] px-1.5 py-0.5" style={{ color: "#D07AFF", background: "#1A0A2A", border: "1px solid #3A1A5B" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigate(`/interface/wiki-editor/${selectedNode.id}`)}
                className={`${retro.button} px-3 py-1 text-[10px] flex-1 flex items-center justify-center gap-1`}
                style={S_LINK}
              >
                <FileText size={9} /> Edit
              </button>
              <button
                onClick={() => navigate(`/interface/inet-page/${selectedNode.id}`)}
                className={`${retro.button} px-3 py-1 text-[10px] flex-1 flex items-center justify-center gap-1`}
                style={{ color: "#4AFF6A" }}
              >
                <Eye size={9} /> View
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {graphReady && nodesRef.current.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8" style={{ background: "#0C0C2ECC", border: "1px solid #1A1A4B" }}>
              <Link2 size={40} style={{ color: "#2A3A5A" }} className="mx-auto mb-4" />
              <div className="text-[14px] mb-2" style={S_MUTED}>No Articles Yet</div>
              <div className="text-[11px] mb-4" style={S_DIM}>Create some wiki articles in the DM Area to see their connections here.</div>
              <button
                onClick={() => navigate("/interface/dm-area")}
                className={`${retro.button} px-4 py-2 text-[11px]`}
                style={S_LINK}
              >
                Go to DM Area
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}