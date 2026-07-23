import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { retro } from "./retro-styles";
import {
  S_MUTED, S_DIM, S_ACCENT, S_TEXT, S_RED, S_SUBTLE, S_LABEL,
  S_ACCENT_HDR, S_SECTION_HDR, S_GREEN_BTN, SUNKEN_INPUT,
} from "./shared-styles";
import {
  ArrowLeft, MapPin, Plus, Trash2, Edit2, Save, X, Eye, EyeOff,
  ChevronRight, Navigation, CornerUpLeft, Layers, AlertTriangle,
  Skull, Shield, Home, Landmark, Trees, Anchor, Flame,
  Link2, Unlink, Cloud, CloudOff, Crosshair, Lock, Ban, DoorOpen,
  ZoomIn, ZoomOut, Maximize2, Image, Square, Grid3x3, Pentagon,
  Check, BookOpen, MapPinned, ImagePlus, Minus,
  Building2, Boxes, RotateCcw, Undo2, Redo2, Combine, Spline,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { safeGetItem, safeGetJson, safeSetJson } from "./safe-storage";
import { appStore } from "@/lib/app-store";

/* ==============================================================
   GEOMETRY ENGINE – Hexagonal city with 15 tiled sectors

   Layout:
     S0  = small circle at center
     S1-S4 = inner ring (cardinal-direction wedges)
       S1=North  S2=East  S3=South  S4=West
     S5-S14 = outer ring (10 sectors, CW from N vertex)
   ============================================================== */

const CX = 2500, CY = 2500;
const HEX_R = 600;
const R_CORE = 53;
const R_INNER = 289;
const R_MID = 305;
const WALL_PAD = 10;
const OUTER_HEX_R = 1200;
const OUTER_VERT_ANGLES = [270, 330, 30, 90, 150, 210];

function outerHexPol(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + OUTER_HEX_R * Math.cos(rad), CY + OUTER_HEX_R * Math.sin(rad)];
}

/* ==============================================================
   OUTER SECTORS – 8 sectors filling the annular ring between walls.

   8 boundary lines:
     Top vertex IV[0] → OM_NW (240°) and OM_NE (300°)  [2 diverging]
     Bottom vertex IV[3] → OM_SE (60°) and OM_SW (120°) [2 diverging]
     Side vertices straight through: IV[1]→OV[1], IV[2]→OV[2],
       IV[4]→OV[4], IV[5]→OV[5]

   Layout (CW from top):
     15 = N triangle (top vertex apex)
     16 = NE square (upper-right)
     17 = E trapezoid (right side)
     18 = SE square (lower-right)
     19 = S triangle (bottom vertex apex)
     20 = SW square (lower-left)
     21 = W trapezoid (left side)
     22 = NW square (upper-left)
   ============================================================== */

// Inner hex vertices at HEX_R  (index 0=top @270°, CW)
const IV: [number, number][] = [270, 330, 30, 90, 150, 210].map(a => {
  const r = (a * Math.PI) / 180;
  return [CX + HEX_R * Math.cos(r), CY + HEX_R * Math.sin(r)] as [number, number];
});
// Outer hex vertices at OUTER_HEX_R
const OV: [number, number][] = [270, 330, 30, 90, 150, 210].map(a => {
  const r = (a * Math.PI) / 180;
  return [CX + OUTER_HEX_R * Math.cos(r), CY + OUTER_HEX_R * Math.sin(r)] as [number, number];
});

// Lerp helper for two points
function lerpPt(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Edge midpoints on outer hex (boundary targets for top/bottom vertex fan-out)
const OM_NW: [number, number] = lerpPt(OV[5], OV[0], 0.5); // 240°
const OM_NE: [number, number] = lerpPt(OV[0], OV[1], 0.5); // 300°
const OM_SE: [number, number] = lerpPt(OV[2], OV[3], 0.5); // 60°
const OM_SW: [number, number] = lerpPt(OV[3], OV[4], 0.5); // 120°

interface OuterSectorV2 {
  id: number;
  name: string;
  shapeType: "RECT" | "HEX" | "TRAP";
  polygon: [number, number][];
  color: string;
  numSubs: number;
  gridRows: number; // radial bands (inner→outer)
  gridCols: number; // angular divisions
  isWedge?: boolean; // true for triangle sectors (apex = polygon[0])
}

// Sectors CW from top.
const OUTER_SECTORS_V2: OuterSectorV2[] = [
  { // 15: N triangle — top vertex apex, fans to OM_NW & OM_NE
    id: 15, name: "Sector 15 · Northern Reach", shapeType: "TRAP", color: "#7B8FCC",
    numSubs: 5, gridRows: 2, gridCols: 3, isWedge: true,
    polygon: [IV[0], OM_NE, OV[0], OM_NW],
  },
  { // 16: NE square — inner IV[0]→IV[1], outer OM_NE→OV[1]
    id: 16, name: "Sector 16 · NE Quarter", shapeType: "RECT", color: "#6B7FBB",
    numSubs: 6, gridRows: 3, gridCols: 2,
    polygon: [IV[0], IV[1], OV[1], OM_NE],
  },
  { // 17: E trapezoid — reduced from 8 to 4
    id: 17, name: "Sector 17 · Eastern Front", shapeType: "RECT", color: "#5B9BDD",
    numSubs: 4, gridRows: 2, gridCols: 2,
    polygon: [IV[1], IV[2], OV[2], OV[1]],
  },
  { // 18: SE square — reduced + 2 merged into 1 = 5
    id: 18, name: "Sector 18 · SE Quarter", shapeType: "RECT", color: "#4AABCC",
    numSubs: 6, gridRows: 2, gridCols: 3,
    polygon: [IV[2], IV[3], OM_SE, OV[2]],
  },
  { // 19: S triangle — reduced + 2 merged into 1 = 3
    id: 19, name: "Sector 19 · Southern Expanse", shapeType: "TRAP", color: "#4ABFAA",
    numSubs: 4, gridRows: 2, gridCols: 2, isWedge: true,
    polygon: [IV[3], OM_SW, OV[3], OM_SE],
  },
  { // 20: SW square — reduced + 2 merged into 1 = 5
    id: 20, name: "Sector 20 · SW Quarter", shapeType: "RECT", color: "#6BAA77",
    numSubs: 6, gridRows: 2, gridCols: 3,
    polygon: [IV[3], IV[4], OV[4], OM_SW],
  },
  { // 21: W trapezoid — reduced from 11 to 6
    id: 21, name: "Sector 21 · Western Front", shapeType: "RECT", color: "#AA8855",
    numSubs: 6, gridRows: 2, gridCols: 3,
    polygon: [IV[4], IV[5], OV[5], OV[4]],
  },
  { // 22: NW square — split 22.D into D + F = 5 total
    id: 22, name: "Sector 22 · NW Quarter", shapeType: "RECT", color: "#BB7788",
    numSubs: 6, gridRows: 2, gridCols: 3,
    polygon: [IV[5], IV[0], OM_NW, OV[5]],
  },
];

/* ── Point-in-polygon helper (ray casting) ── */
function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/* ── Seeded pseudo-random (deterministic per sector) ── */
function seededRand(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

/* ── Generate sub-sector grid labels + division lines ── */
function generateSubSectors(sector: OuterSectorV2): {
  labels: { label: string; x: number; y: number; poly: [number, number][] }[];
  lines: [number, number, number, number][];
} {
  const { polygon, numSubs, id } = sector;
  if (numSubs === 0) return { labels: [], lines: [] };
  // For wedge/triangle sectors: polygon[0] is apex, polygon[1..3] are outer arc.
  // For quad sectors: polygon[0..1] are inner edge, polygon[2..3] are outer edge.
  const isWedge = !!(sector as any).isWedge;
  let innerPts: [number, number][];
  let outerPts: [number, number][];
  if (isWedge) {
    const apex = polygon[0];
    const oA = polygon[1]; // outer start
    const oC = polygon[3]; // outer end
    innerPts = [
      lerpPt(apex, oC, 0.005),
      lerpPt(apex, oA, 0.005),
    ];
    outerPts = [polygon[1], polygon[2], polygon[3]].reverse();
  } else {
    innerPts = polygon.slice(0, 2);
    outerPts = polygon.slice(2).reverse();
  }

  // Walk along a polyline at parameter t ∈ [0,1]
  function polylineAt(pts: [number, number][], t: number): [number, number] {
    if (pts.length === 1) return pts[0];
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }
    let target = t * totalLen;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (target <= segLen || i === pts.length - 1) {
        const st = segLen > 0 ? target / segLen : 0;
        return [pts[i - 1][0] + dx * st, pts[i - 1][1] + dy * st];
      }
      target -= segLen;
    }
    return pts[pts.length - 1];
  }

  const rand = seededRand(id * 13331 + 37);
  const gRows = sector.gridRows;
  const gCols = sector.gridCols;

  const lines: [number, number, number, number][] = [];

  // Helper: build a chaotic border between two points, returning polyline of points
  function rigidLinePoints(p0: [number, number], p1: [number, number]): [number, number][] {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    const alongX = dx / len, alongY = dy / len;

    type Feature = { t: number; kind: "crank" | "landgrab" | "spike" | "trench" };
    const feats: Feature[] = [];
    const kinds: Feature["kind"][] = ["crank", "landgrab", "spike", "trench"];
    const nFeats = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < nFeats; i++) {
      feats.push({ t: 0.06 + rand() * 0.88, kind: kinds[Math.floor(rand() * kinds.length)] });
    }
    feats.sort((a, b) => a.t - b.t);
    const filtered: Feature[] = [feats[0]];
    for (let i = 1; i < feats.length; i++) {
      if (feats[i].t - filtered[filtered.length - 1].t > 0.08) filtered.push(feats[i]);
    }

    const pts: [number, number][] = [p0];
    let drift = 0;
    const maxDrift = len * 0.06;
    for (const f of filtered) {
      const base: [number, number] = [p0[0] + dx * f.t + perpX * drift, p0[1] + dy * f.t + perpY * drift];
      if (f.kind === "crank") {
        const off = (rand() - 0.5) * len * 0.1;
        const pt: [number, number] = [base[0] + perpX * off, base[1] + perpY * off];
        pts.push(pt);
        drift = Math.max(-maxDrift, Math.min(maxDrift, drift + off * 0.2));
      } else if (f.kind === "landgrab") {
        const depth = (rand() - 0.5) * len * 0.09;
        const halfW = (0.02 + rand() * 0.04) * len;
        const c1: [number, number] = [base[0] - alongX * halfW, base[1] - alongY * halfW];
        const c2: [number, number] = [c1[0] + perpX * depth, c1[1] + perpY * depth];
        const c3: [number, number] = [base[0] + alongX * halfW + perpX * depth, base[1] + alongY * halfW + perpY * depth];
        const c4: [number, number] = [base[0] + alongX * halfW, base[1] + alongY * halfW];
        pts.push(c1, c2, c3, c4);
      } else if (f.kind === "spike") {
        const spikeH = (rand() - 0.5) * len * 0.08;
        const spikeW = (0.01 + rand() * 0.015) * len;
        const tip: [number, number] = [base[0] + perpX * spikeH, base[1] + perpY * spikeH];
        const end: [number, number] = [base[0] + alongX * spikeW, base[1] + alongY * spikeW];
        pts.push(tip, end);
      } else {
        const trenchD = (rand() - 0.5) * len * 0.07;
        const trenchL = (0.015 + rand() * 0.025) * len;
        const a1: [number, number] = [base[0] + perpX * trenchD, base[1] + perpY * trenchD];
        const a2: [number, number] = [a1[0] + alongX * trenchL, a1[1] + alongY * trenchL];
        const a3: [number, number] = [a2[0] - perpX * trenchD * 0.7, a2[1] - perpY * trenchD * 0.7];
        pts.push(a1, a2, a3);
      }
    }
    pts.push(p1);
    return pts;
  }

  // Convert polyline to line segments and add to lines array
  function polylineToSegments(pl: [number, number][]) {
    for (let i = 0; i < pl.length - 1; i++) {
      lines.push([pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]]);
    }
  }

  // Helper: extract sub-polyline from tStart to tEnd (arc-length parameterized 0..1)
  function subPolyline(pl: [number, number][], tStart: number, tEnd: number): [number, number][] {
    if (pl.length < 2) return [...pl];
    let totalLen = 0;
    const cumLens = [0];
    for (let i = 1; i < pl.length; i++) {
      const ddx = pl[i][0] - pl[i - 1][0], ddy = pl[i][1] - pl[i - 1][1];
      totalLen += Math.sqrt(ddx * ddx + ddy * ddy);
      cumLens.push(totalLen);
    }
    if (totalLen === 0) return [pl[0]];
    const startDist = tStart * totalLen;
    const endDist = tEnd * totalLen;
    const result: [number, number][] = [];
    let started = false;
    for (let i = 1; i < pl.length; i++) {
      if (!started && cumLens[i] >= startDist - 0.01) {
        const segLen = cumLens[i] - cumLens[i - 1];
        const tt = segLen > 0 ? Math.max(0, Math.min(1, (startDist - cumLens[i - 1]) / segLen)) : 0;
        result.push(lerpPt(pl[i - 1], pl[i], tt));
        started = true;
      }
      if (started) {
        if (cumLens[i] >= endDist - 0.01) {
          const segLen = cumLens[i] - cumLens[i - 1];
          const tt = segLen > 0 ? Math.max(0, Math.min(1, (endDist - cumLens[i - 1]) / segLen)) : 0;
          result.push(lerpPt(pl[i - 1], pl[i], tt));
          return result;
        }
        result.push(pl[i]);
      }
    }
    if (!result.length) result.push(pl[pl.length - 1]);
    return result;
  }

  // Build column dividers as polylines (inner→outer)
  const colDividers: [number, number][][] = [];
  for (let c = 1; c < gCols; c++) {
    const t = c / gCols;
    const jInner = (rand() - 0.5) * 0.06;
    const jOuter = (rand() - 0.5) * 0.08;
    const ip = polylineAt(innerPts, Math.max(0, Math.min(1, t + jInner)));
    const op = polylineAt(outerPts, Math.max(0, Math.min(1, t + jOuter)));
    const pl = rigidLinePoints(ip, op);
    colDividers.push(pl);
    polylineToSegments(pl);
  }

  // Build row dividers as polylines (left→right)
  const rowDividers: [number, number][][] = [];
  for (let r = 1; r < gRows; r++) {
    const u = r / gRows;
    const steps = Math.max(gCols * 2, 8);
    const basePts: [number, number][] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const localU = u + (rand() - 0.5) * 0.05;
      basePts.push(lerpPt(polylineAt(innerPts, t), polylineAt(outerPts, t), Math.max(0.05, Math.min(0.95, localU))));
    }
    const rigidPts: [number, number][] = [basePts[0]];
    for (let s = 1; s < basePts.length; s++) {
      const sdx = basePts[s][0] - basePts[s - 1][0], sdy = basePts[s][1] - basePts[s - 1][1];
      const segLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      const px = -sdy / segLen, py = sdx / segLen;
      const ax = sdx / segLen, ay = sdy / segLen;
      const feat = rand();
      if (feat > 0.72 && s < basePts.length - 1) {
        const offset = (rand() - 0.5) * 24;
        const nw = segLen * (0.2 + rand() * 0.35);
        rigidPts.push([basePts[s][0] - ax * nw * 0.5, basePts[s][1] - ay * nw * 0.5]);
        rigidPts.push([basePts[s][0] - ax * nw * 0.5 + px * offset, basePts[s][1] - ay * nw * 0.5 + py * offset]);
        rigidPts.push([basePts[s][0] + ax * nw * 0.5 + px * offset, basePts[s][1] + ay * nw * 0.5 + py * offset]);
        rigidPts.push([basePts[s][0] + ax * nw * 0.5, basePts[s][1] + ay * nw * 0.5]);
      } else if (feat > 0.5 && s < basePts.length - 1) {
        const trD = (rand() - 0.5) * 18;
        const trL = segLen * (0.2 + rand() * 0.3);
        rigidPts.push([basePts[s][0] + px * trD, basePts[s][1] + py * trD]);
        rigidPts.push([basePts[s][0] + px * trD + ax * trL, basePts[s][1] + py * trD + ay * trL]);
        rigidPts.push([basePts[s][0] + px * trD * 0.3 + ax * trL, basePts[s][1] + py * trD * 0.3 + ay * trL]);
      } else if (feat > 0.3 && s < basePts.length - 1) {
        const offset = (rand() - 0.5) * 14;
        rigidPts.push([basePts[s][0] + px * offset, basePts[s][1] + py * offset]);
      } else {
        if (rand() > 0.4 && s < basePts.length - 1) {
          rigidPts.push([basePts[s][0] + px * (rand() - 0.5) * 8, basePts[s][1] + py * (rand() - 0.5) * 8]);
        } else {
          rigidPts.push(basePts[s]);
        }
      }
    }
    rowDividers.push(rigidPts);
    polylineToSegments(rigidPts);
  }

  // Build dense polylines for sector boundaries
  const boundarySteps = 20;
  const innerBoundary: [number, number][] = [];
  const outerBoundary: [number, number][] = [];
  for (let s = 0; s <= boundarySteps; s++) {
    const t = s / boundarySteps;
    innerBoundary.push(polylineAt(innerPts, t));
    outerBoundary.push(polylineAt(outerPts, t));
  }
  const leftBoundary: [number, number][] = [innerBoundary[0], outerBoundary[0]];
  const rightBoundary: [number, number][] = [innerBoundary[boundarySteps], outerBoundary[boundarySteps]];

  function getRowBoundary(rIdx: number): [number, number][] {
    if (rIdx === 0) return innerBoundary;
    if (rIdx === gRows) return outerBoundary;
    return rowDividers[rIdx - 1];
  }

  function getColBoundary(cIdx: number): [number, number][] {
    if (cIdx === 0) return leftBoundary;
    if (cIdx === gCols) return rightBoundary;
    return colDividers[cIdx - 1];
  }

  // Build cell polygon for cell (r, c) by tracing its 4 edges
  function buildCellPoly(r: number, c: number): [number, number][] {
    const tLeft = c / gCols, tRight = (c + 1) / gCols;
    const uTop = r / gRows, uBottom = (r + 1) / gRows;
    const cellPts: [number, number][] = [];

    // Top edge (row boundary r): left→right portion
    const topEdge = subPolyline(getRowBoundary(r), tLeft, tRight);
    cellPts.push(...topEdge);

    // Right edge (col boundary c+1): top→bottom portion
    const rightEdge = subPolyline(getColBoundary(c + 1), uTop, uBottom);
    cellPts.push(...rightEdge.slice(1));

    // Bottom edge (row boundary r+1): right→left portion (reversed)
    const bottomEdge = subPolyline(getRowBoundary(r + 1), tLeft, tRight);
    const bottomRev = [...bottomEdge].reverse();
    cellPts.push(...bottomRev.slice(1));

    // Left edge (col boundary c): bottom→top portion (reversed)
    const leftEdge = subPolyline(getColBoundary(c), uTop, uBottom);
    const leftRev = [...leftEdge].reverse();
    cellPts.push(...leftRev.slice(1));

    return cellPts;
  }

  // Compute polygon centroid
  let centX = 0, centY = 0;
  polygon.forEach(([x, y]) => { centX += x; centY += y; });
  centX /= polygon.length; centY /= polygon.length;

  // Find which grid cell (r,c) is closest to centroid — that becomes "A"
  let bestR = 0, bestC = 0, bestDist = Infinity;
  for (let r = 0; r < gRows; r++) {
    for (let c = 0; c < gCols; c++) {
      const u = (r + 0.5) / gRows;
      const t = (c + 0.5) / gCols;
      const ip = polylineAt(innerPts, t);
      const op = polylineAt(outerPts, t);
      const pt = lerpPt(ip, op, u);
      const d = (pt[0] - centX) ** 2 + (pt[1] - centY) ** 2;
      if (d < bestDist) { bestDist = d; bestR = r; bestC = c; }
    }
  }

  // Sub-sector label positions
  const labels: { label: string; x: number; y: number; poly: [number, number][] }[] = [];
  let letterIdx = 0;
  for (let r = 0; r < gRows; r++) {
    for (let c = 0; c < gCols; c++) {
      if (letterIdx >= numSubs) break;
      const u = (r + 0.5) / gRows;
      const t = (c + 0.5) / gCols;
      const ip = polylineAt(innerPts, t);
      const op = polylineAt(outerPts, t);
      const pt = lerpPt(ip, op, u);

      const cellPoly = buildCellPoly(r, c);

      let letter: string;
      if (r === bestR && c === bestC) {
        letter = "A";
      } else {
        const seqIdx = r * gCols + c;
        const aSeqIdx = bestR * gCols + bestC;
        if (seqIdx < aSeqIdx) {
          letter = String.fromCharCode(66 + seqIdx);
        } else {
          letter = String.fromCharCode(65 + seqIdx);
        }
      }
      labels.push({
        label: `${id}.${letter}`,
        x: pt[0], y: pt[1],
        poly: cellPoly,
      });
      letterIdx++;
    }
  }

  return { labels, lines };
}

// Pre-compute sub-sector data
const OUTER_SECTOR_SUBS = OUTER_SECTORS_V2.map(s => generateSubSectors(s));

function pol(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function hexR(deg: number): number {
  const apothem = HEX_R * Math.cos(Math.PI / 6);
  const norm = ((deg - 270) % 360 + 360) % 360;
  const sec = Math.floor(norm / 60);
  const inSec = norm - sec * 60;
  const rad = ((inSec - 30) * Math.PI) / 180;
  return apothem / Math.cos(rad);
}

const VERT_ANGLES = [270, 330, 30, 90, 150, 210];

function arcRing(r: number, a0: number, a1: number, n: number): [number, number][] {
  let s = a0, e = a1;
  if (e < s) e += 360;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = s + (e - s) * (i / n);
    pts.push(pol(r, a % 360));
  }
  return pts;
}

function hexWall(a0: number, a1: number, pad: number): [number, number][] {
  let s = a0, e = a1;
  if (e <= s) e += 360;
  const pts: [number, number][] = [];
  pts.push(pol(hexR(s % 360) - pad, s % 360));
  const verts = VERT_ANGLES.flatMap(v => {
    const candidates = [v, v + 360];
    return candidates.filter(c => c > s && c < e);
  }).sort((a, b) => a - b);
  for (const v of verts) {
    pts.push(pol(HEX_R - pad, v % 360));
  }
  pts.push(pol(hexR(e % 360) - pad, e % 360));
  return pts;
}

function buildS0(steps: number): [number, number][] {
  return Array.from({ length: steps }, (_, i) => pol(R_CORE, i * (360 / steps)));
}

function buildInnerWedge(centerAngle: number): [number, number][] {
  const a0 = centerAngle - 45;
  const a1 = centerAngle + 45;
  const inner = arcRing(R_CORE, a0, a1, 12);
  const outer = arcRing(R_INNER, a0, a1, 12).reverse();
  return [...inner, ...outer];
}

function buildOuterSectorArc(a0: number, a1: number): [number, number][] {
  const inner = arcRing(R_INNER, a0, a1, 8);
  const wall = hexWall(a0, a1, WALL_PAD);
  return [...inner, ...wall.reverse()];
}

function centroid(points: [number, number][]): [number, number] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return [cx, cy];
}

function ptsStr(pairs: [number, number][]): string {
  return pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/* ==============================================================
   SECTOR DEFINITIONS
   ============================================================== */

interface SectorDef {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  color: string;
  image: string;
  ring: "center" | "inner" | "outer";
}

const SECTORS: SectorDef[] = [
  { id: "s0", number: 0, name: "The Nexus Core", subtitle: "Seat of the Deep Council", color: "#4A7BFF", image: "https://images.unsplash.com/photo-1633937356638-833796fa3215?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwdGhyb25lJTIwcm9vbSUyMGNhc3RsZSUyMGludGVyaW9yfGVufDF8fHx8MTc3MzYyNTE2M3ww&ixlib=rb-4.1.0&q=80&w=1080", ring: "center" },
  { id: "s1", number: 1, name: "Obsidian Quarter", subtitle: "Noble Estates", color: "#7B68EE", image: "https://images.unsplash.com/photo-1589380014929-201cc04d1d3c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpZXZhbCUyMGNhc3RsZSUyMGRpc3RyaWN0JTIwZGFyayUyMGFlcmlhbHxlbnwxfHx8fDE3NzM2MjM1NDd8MA&ixlib=rb-4.1.0&q=80&w=1080", ring: "inner" },
  { id: "s2", number: 2, name: "The Crucible", subtitle: "War Forges & Foundries", color: "#FF6A4A", image: "https://images.unsplash.com/photo-1766940973188-598a6bd59ad6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZm9yZ2UlMjBmdXJuYWNlJTIwZmlyZSUyMGJsYWNrc21pdGh8ZW58MXx8fHwxNzczNjI1MTYxfDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "inner" },
  { id: "s3", number: 3, name: "Fungal Gardens", subtitle: "Bio-Luminous Farms", color: "#4AFF4A", image: "https://images.unsplash.com/photo-1772975134343-8ee833ff809d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtdXNocm9vbSUyMGJpb2x1bWluZXNjZW50JTIwdW5kZXJncm91bmR8ZW58MXx8fHwxNzczNjI1MTYyfDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "inner" },
  { id: "s4", number: 4, name: "Whisper Ward", subtitle: "Arcane Studies", color: "#9A6AFF", image: "https://images.unsplash.com/photo-1691723576318-90ad87e5842d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnbG93aW5nJTIwY3J5c3RhbCUyMGNhdmUlMjB1bmRlcmdyb3VuZHxlbnwxfHx8fDE3NzM1NjMzMDJ8MA&ixlib=rb-4.1.0&q=80&w=1080", ring: "inner" },
  { id: "s5", number: 5, name: "The Spire Gate", subtitle: "Northern Bastion", color: "#4AFFFF", image: "https://images.unsplash.com/photo-1772459959273-8709758d92ca?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhbmNpZW50JTIwdGVtcGxlJTIwcnVpbnMlMjBkYXJrJTIwbW9vZHl8ZW58MXx8fHwxNzczNjIzNTUyfDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s6", number: 6, name: "Temple of Depths", subtitle: "The God-Hollows", color: "#FFD700", image: "https://images.unsplash.com/photo-1759937456722-c8e73dfd5128?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ290aGljJTIwY2F0aGVkcmFsJTIwaW50ZXJpb3J8ZW58MXx8fHwxNzczNjI1MTYyfDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s7", number: 7, name: "Silk Quarter", subtitle: "Pleasure & Intrigue", color: "#FF69B4", image: "https://images.unsplash.com/photo-1697390495868-2b1b1c959dce?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwaGFyYm9yJTIwcG9ydCUyMHNoaXBzJTIwYWVyaWFsJTIwbmlnaHR8ZW58MXx8fHwxNzczNjIzNTQ4fDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s8", number: 8, name: "The Deep Wells", subtitle: "Water & Mining", color: "#20B2AA", image: "https://images.unsplash.com/photo-1662118234344-4ee79efbf113?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHdhdGVyJTIwd2VsbCUyMGNhdmUlMjBwb29sfGVufDF8fHx8MTc3MzYyNTE2M3ww&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s9", number: 9, name: "Bone Warrens", subtitle: "The Underbelly", color: "#CD853F", image: "https://images.unsplash.com/photo-1677350656277-1ae19ac290ab?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMGNhdmVybiUyMGRhcmslMjBkdW5nZW9ufGVufDF8fHx8MTc3MzYyMzU0OXww&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s10", number: 10, name: "Crystal Caverns", subtitle: "Gem Vaults", color: "#00CED1", image: "https://images.unsplash.com/photo-1592912856915-bad0031bd105?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZm9yZXN0JTIwYW5jaWVudCUyMG15c3RlcmlvdXMlMjBhZXJpYWx8ZW58MXx8fHwxNzczNjIzNTQ4fDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s11", number: 11, name: "The Underbazaar", subtitle: "Shadow Commerce", color: "#FFAA4A", image: "https://images.unsplash.com/photo-1618121070660-60fd94c60588?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYXJrZXRwbGFjZSUyMGJhemFhciUyMG1lZGlldmFsJTIwZGFya3xlbnwxfHx8fDE3NzM2MjM1NDl8MA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s12", number: 12, name: "The Iron Locks", subtitle: "Prison Depths", color: "#708090", image: "https://images.unsplash.com/photo-1576755275964-922444912a73?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHByaXNvbiUyMGR1bmdlb24lMjBkYXJrfGVufDF8fHx8MTc3MzYyNTE2Mnww&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s13", number: 13, name: "The Pale Ring", subtitle: "Forbidden Threshold", color: "#8B5CF6", image: "https://images.unsplash.com/photo-1577966399656-cc4729afadcf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwdW5kZXJncm91bmQlMjBjb3JyaWRvciUyMGZvcmJpZGRlbiUyMHBhc3NhZ2V8ZW58MXx8fHwxNzczNjI4NDU5fDA&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
  { id: "s14", number: 14, name: "The Ash Veil", subtitle: "Scorched Tunnels", color: "#B8860B", image: "https://images.unsplash.com/photo-1771777311135-1ac36bb7d6a1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwdW5kZXJncm91bmQlMjB0dW5uZWwlMjBhbmNpZW50JTIwc3RvbmUlMjBwYXNzYWdlfGVufDF8fHx8MTc3MzY2MTc3Nnww&ixlib=rb-4.1.0&q=80&w=1080", ring: "outer" },
];

/* ==============================================================
   GATE DEFINITIONS
   ============================================================== */

interface GateDef {
  id: string;
  name: string;
  angle: number;
  color: string;
  description: string;
  image: string;
}

const GATES: GateDef[] = [
  { id: "gate-north", name: "North Gate", angle: 270, color: "#FFFFFF", description: "The fortified northern entrance through the outer hexagonal wall.", image: "https://images.unsplash.com/photo-1760991742734-e0fbbd26b4a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpZXZhbCUyMGNhc3RsZSUyMGdhdGUlMjBmb3J0cmVzcyUyMGVudHJhbmNlJTIwZGFya3xlbnwxfHx8fDE3NzM2NTQyNDR8MA&ixlib=rb-4.1.0&q=80&w=1080" },
  { id: "gate-south", name: "South Gate", angle: 90, color: "#FFFFFF", description: "The heavily guarded southern passage through the outer hexagonal wall.", image: "https://images.unsplash.com/photo-1763134141874-ea443b062ce8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZm9ydHJlc3MlMjBwb3J0Y3VsbGlzJTIwc3RvbmUlMjBhcmNod2F5fGVufDF8fHx8MTc3MzY1NDI0NHww&ixlib=rb-4.1.0&q=80&w=1080" },
];

/* ==============================================================
   FOG OF WAR TYPES
   ============================================================== */

type FogMode = "visible" | "locked" | "invisible";

const FOG_CYCLE: FogMode[] = ["visible", "locked", "invisible"];
const FOG_LABELS: Record<FogMode, string> = { visible: "Visible", locked: "Locked", invisible: "Invisible" };
const FOG_COLORS: Record<FogMode, string> = { visible: "#4AFF4A", locked: "#FFAA4A", invisible: "#FF6A6A" };

/* ==============================================================
   PIN / ZONE DATA TYPES
   ============================================================== */

type MapPoint = [number, number];
type DraftGeometryKind = "line" | "area" | "shell";
interface DraftPointTarget {
  kind: DraftGeometryKind;
  index: number;
}

type CompactPlaceDisplay = "auto" | "title" | "abbreviation" | "symbol";

interface MapPin_t {
  id: string;
  name: string;
  subtitle: string;
  abbreviation: string;
  symbol: string;
  compactDisplay: CompactPlaceDisplay;
  thumbnailUrl: string;
  x: number;
  y: number;
  icon: string;
  color: string;
  description: string;
  notes: string;
  images: string[];
  width: number;
  height: number;
  wikiPageId?: string;
  placeMapId?: string;
  buildingMapId?: string;
  childMapId?: string;
}

interface MapLine {
  id: string;
  start: MapPoint;
  end: MapPoint;
  color: string;
  width: number;
  opacity: number;
  dashed: boolean;
  curve: number;
}

function getLinePath(start: MapPoint, end: MapPoint, curve = 0): string {
  if (Math.abs(curve) < 0.01) return `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const offset = length * Math.max(-0.5, Math.min(0.5, curve / 100));
  const controlX = (start[0] + end[0]) / 2 + (-dy / length) * offset;
  const controlY = (start[1] + end[1]) / 2 + (dx / length) * offset;
  return `M ${start[0]} ${start[1]} Q ${controlX} ${controlY} ${end[0]} ${end[1]}`;
}

function getConnectionRouteKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("::");
}

function distanceToPathSegment(point: MapPoint, start: MapPoint, end: MapPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function getRouteInsertIndex(points: MapPoint[], point: MapPoint): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToPathSegment(point, points[index], points[index + 1]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

interface MapArea {
  id: string;
  name: string;
  points: MapPoint[];
  color: string;
  opacity: number;
}

type MapEditorVariant = "places" | "building";
type BuildingSlotKind = "industrial" | "commercial" | "residential" | "civic" | "storage" | "utility" | "security" | "medical" | "research" | "other";

interface BuildingShell {
  points: MapPoint[];
  color: string;
  opacity: number;
  wallWidth: number;
}

interface BuildingSlot {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: BuildingSlotKind;
  filled: boolean;
  contents: string;
  description: string;
}

interface MapZone {
  id: string; name: string; subtitle: string; color: string; image: string;
  pins: MapPin_t[]; fogMode: FogMode; connections: [string, string][]; sectorNumber: number;
  connectionRoutes: Record<string, MapPoint[]>;
  walls: [number, number, number, number][]; // [x1,y1,x2,y2] in % coordinates
  lines: MapLine[];
  areas: MapArea[];
  editorVariant: MapEditorVariant;
  buildingShell: BuildingShell;
  buildingSlots: BuildingSlot[];
  mapType: "sector" | "place";
  parentZoneId?: string;
  parentPlaceId?: string;
  schemaVersion: 6;
  useMapBg?: boolean; // true = use procedural map-style background instead of image
  revealed?: boolean;
}

interface WikiMapPage {
  id: string;
  title?: string;
  name?: string;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  pin: MapPin, skull: Skull, shield: Shield, home: Home,
  landmark: Landmark, trees: Trees, anchor: Anchor,
  flame: Flame, alert: AlertTriangle, crosshair: Crosshair,
  eye: Eye, navigation: Navigation,
};
const ICON_OPTIONS = Object.keys(ICON_MAP);
const PIN_COLORS = ["#4A7BFF","#FF6A6A","#4AFF4A","#FFAA4A","#FF4AFF","#4AFFFF","#FFD700","#FF69B4","#7B68EE","#20B2AA"];

const BUILDING_SLOT_KINDS: Record<BuildingSlotKind, { label: string; color: string }> = {
  industrial: { label: "Industrial", color: "#FF8A4A" },
  commercial: { label: "Commercial", color: "#FFD34A" },
  residential: { label: "Residential", color: "#4A9BFF" },
  civic: { label: "Civic", color: "#B58AFF" },
  storage: { label: "Storage", color: "#A88A6A" },
  utility: { label: "Utility", color: "#4AD6C8" },
  security: { label: "Security", color: "#FF5A6A" },
  medical: { label: "Medical", color: "#64D98B" },
  research: { label: "Research", color: "#6CCBFF" },
  other: { label: "Other", color: "#A0A8C0" },
};

function createDefaultBuildingShell(color = "#6A7B9B"): BuildingShell {
  return {
    points: [[10, 10], [90, 10], [90, 90], [10, 90]],
    color,
    opacity: 0.16,
    wallWidth: 6,
  };
}

const DEFAULT_OUTER_IMG = "https://images.unsplash.com/photo-1636418557948-83835508836b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwdW5kZXJncm91bmQlMjBjYXZlcm4lMjBydWlucyUyMGFlcmlhbHxlbnwxfHx8fDE3NzM4NzI0ODN8MA&ixlib=rb-4.1.0&q=80&w=1080";
const DEFAULT_OUTER_IMG2 = "https://images.unsplash.com/photo-1711211788461-34d6d7175068?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwc3RvbmUlMjBmb3J0cmVzcyUyMHdhc3RlbGFuZCUyMGFlcmlhbHxlbnwxfHx8fDE3NzM4NzI0ODN8MA&ixlib=rb-4.1.0&q=80&w=1080";

function buildDefaultZones(): MapZone[] {
  const innerZones: MapZone[] = SECTORS.map(s => ({
    id: s.id, name: `Sector ${s.number}`, subtitle: "", color: s.color, image: "",
    sectorNumber: s.number, fogMode: "visible" as FogMode, connections: [], walls: [],
    lines: [], areas: [], connectionRoutes: {}, editorVariant: "places", buildingShell: createDefaultBuildingShell(s.color), buildingSlots: [], mapType: "sector", schemaVersion: 6, useMapBg: true, pins: [],
  }));

  // Build outer subsector zones from pre-computed data
  const outerZones: MapZone[] = [];
  OUTER_SECTORS_V2.forEach((sector, si) => {
    const subData = OUTER_SECTOR_SUBS[si];
    subData.labels.forEach((sub) => {
      outerZones.push({
        id: `os-${sub.label}`,
        name: `Sector ${sub.label}`,
        subtitle: "",
        color: sector.color,
        image: "",
        sectorNumber: sector.id,
        fogMode: "visible" as FogMode,
        connections: [],
        connectionRoutes: {},
        walls: [],
        lines: [],
        areas: [],
        editorVariant: "places",
        buildingShell: createDefaultBuildingShell(sector.color),
        buildingSlots: [],
        mapType: "sector",
        schemaVersion: 6,
        useMapBg: true,
        pins: [],
      });
    });
  });

  return [...innerZones, ...outerZones];
}

const LEGACY_PLACEHOLDER_PIN_IDS = new Set([
  "council", "nexus-well", "obsidian-manor", "great-forge", "spore-fields",
  "north-gate", "pit-fights", "warden", "pale-ward",
]);
const LEGACY_PLACEHOLDER_IMAGES = new Set([
  ...SECTORS.map((sector) => sector.image),
  DEFAULT_OUTER_IMG,
  DEFAULT_OUTER_IMG2,
]);

function migratePin(pin: any): MapPin_t {
  const legacyImage = typeof pin?.image === "string" && pin.image.trim() ? [pin.image.trim()] : [];
  const compactDisplay: CompactPlaceDisplay = ["auto", "title", "abbreviation", "symbol"].includes(pin?.compactDisplay)
    ? pin.compactDisplay
    : "auto";
  return {
    id: String(pin?.id || `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(pin?.name || "Untitled Place"),
    subtitle: String(pin?.subtitle || ""),
    abbreviation: String(pin?.abbreviation || ""),
    symbol: String(pin?.symbol || ""),
    compactDisplay,
    thumbnailUrl: String(pin?.thumbnailUrl || pin?.thumbnail || ""),
    x: Number.isFinite(pin?.x) ? pin.x : 50,
    y: Number.isFinite(pin?.y) ? pin.y : 50,
    icon: String(pin?.icon || "pin"),
    color: String(pin?.color || "#4A7BFF"),
    description: String(pin?.description || ""),
    notes: String(pin?.notes || ""),
    images: Array.isArray(pin?.images) ? pin.images.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0) : legacyImage,
    width: Number.isFinite(pin?.width) ? Math.max(64, Math.min(280, pin.width)) : 124,
    height: Number.isFinite(pin?.height) ? Math.max(64, Math.min(280, pin.height)) : (Number.isFinite(pin?.width) ? Math.max(64, Math.min(280, pin.width)) : 124),
    wikiPageId: typeof pin?.wikiPageId === "string" ? pin.wikiPageId : undefined,
    placeMapId: typeof pin?.placeMapId === "string" ? pin.placeMapId : undefined,
    buildingMapId: typeof pin?.buildingMapId === "string" ? pin.buildingMapId : undefined,
    childMapId: typeof pin?.childMapId === "string" ? pin.childMapId : undefined,
  };
}

function getPlaceAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 4).map((word) => word[0]).join("").toUpperCase();
  return (words[0] || "?").slice(0, 3).toUpperCase();
}

function resolveCompactPlaceLabel(pin: MapPin_t, size: number): { kind: "title" | "abbreviation" | "symbol"; text: string } {
  const symbol = pin.symbol.trim();
  const abbreviation = pin.abbreviation.trim() || getPlaceAbbreviation(pin.name);
  if (pin.compactDisplay === "symbol" && symbol) return { kind: "symbol", text: symbol };
  if (pin.compactDisplay === "abbreviation") return { kind: "abbreviation", text: abbreviation };
  if (pin.compactDisplay === "title") return { kind: "title", text: pin.name };
  if (symbol) return { kind: "symbol", text: symbol };
  const estimatedTitleWidth = pin.name.trim().length * 6.2;
  return estimatedTitleWidth <= Math.max(30, size - 16)
    ? { kind: "title", text: pin.name }
    : { kind: "abbreviation", text: abbreviation };
}

function createPlaceThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("Choose a JPG, PNG, or WebP image."));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Choose a thumbnail source smaller than 12 MB."));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      try {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not prepare the thumbnail.");
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - sourceSize) / 2;
        const sourceY = (image.naturalHeight - sourceSize) / 2;
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/webp", 0.84));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };
    image.src = objectUrl;
  });
}

function migrateBuildingSlot(slot: any): BuildingSlot {
  const rawKind = String(slot?.kind || "other") as BuildingSlotKind;
  const kind = BUILDING_SLOT_KINDS[rawKind] ? rawKind : "other";
  return {
    id: String(slot?.id || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(slot?.name || `${BUILDING_SLOT_KINDS[kind].label} Slot`),
    x: Number.isFinite(slot?.x) ? Math.max(0, Math.min(100, slot.x)) : 50,
    y: Number.isFinite(slot?.y) ? Math.max(0, Math.min(100, slot.y)) : 50,
    width: Number.isFinite(slot?.width) ? Math.max(72, Math.min(320, slot.width)) : 132,
    height: Number.isFinite(slot?.height) ? Math.max(48, Math.min(240, slot.height)) : 76,
    kind,
    filled: Boolean(slot?.filled),
    contents: String(slot?.contents || ""),
    description: String(slot?.description || ""),
  };
}

function migrateBuildingShell(shell: any, fallbackColor: string): BuildingShell {
  const points = Array.isArray(shell?.points)
    ? shell.points
        .filter((point: any) => Array.isArray(point) && point.length >= 2)
        .map((point: any) => [Math.max(0, Math.min(100, Number(point[0]) || 0)), Math.max(0, Math.min(100, Number(point[1]) || 0))] as MapPoint)
    : [];
  const fallback = createDefaultBuildingShell(fallbackColor);
  return {
    points: points.length >= 3 ? points : fallback.points,
    color: String(shell?.color || fallback.color),
    opacity: Number.isFinite(shell?.opacity) ? Math.max(0.03, Math.min(0.75, shell.opacity)) : fallback.opacity,
    wallWidth: Number.isFinite(shell?.wallWidth) ? Math.max(1, Math.min(18, shell.wallWidth)) : fallback.wallWidth,
  };
}

function migrateZone(z: any): MapZone {
  let fogMode: FogMode = "visible";
  if (z.fogMode && (z.fogMode === "visible" || z.fogMode === "locked" || z.fogMode === "invisible")) {
    fogMode = z.fogMode;
  } else if (typeof z.revealed === "boolean") {
    fogMode = z.revealed ? "visible" : "invisible";
  }
  const legacySector = SECTORS.find((sector) => sector.id === z?.id);
  const outerLabel = typeof z?.id === "string" && z.id.startsWith(OUTER_ZONE_ID_PREFIX)
    ? z.id.slice(OUTER_ZONE_ID_PREFIX.length)
    : "";
  const previousSchemaVersion = Number(z?.schemaVersion) || 0;
  const wasPlaceholderEra = previousSchemaVersion < 4;
  const isPlaceMap = z?.mapType === "place" || Boolean(z?.parentZoneId);
  const legacyName = legacySector?.name;
  const legacySubtitle = legacySector?.subtitle;
  const name = wasPlaceholderEra && !isPlaceMap && (z?.name === legacyName || /^Sector \d+(?:\.[A-Z]+)?$/.test(String(z?.name || "")))
    ? (outerLabel ? `Sector ${outerLabel}` : `Sector ${z?.sectorNumber ?? legacySector?.number ?? 0}`)
    : String(z?.name || (outerLabel ? `Sector ${outerLabel}` : "Untitled Place"));
  const subtitle = wasPlaceholderEra && (z?.subtitle === legacySubtitle || OUTER_SECTORS_V2.some((sector) => sector.name === z?.subtitle))
    ? ""
    : String(z?.subtitle || "");
  const image = wasPlaceholderEra && LEGACY_PLACEHOLDER_IMAGES.has(z?.image) ? "" : String(z?.image || "");
  const pins = Array.isArray(z?.pins)
    ? z.pins.filter((pin: any) => !(wasPlaceholderEra && LEGACY_PLACEHOLDER_PIN_IDS.has(String(pin?.id)))).map(migratePin)
    : [];
  const lines: MapLine[] = Array.isArray(z?.lines)
    ? z.lines.filter((line: any) => line && Array.isArray(line.start) && Array.isArray(line.end)).map((line: any) => ({
        id: String(line.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        start: [Number(line.start[0]) || 0, Number(line.start[1]) || 0],
        end: [Number(line.end[0]) || 0, Number(line.end[1]) || 0],
        color: String(line.color || "#4AFFFF"),
        width: Number.isFinite(line.width) ? Math.max(1, Math.min(12, line.width)) : 3,
        opacity: Number.isFinite(line.opacity) ? Math.max(0.1, Math.min(1, line.opacity)) : 0.85,
        dashed: Boolean(line.dashed),
        curve: Number.isFinite(line.curve) ? Math.max(-50, Math.min(50, line.curve)) : 0,
      }))
    : [];
  const areas: MapArea[] = Array.isArray(z?.areas)
    ? z.areas.filter((area: any) => area && Array.isArray(area.points) && area.points.length >= 3).map((area: any) => ({
        id: String(area.id || `area-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(area.name || "Area"),
        points: area.points.map((point: any) => [Number(point?.[0]) || 0, Number(point?.[1]) || 0] as MapPoint),
        color: String(area.color || "#4A7BFF"),
        opacity: Number.isFinite(area.opacity) ? Math.max(0.05, Math.min(0.9, area.opacity)) : 0.25,
      }))
    : [];
  const editorVariant: MapEditorVariant = z?.editorVariant === "building" ? "building" : "places";
  const buildingShell = migrateBuildingShell(z?.buildingShell, String(z?.color || "#6A7B9B"));
  const buildingSlots = Array.isArray(z?.buildingSlots) ? z.buildingSlots.map(migrateBuildingSlot) : [];
  const rawConnectionRoutes = z?.connectionRoutes && typeof z.connectionRoutes === "object" ? z.connectionRoutes : {};
  const connectionRoutes: Record<string, MapPoint[]> = Object.fromEntries(Object.entries(rawConnectionRoutes).map(([key, points]) => [
    key,
    Array.isArray(points)
      ? points.slice(0, 32).filter((point: any) => Array.isArray(point) && point.length >= 2).map((point: any) => [
          Math.max(0, Math.min(100, Number(point[0]) || 0)),
          Math.max(0, Math.min(100, Number(point[1]) || 0)),
        ] as MapPoint)
      : [],
  ]));
  return {
    ...z,
    name,
    subtitle,
    image,
    pins,
    fogMode,
    connections: Array.isArray(z?.connections) ? z.connections : [],
    connectionRoutes,
    walls: Array.isArray(z?.walls) ? z.walls : [],
    lines,
    areas,
    editorVariant,
    buildingShell,
    buildingSlots,
    mapType: isPlaceMap ? "place" : "sector",
    parentZoneId: typeof z?.parentZoneId === "string" ? z.parentZoneId : undefined,
    parentPlaceId: typeof z?.parentPlaceId === "string" ? z.parentPlaceId : undefined,
    schemaVersion: 6,
    sectorNumber: z?.sectorNumber ?? 0,
    useMapBg: image ? (z?.useMapBg ?? false) : true,
  };
}

const INTELLI_MAPS_STORAGE_KEY = "inet-map-hexcity-v3";

function normalizeChildMapLinks(zones: MapZone[]): MapZone[] {
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
  const childrenByParent = new Map<string, MapZone[]>();
  zones.forEach((zone) => {
    if (!zone.parentZoneId || !zone.parentPlaceId) return;
    const key = `${zone.parentZoneId}:${zone.parentPlaceId}`;
    childrenByParent.set(key, [...(childrenByParent.get(key) || []), zone]);
  });

  return zones.map((zone) => ({
    ...zone,
    pins: zone.pins.map((pin) => {
      let placeMapId = pin.placeMapId && !zonesById.has(pin.placeMapId) ? pin.placeMapId : undefined;
      let buildingMapId = pin.buildingMapId && !zonesById.has(pin.buildingMapId) ? pin.buildingMapId : undefined;
      const candidates = [...(childrenByParent.get(`${zone.id}:${pin.id}`) || [])];
      [pin.placeMapId, pin.buildingMapId, pin.childMapId].forEach((mapId) => {
        if (!mapId) return;
        const child = zonesById.get(mapId);
        if (child && !candidates.some((candidate) => candidate.id === child.id)) candidates.push(child);
        else if (!child && mapId === pin.childMapId && !placeMapId) placeMapId = mapId;
      });
      candidates.forEach((child) => {
        if (child.editorVariant === "building") buildingMapId ||= child.id;
        else placeMapId ||= child.id;
      });
      const { childMapId: _legacyChildMapId, ...currentPin } = pin;
      return { ...currentPin, placeMapId, buildingMapId };
    }),
  }));
}

function loadLocalZones(): MapZone[] {
  const saved = safeGetJson<any[]>(INTELLI_MAPS_STORAGE_KEY, []);
  if (saved.length === 0) return buildDefaultZones();
  const defaults = buildDefaultZones();
  const migrated = saved.map(migrateZone);
  const existingIds = new Set(migrated.map((zone) => zone.id));
  const missing = defaults.filter((zone) => !existingIds.has(zone.id));
  return normalizeChildMapLinks(missing.length > 0 ? [...migrated, ...missing] : migrated);
}

function normalizeZones(raw: unknown): MapZone[] {
  if (!Array.isArray(raw)) return loadLocalZones();
  const defaults = buildDefaultZones();
  const migrated = raw.map(migrateZone);
  const existingIds = new Set(migrated.map((zone) => zone.id));
  const missing = defaults.filter((zone) => !existingIds.has(zone.id));
  return normalizeChildMapLinks(missing.length > 0 ? [...migrated, ...missing] : migrated);
}

const OUTER_ZONE_ID_PREFIX = "os-";

function parseOuterSubLabel(value: string): { sectorNumber: number; subLetter: string } | null {
  const match = value.match(/(\d+)\.([A-Z]+)/i);
  if (!match) return null;
  return {
    sectorNumber: parseInt(match[1], 10),
    subLetter: match[2].toUpperCase(),
  };
}

function getOuterSubLabelFromZone(zone: MapZone): string {
  if (!zone.id.startsWith(OUTER_ZONE_ID_PREFIX)) return "";
  return zone.id.slice(OUTER_ZONE_ID_PREFIX.length);
}

function compareOuterZones(a: MapZone, b: MapZone): number {
  const aParsed = parseOuterSubLabel(getOuterSubLabelFromZone(a));
  const bParsed = parseOuterSubLabel(getOuterSubLabelFromZone(b));
  if (!aParsed || !bParsed) return a.name.localeCompare(b.name);
  if (aParsed.sectorNumber !== bParsed.sectorNumber) {
    return aParsed.sectorNumber - bParsed.sectorNumber;
  }
  return aParsed.subLetter.localeCompare(bParsed.subLetter);
}

function getSectorLabel(zone: MapZone): string {
  const outerLabel = getOuterSubLabelFromZone(zone);
  return outerLabel ? `Sector ${outerLabel}` : `Sector ${zone.sectorNumber}`;
}

function getMapTitle(zone: MapZone): string {
  return zone.mapType === "place" ? `${zone.name || "Untitled Place"} Map` : `${getSectorLabel(zone)} Map`;
}

/* ==============================================================
   COMPONENT
   ============================================================== */

export function IntelliMaps() {
  const navigate = useNavigate();
  const [currentUser] = useState<string>(() => safeGetItem("inet-user") || "Agent Phoenix");
  const [zones, setZones] = useState<MapZone[]>(loadLocalZones);
  const historyUndoRef = useRef<MapZone[][]>([]);
  const historyRedoRef = useRef<MapZone[][]>([]);
  const historyPresentRef = useRef<MapZone[]>(zones);
  const pendingHistoryRef = useRef<MapZone[] | null>(null);
  const historyTimerRef = useRef<number | null>(null);
  const historyApplyingRef = useRef(false);
  const historyResetPendingRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPin, setEditingPin] = useState<MapPin_t | null>(null);
  const [isNewPin, setIsNewPin] = useState(false);
  const [zoomTransition, setZoomTransition] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [hoveredOuterSub, setHoveredOuterSub] = useState<string | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const [linePoints, setLinePoints] = useState<MapPoint[]>([]);
  const [areaMode, setAreaMode] = useState(false);
  const [shellMode, setShellMode] = useState(false);
  const [areaPoints, setAreaPoints] = useState<MapPoint[]>([]);
  const [shellPoints, setShellPoints] = useState<MapPoint[]>([]);
  const [pointConnectMode, setPointConnectMode] = useState(false);
  const [pointConnectSource, setPointConnectSource] = useState<DraftPointTarget | null>(null);
  const [pointConnectError, setPointConnectError] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState("#4A7BFF");
  const [drawOpacity, setDrawOpacity] = useState(0.3);
  const [lineWidth, setLineWidth] = useState(3);
  const [lineDashed, setLineDashed] = useState(false);
  const [lineCurve, setLineCurve] = useState(0);
  const [placeImageDraft, setPlaceImageDraft] = useState("");
  const [placeThumbnailBusy, setPlaceThumbnailBusy] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<BuildingSlot | null>(null);
  const [isNewSlot, setIsNewSlot] = useState(false);
  const [wikiPages, setWikiPages] = useState<WikiMapPage[]>([]);
  const [activeGateId, setActiveGateId] = useState<string | null>(null);
  const [hoveredGate, setHoveredGate] = useState<string | null>(null);
  const [showFog, setShowFog] = useState(true);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [showPaths, setShowPaths] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const isDM = currentUser === "DM";
  const activeZone = zones.find(z => z.id === activeZoneId) || null;
  const activeGate = GATES.find(g => g.id === activeGateId) || null;
  const selectedPin = activeZone?.pins.find(p => p.id === selectedPinId) || null;
  const selectedPlaceMapExists = Boolean(selectedPin?.placeMapId && zones.some((zone) => zone.id === selectedPin.placeMapId));
  const selectedBuildingMapExists = Boolean(selectedPin?.buildingMapId && zones.some((zone) => zone.id === selectedPin.buildingMapId));
  const selectedSlot = activeZone?.buildingSlots.find((slot) => slot.id === selectedSlotId) || null;
  const parentZone = activeZone?.parentZoneId ? zones.find((zone) => zone.id === activeZone.parentZoneId) || null : null;

  const [mapZoom, setMapZoom] = useState(2);
  const [mapPan, setMapPan] = useState<[number, number]>([0, 0]);
  const [hasInitializedPan, setHasInitializedPan] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [draggingDraftPoint, setDraggingDraftPoint] = useState<DraftPointTarget | null>(null);
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null);
  const [draggingConnectionPoint, setDraggingConnectionPoint] = useState<{ routeKey: string; index: number } | null>(null);
  const panStart = useRef<[number, number]>([0, 0]);
  const panOrigin = useRef<[number, number]>([0, 0]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const DRAG_THRESHOLD = 4;
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    setSelectedConnectionKey(null);
    setDraggingConnectionPoint(null);
  }, [activeZoneId]);

  useEffect(() => {
    if (isEditMode) return;
    setSelectedConnectionKey(null);
    setDraggingConnectionPoint(null);
  }, [isEditMode]);

  useEffect(() => {
    if (!selectedConnectionKey || !activeZone) return;
    const stillExists = activeZone.connections.some(([aId, bId]) => getConnectionRouteKey(aId, bId) === selectedConnectionKey);
    if (!stillExists) setSelectedConnectionKey(null);
  }, [activeZone, selectedConnectionKey]);

  const MIN_ZOOM = 0.8;
  const MAX_ZOOM = 6;

  const commitPendingHistory = useCallback(() => {
    if (historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    const pending = pendingHistoryRef.current;
    if (!pending || pending === historyPresentRef.current) return;
    historyUndoRef.current.push(historyPresentRef.current);
    if (historyUndoRef.current.length > 60) historyUndoRef.current.shift();
    historyPresentRef.current = pending;
    pendingHistoryRef.current = null;
    historyRedoRef.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const undoZones = useCallback(() => {
    commitPendingHistory();
    const previous = historyUndoRef.current.pop();
    if (!previous) return;
    historyRedoRef.current.push(historyPresentRef.current);
    historyPresentRef.current = previous;
    pendingHistoryRef.current = null;
    historyApplyingRef.current = true;
    setZones(previous);
    setHistoryVersion((version) => version + 1);
  }, [commitPendingHistory]);

  const redoZones = useCallback(() => {
    commitPendingHistory();
    const next = historyRedoRef.current.pop();
    if (!next) return;
    historyUndoRef.current.push(historyPresentRef.current);
    historyPresentRef.current = next;
    pendingHistoryRef.current = null;
    historyApplyingRef.current = true;
    setZones(next);
    setHistoryVersion((version) => version + 1);
  }, [commitPendingHistory]);

  const canUndo = historyUndoRef.current.length > 0 || pendingHistoryRef.current !== null;
  const canRedo = historyRedoRef.current.length > 0;
  void historyVersion;

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setMapZoom(prev => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * delta));
      const scale = next / prev;
      setMapPan(([px, py]) => [
        cursorX - scale * (cursorX - px),
        cursorY - scale * (cursorY - py),
      ]);
      return next;
    });
  }, []);

  const handlePanStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (activeZone && isEditMode && isDM) return;
    setIsPanning(true);
    setIsDragging(false);
    panStart.current = [e.clientX, e.clientY];
    panOrigin.current = mapPan;
  }, [mapPan, activeZone, isEditMode, isDM]);

  const handlePanMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingConnectionPoint && activeZoneId) {
      const el = mapContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const point: MapPoint = [
        Math.max(0, Math.min(100, ((e.clientX - rect.left - mapPan[0]) / mapZoom / rect.width) * 100)),
        Math.max(0, Math.min(100, ((e.clientY - rect.top - mapPan[1]) / mapZoom / rect.height) * 100)),
      ];
      setZones((prev) => prev.map((zone) => zone.id !== activeZoneId ? zone : {
        ...zone,
        connectionRoutes: {
          ...zone.connectionRoutes,
          [draggingConnectionPoint.routeKey]: (zone.connectionRoutes[draggingConnectionPoint.routeKey] || []).map((current, index) => index === draggingConnectionPoint.index ? point : current),
        },
      }));
      setIsDragging(true);
      return;
    }
    if (draggingDraftPoint) {
      const el = mapContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const point: MapPoint = [
        Math.max(0, Math.min(100, ((e.clientX - rect.left - mapPan[0]) / mapZoom / rect.width) * 100)),
        Math.max(0, Math.min(100, ((e.clientY - rect.top - mapPan[1]) / mapZoom / rect.height) * 100)),
      ];
      const movePoint = (points: MapPoint[]) => points.map((current, index) => index === draggingDraftPoint.index ? point : current);
      if (draggingDraftPoint.kind === "line") setLinePoints(movePoint);
      else if (draggingDraftPoint.kind === "area") setAreaPoints(movePoint);
      else setShellPoints(movePoint);
      setIsDragging(true);
      return;
    }
    if ((draggingPinId || draggingSlotId) && activeZoneId) {
      const el = mapContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left - mapPan[0]) / mapZoom / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top - mapPan[1]) / mapZoom / rect.height) * 100));
      setIsDragging(true);
      setZones((prev) => prev.map((zone) => {
        if (zone.id !== activeZoneId) return zone;
        if (draggingSlotId) {
          return { ...zone, buildingSlots: zone.buildingSlots.map((slot) => slot.id === draggingSlotId ? { ...slot, x, y } : slot) };
        }
        return { ...zone, pins: zone.pins.map((pin) => pin.id === draggingPinId ? { ...pin, x, y } : pin) };
      }));
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - panStart.current[0];
    const dy = e.clientY - panStart.current[1];
    if (!isDragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    setIsDragging(true);
    const el = mapContainerRef.current;
    const cw = el?.clientWidth ?? 800;
    const ch = el?.clientHeight ?? 600;
    const mapW = 5000 * mapZoom;
    const mapH = 5000 * mapZoom;
    const panOvershoot = Math.min(cw, ch) * 0.1;
    const nx = Math.min(panOvershoot, Math.max(cw - mapW - panOvershoot, panOrigin.current[0] + dx));
    const ny = Math.min(panOvershoot, Math.max(ch - mapH - panOvershoot, panOrigin.current[1] + dy));
    setMapPan([nx, ny]);
  }, [activeZoneId, draggingConnectionPoint, draggingDraftPoint, draggingPinId, draggingSlotId, isPanning, isDragging, mapPan, mapZoom]);

  const handlePanEnd = useCallback(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
      requestAnimationFrame(() => { wasDraggingRef.current = false; });
    }
    setDraggingPinId(null);
    setDraggingSlotId(null);
    setDraggingDraftPoint(null);
    setDraggingConnectionPoint(null);
    setIsPanning(false);
    setIsDragging(false);
  }, [isDragging]);

  const resetZoom = useCallback(() => {
    if (activeZoneId || activeGateId) {
      setMapZoom(1);
      setMapPan([0, 0]);
      return;
    }
    const el = mapContainerRef.current;
    if (el) {
      const cw = el.clientWidth, ch = el.clientHeight;
      setMapZoom(2);
      setMapPan([cw / 2 * (1 - 2), ch / 2 * (1 - 2) - 50]);
    } else {
      setMapZoom(2);
      setMapPan([0, 0]);
    }
  }, [activeZoneId, activeGateId]);

  // Center camera on Sector 0 on initial mount
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (hasInitializedPan) return;
    const el = mapContainerRef.current;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (cw > 0 && ch > 0) {
      setMapPan([cw / 2 * (1 - 2), ch / 2 * (1 - 2) - 50]);
      setHasInitializedPan(true);
      requestAnimationFrame(() => { requestAnimationFrame(() => setMapReady(true)); });
    }
  });

  const [mapsLoading, setMapsLoading] = useState(true);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const hasLoadedMapsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMapsState() {
      try {
        setMapsLoading(true);
        setMapsError(null);
        const remoteZones = await appStore.loadIntelliMapsState<MapZone[]>(loadLocalZones());
        if (!cancelled) {
          historyResetPendingRef.current = true;
          setZones(normalizeZones(remoteZones));
          hasLoadedMapsRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setMapsError(err instanceof Error ? err.message : "Failed to load Intelli Maps state");
          historyResetPendingRef.current = true;
          setZones(loadLocalZones());
          hasLoadedMapsRef.current = true;
        }
      } finally {
        if (!cancelled) {
          setMapsLoading(false);
        }
      }
    }

    loadMapsState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedMapsRef.current) {
      historyPresentRef.current = zones;
      return;
    }
    if (historyResetPendingRef.current) {
      if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
      historyUndoRef.current = [];
      historyRedoRef.current = [];
      historyPresentRef.current = zones;
      pendingHistoryRef.current = null;
      historyApplyingRef.current = false;
      historyResetPendingRef.current = false;
      setHistoryVersion((version) => version + 1);
      return;
    }
    if (historyApplyingRef.current) {
      historyApplyingRef.current = false;
      historyPresentRef.current = zones;
      return;
    }

    pendingHistoryRef.current = zones;
    if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current);
    historyTimerRef.current = window.setTimeout(commitPendingHistory, 240);
    setHistoryVersion((version) => version + 1);
    return () => {
      if (historyTimerRef.current !== null) {
        window.clearTimeout(historyTimerRef.current);
        historyTimerRef.current = null;
      }
    };
  }, [commitPendingHistory, zones]);

  useEffect(() => {
    if (!isDM || !isEditMode) return;
    const handleHistoryKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoZones();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoZones();
      }
    };
    window.addEventListener("keydown", handleHistoryKeyDown);
    return () => window.removeEventListener("keydown", handleHistoryKeyDown);
  }, [isDM, isEditMode, redoZones, undoZones]);

  useEffect(() => {
    let cancelled = false;
    appStore.listSites<WikiMapPage>()
      .then((pages) => {
        if (!cancelled) {
          setWikiPages([...pages].sort((a, b) => String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""))));
        }
      })
      .catch((err) => console.warn("Failed to load wiki pages for Intelli Maps", err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hasLoadedMapsRef.current || !isDM) return;
    const timeout = window.setTimeout(() => {
      safeSetJson(INTELLI_MAPS_STORAGE_KEY, zones);
      appStore.saveIntelliMapsState<MapZone[]>(zones).catch((err) => {
        console.warn("Failed to save Intelli Maps state", err);
        setMapsError(err instanceof Error ? err.message : "Failed to save Intelli Maps state");
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [isDM, zones]);

  const OUTER_BOUNDS = [270, 306, 342, 378, 414, 450, 486, 522, 558, 594];
  const OUTER_COUNT = OUTER_BOUNDS.length;

  const sectorGeo = useMemo(() => {
    const geo: Record<string, { poly: [number, number][]; center: [number, number] }> = {};
    const s0poly = buildS0(24);
    geo["s0"] = { poly: s0poly, center: [CX, CY] };

    const cardinals = [270, 0, 90, 180];
    for (let i = 0; i < 4; i++) {
      const p = buildInnerWedge(cardinals[i]);
      geo[`s${i + 1}`] = { poly: p, center: centroid(p) };
    }

    for (let i = 0; i < OUTER_COUNT; i++) {
      const a0 = OUTER_BOUNDS[i];
      const a1 = i < OUTER_COUNT - 1 ? OUTER_BOUNDS[i + 1] : OUTER_BOUNDS[0] + 360;
      const p = buildOuterSectorArc(a0, a1);
      geo[`s${i + 5}`] = { poly: p, center: centroid(p) };
    }
    return geo;
  }, []);

  const handleSectorClick = useCallback((sectorId: string) => {
    if (wasDraggingRef.current) return;
    const zone = zones.find(z => z.id === sectorId);
    if (!zone) return;
    if (!isDM && showFog) {
      if (zone.fogMode === "invisible" || zone.fogMode === "locked") return;
    }
    setZoomTransition(true);
    setTimeout(() => {
      setActiveZoneId(sectorId);
      setActiveGateId(null);
      setSelectedPinId(null); setEditingPin(null); setIsNewPin(false); setSelectedSlotId(null); setEditingSlot(null); setIsNewSlot(false);
      setLinkMode(false); setLinkSource(null); setWallMode(false); setLinePoints([]);
      setAreaMode(false); setShellMode(false); setAreaPoints([]); setShellPoints([]); setPointConnectMode(false); setPointConnectSource(null); setPlaceImageDraft("");
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, [zones, isDM, showFog]);

  const handleGateClick = useCallback((gateId: string) => {
    setZoomTransition(true);
    setTimeout(() => {
      setActiveGateId(gateId);
      setActiveZoneId(null);
      setSelectedPinId(null); setEditingPin(null); setIsNewPin(false); setSelectedSlotId(null); setEditingSlot(null); setIsNewSlot(false);
      setLinkMode(false); setLinkSource(null); setWallMode(false); setLinePoints([]);
      setAreaMode(false); setShellMode(false); setAreaPoints([]); setShellPoints([]); setPointConnectMode(false); setPointConnectSource(null); setPlaceImageDraft("");
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, []);

  const handleBackToWorld = useCallback(() => {
    setZoomTransition(true);
    setTimeout(() => {
      setActiveZoneId(activeZone?.parentZoneId || null); setActiveGateId(null); setSelectedPinId(null); setEditingPin(null); setSelectedSlotId(null); setEditingSlot(null);
      setIsNewPin(false); setIsNewSlot(false); setLinkMode(false); setLinkSource(null); setWallMode(false); setLinePoints([]);
      setAreaMode(false); setShellMode(false); setAreaPoints([]); setShellPoints([]); setPointConnectMode(false); setPointConnectSource(null); setPlaceImageDraft("");
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, [activeZone?.parentZoneId]);

  const openNestedMap = useCallback((zoneId: string) => {
    setZoomTransition(true);
    setTimeout(() => {
      setActiveZoneId(zoneId);
      setActiveGateId(null);
      setSelectedPinId(null); setEditingPin(null); setIsNewPin(false); setSelectedSlotId(null); setEditingSlot(null); setIsNewSlot(false);
      setLinkMode(false); setLinkSource(null); setWallMode(false); setLinePoints([]);
      setAreaMode(false); setShellMode(false); setAreaPoints([]); setShellPoints([]); setPointConnectMode(false); setPointConnectSource(null); setPlaceImageDraft("");
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 220);
  }, []);

  const handlePinClickForLink = useCallback((pinId: string) => {
    if (!linkMode || !activeZoneId) return;
    if (!linkSource) { setLinkSource(pinId); return; }
    if (linkSource === pinId) { setLinkSource(null); return; }
    const routeKey = getConnectionRouteKey(linkSource, pinId);
    setZones(prev => prev.map(z => {
      if (z.id !== activeZoneId) return z;
      const exists = z.connections.some(([a, b]) => (a === linkSource && b === pinId) || (a === pinId && b === linkSource));
      if (exists) {
        const connectionRoutes = { ...z.connectionRoutes };
        delete connectionRoutes[routeKey];
        return {
          ...z,
          connections: z.connections.filter(([a, b]) => !((a === linkSource && b === pinId) || (a === pinId && b === linkSource))),
          connectionRoutes,
        };
      }
      return { ...z, connections: [...z.connections, [linkSource!, pinId] as [string, string]] };
    }));
    setSelectedConnectionKey((current) => current === routeKey ? null : current);
    setLinkSource(null);
  }, [linkMode, linkSource, activeZoneId]);

  const savePin = useCallback(() => {
    if (!editingPin || !activeZoneId) return;
    const linkedMapIds = new Set([editingPin.placeMapId, editingPin.buildingMapId, editingPin.childMapId].filter((value): value is string => Boolean(value)));
    setZones(prev => prev.map(z => {
      if (linkedMapIds.has(z.id)) {
        return { ...z, name: editingPin.name || "Untitled Place" };
      }
      if (z.id !== activeZoneId) return z;
      const existing = z.pins.find(p => p.id === editingPin.id);
      if (existing) return { ...z, pins: z.pins.map(p => p.id === editingPin.id ? editingPin : p) };
      return { ...z, pins: [...z.pins, editingPin] };
    }));
    setEditingPin(null); setIsNewPin(false); setSelectedPinId(editingPin.id); setPlaceImageDraft("");
  }, [editingPin, activeZoneId]);

  const createOrOpenPlaceMap = useCallback((pin: MapPin_t, editorVariant: MapEditorVariant = "places") => {
    if (!activeZone) return;
    const existingMapId = editorVariant === "building" ? pin.buildingMapId : pin.placeMapId;
    if (existingMapId && zones.some((zone) => zone.id === existingMapId)) {
      openNestedMap(existingMapId);
      return;
    }
    const childMapId = `place-map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const childMap: MapZone = {
      id: childMapId,
      name: pin.name || "Untitled Place",
      subtitle: "",
      color: pin.color,
      image: "",
      pins: [],
      fogMode: "visible",
      connections: [],
      connectionRoutes: {},
      sectorNumber: activeZone.sectorNumber,
      walls: [],
      lines: [],
      areas: [],
      editorVariant,
      buildingShell: createDefaultBuildingShell(pin.color),
      buildingSlots: [],
      mapType: "place",
      parentZoneId: activeZone.id,
      parentPlaceId: pin.id,
      schemaVersion: 6,
      useMapBg: true,
    };
    setZones((prev) => [
      ...prev.map((zone) => zone.id === activeZone.id
        ? { ...zone, pins: zone.pins.map((place) => place.id === pin.id ? { ...place, [editorVariant === "building" ? "buildingMapId" : "placeMapId"]: childMapId } : place) }
        : zone),
      childMap,
    ]);
    setSelectedPinId(null);
    setTimeout(() => openNestedMap(childMapId), 0);
  }, [activeZone, openNestedMap, zones]);

  const setActiveEditorVariant = useCallback((editorVariant: MapEditorVariant) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => {
      if (zone.id === activeZoneId) return { ...zone, editorVariant };
      if (zone.id !== activeZone?.parentZoneId || !activeZone.parentPlaceId) return zone;
      return {
        ...zone,
        pins: zone.pins.map((pin) => pin.id !== activeZone.parentPlaceId ? pin : editorVariant === "building"
          ? { ...pin, buildingMapId: activeZoneId, placeMapId: pin.placeMapId === activeZoneId ? undefined : pin.placeMapId }
          : { ...pin, placeMapId: activeZoneId, buildingMapId: pin.buildingMapId === activeZoneId ? undefined : pin.buildingMapId }),
      };
    }));
    setSelectedPinId(null); setEditingPin(null); setIsNewPin(false);
    setSelectedSlotId(null); setEditingSlot(null); setIsNewSlot(false);
    setLinkMode(false); setLinkSource(null); setWallMode(false); setLinePoints([]);
    setAreaMode(false); setShellMode(false); setAreaPoints([]); setShellPoints([]); setPointConnectMode(false); setPointConnectSource(null);
  }, [activeZone?.parentPlaceId, activeZone?.parentZoneId, activeZoneId]);

  const saveBuildingSlot = useCallback(() => {
    if (!editingSlot || !activeZoneId) return;
    setZones((prev) => prev.map((zone) => {
      if (zone.id !== activeZoneId) return zone;
      const exists = zone.buildingSlots.some((slot) => slot.id === editingSlot.id);
      return {
        ...zone,
        buildingSlots: exists
          ? zone.buildingSlots.map((slot) => slot.id === editingSlot.id ? editingSlot : slot)
          : [...zone.buildingSlots, editingSlot],
      };
    }));
    setEditingSlot(null); setIsNewSlot(false); setSelectedSlotId(editingSlot.id);
  }, [activeZoneId, editingSlot]);

  const deleteBuildingSlot = useCallback((slotId: string) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, buildingSlots: zone.buildingSlots.filter((slot) => slot.id !== slotId) } : zone));
    if (selectedSlotId === slotId) setSelectedSlotId(null);
    if (editingSlot?.id === slotId) { setEditingSlot(null); setIsNewSlot(false); }
  }, [activeZoneId, editingSlot?.id, selectedSlotId]);

  const deletePin = useCallback((pinId: string) => {
    if (!activeZoneId) return;
    setZones(prev => prev.map(z => {
      if (z.id !== activeZoneId) return z;
      const connections = z.connections.filter(([a, b]) => a !== pinId && b !== pinId);
      const remainingRouteKeys = new Set(connections.map(([a, b]) => getConnectionRouteKey(a, b)));
      const connectionRoutes = Object.fromEntries(
        Object.entries(z.connectionRoutes).filter(([routeKey]) => remainingRouteKeys.has(routeKey)),
      );
      return { ...z, pins: z.pins.filter(p => p.id !== pinId), connections, connectionRoutes };
    }));
    if (selectedPinId === pinId) setSelectedPinId(null);
    setSelectedConnectionKey(null);
  }, [activeZoneId, selectedPinId]);

  const cycleFogMode = useCallback((zoneId: string) => {
    setZones(prev => prev.map(z => {
      if (z.id !== zoneId) return z;
      const idx = FOG_CYCLE.indexOf(z.fogMode);
      const next = FOG_CYCLE[(idx + 1) % FOG_CYCLE.length];
      return { ...z, fogMode: next };
    }));
  }, []);

  const renderIcon = (iconKey: string, size: number, color: string) => {
    const Ico = ICON_MAP[iconKey] || MapPin;
    return <Ico size={size} style={{ color }} />;
  };

  const addConnectionRoutePoint = useCallback((event: React.MouseEvent<SVGPolylineElement>, aId: string, bId: string) => {
    event.stopPropagation();
    if (!isDM || !isEditMode || linkMode || wallMode || areaMode || shellMode || pointConnectMode || !activeZoneId) return;
    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const point: MapPoint = [
      Math.max(0, Math.min(100, ((event.clientX - rect.left - mapPan[0]) / mapZoom / rect.width) * 100)),
      Math.max(0, Math.min(100, ((event.clientY - rect.top - mapPan[1]) / mapZoom / rect.height) * 100)),
    ];
    const routeKey = getConnectionRouteKey(aId, bId);
    setZones((prev) => prev.map((zone) => {
      if (zone.id !== activeZoneId) return zone;
      const pinA = zone.pins.find((pin) => pin.id === aId);
      const pinB = zone.pins.find((pin) => pin.id === bId);
      if (!pinA || !pinB) return zone;
      const route = [...(zone.connectionRoutes[routeKey] || [])];
      if (route.length >= 32) return zone;
      const fullPath: MapPoint[] = [[pinA.x, pinA.y], ...route, [pinB.x, pinB.y]];
      route.splice(getRouteInsertIndex(fullPath, point), 0, point);
      return { ...zone, connectionRoutes: { ...zone.connectionRoutes, [routeKey]: route } };
    }));
    setSelectedConnectionKey(routeKey);
    setSelectedPinId(null);
  }, [activeZoneId, areaMode, isDM, isEditMode, linkMode, mapPan, mapZoom, pointConnectMode, shellMode, wallMode]);

  const removeConnectionRoutePoint = useCallback((routeKey: string, pointIndex: number) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id !== activeZoneId ? zone : {
      ...zone,
      connectionRoutes: {
        ...zone.connectionRoutes,
        [routeKey]: (zone.connectionRoutes[routeKey] || []).filter((_, index) => index !== pointIndex),
      },
    }));
  }, [activeZoneId]);

  const clearConnectionRoute = useCallback((routeKey: string) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id !== activeZoneId ? zone : {
      ...zone,
      connectionRoutes: { ...zone.connectionRoutes, [routeKey]: [] },
    }));
  }, [activeZoneId]);

  const renderConnectionLines = (zone: MapZone) => {
    if (!showPaths || zone.connections.length === 0) return null;
    const canEditRoutes = isDM && isEditMode && !linkMode && !wallMode && !areaMode && !shellMode && !pointConnectMode;
    return (
      <>
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5]" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <filter id="pathGlow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {zone.connections.map(([aId, bId], idx) => {
            const pinA = zone.pins.find(p => p.id === aId);
            const pinB = zone.pins.find(p => p.id === bId);
            if (!pinA || !pinB) return null;
            const routeKey = getConnectionRouteKey(aId, bId);
            const route = zone.connectionRoutes[routeKey] || [];
            const points = [[pinA.x, pinA.y] as MapPoint, ...route, [pinB.x, pinB.y] as MapPoint].map(([x, y]) => `${x},${y}`).join(" ");
            const isSelected = selectedConnectionKey === routeKey;
            return (
              <g key={`${aId}-${bId}-${idx}`} filter="url(#pathGlow)">
                <polyline points={points} fill="none" stroke={isSelected ? "#FFFFFF" : zone.color} strokeWidth={isSelected ? 2.2 : 1.5} strokeDasharray="6 4" strokeOpacity={isSelected ? 0.9 : 0.5} vectorEffect="non-scaling-stroke" />
                <polyline points={points} fill="none" stroke={zone.color} strokeWidth="0.7" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />
                {canEditRoutes && <polyline points={points} fill="none" stroke="transparent" strokeWidth="16" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke", cursor: "crosshair" }} onClick={(event) => addConnectionRoutePoint(event, aId, bId)} />}
              </g>
            );
          })}
        </svg>
        {canEditRoutes && selectedConnectionKey && (zone.connectionRoutes[selectedConnectionKey] || []).map(([x, y], index) => (
          <button
            key={`${selectedConnectionKey}-route-point-${index}`}
            className="absolute z-[8] w-3.5 h-3.5 -ml-[7px] -mt-[7px]"
            style={{ left: `${x}%`, top: `${y}%`, borderRadius: "50%", background: "#071021", border: "2px solid #FFFFFF", boxShadow: `0 0 9px ${zone.color}`, cursor: "move" }}
            onMouseDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); setDraggingConnectionPoint({ routeKey: selectedConnectionKey, index }); }}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => { event.stopPropagation(); removeConnectionRoutePoint(selectedConnectionKey, index); }}
            title={`Drag bend ${index + 1}; double-click to remove`}
          />
        ))}
      </>
    );
  };

  const renderBuildingShell = (zone: MapZone) => {
    if (zone.editorVariant !== "building" || zone.buildingShell.points.length < 3) return null;
    const shell = zone.buildingShell;
    const points = shell.points.map(([x, y]) => `${x},${y}`).join(" ");
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id={`building-floor-${zone.id}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 0 4 L 4 0" stroke={shell.color} strokeWidth="0.18" strokeOpacity="0.22" />
          </pattern>
        </defs>
        <polygon points={points} fill={shell.color} fillOpacity={shell.opacity} stroke={shell.color} strokeWidth={shell.wallWidth} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polygon points={points} fill={`url(#building-floor-${zone.id})`} stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  const renderAreas = (zone: MapZone) => {
    if (zone.areas.length === 0) return null;
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[3]" viewBox="0 0 100 100" preserveAspectRatio="none">
        {zone.areas.map((area) => {
          const points = area.points.map(([x, y]) => `${x},${y}`).join(" ");
          const centerX = area.points.reduce((sum, [x]) => sum + x, 0) / area.points.length;
          const centerY = area.points.reduce((sum, [, y]) => sum + y, 0) / area.points.length;
          return (
            <g key={area.id}>
              <polygon points={points} fill={area.color} fillOpacity={area.opacity} stroke={area.color} strokeOpacity={Math.min(1, area.opacity + 0.45)} strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
              {area.name && <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF" fillOpacity="0.78" fontSize="2.2" fontFamily="'Tahoma', sans-serif" style={{ paintOrder: "stroke", stroke: "#060618", strokeWidth: 0.8 }}>{area.name}</text>}
            </g>
          );
        })}
      </svg>
    );
  };

  const renderMapLines = (zone: MapZone) => {
    if (zone.lines.length === 0) return null;
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[7]" viewBox="0 0 100 100" preserveAspectRatio="none">
        {zone.lines.map((line) => (
          <path
            key={line.id}
            d={getLinePath(line.start, line.end, line.curve)}
            fill="none"
            stroke={line.color}
            strokeWidth={line.width}
            strokeOpacity={line.opacity}
            strokeDasharray={line.dashed ? "8 5" : undefined}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    );
  };

  const renderWalls = (zone: MapZone) => {
    if (!zone.walls || zone.walls.length === 0) return null;
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[6]">
        <defs>
          <pattern id="subWallBrick" patternUnits="userSpaceOnUse" width="12" height="6">
            <rect width="12" height="6" fill="#4A4A5A" />
            <rect x="0.5" y="0.5" width="10" height="2" fill="#5A5A6B" stroke="#6A6A7B" strokeWidth="0.3" rx="0.3" />
            <rect x="0.5" y="3" width="4" height="2" fill="#555565" stroke="#6A6A7B" strokeWidth="0.3" rx="0.3" />
            <rect x="5.5" y="3" width="6" height="2" fill="#585868" stroke="#6A6A7B" strokeWidth="0.3" rx="0.3" />
          </pattern>
        </defs>
        {zone.walls.map(([x1, y1, x2, y2], idx) => (
          <g key={`wall-${idx}`}>
            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#2A2A3A" strokeWidth="8" strokeOpacity="0.6" strokeLinecap="round" />
            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="url(#subWallBrick)" strokeWidth="6" strokeLinecap="butt" />
            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#7A7A8B" strokeWidth="0.5" strokeOpacity="0.6" strokeLinecap="round" />
            <line x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`} stroke="#3A3A4B" strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" style={{ filter: "blur(2px)" }} />
          </g>
        ))}
      </svg>
    );
  };

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDM || !isEditMode || !activeZone) return;
    if (isPanning) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (shellMode) {
      setShellPoints((points) => [...points, [x, y]]);
      return;
    }

    if (areaMode) {
      setAreaPoints((points) => [...points, [x, y]]);
      return;
    }

    if (wallMode) {
      setLinePoints((points) => [...points, [x, y]]);
      return;
    }

    if (linkMode || pointConnectMode) return;

    if (activeZone.editorVariant === "building") {
      const kind: BuildingSlotKind = "industrial";
      setEditingSlot({
        id: `slot-${Date.now()}`,
        name: `${BUILDING_SLOT_KINDS[kind].label} Slot`,
        x,
        y,
        width: 132,
        height: 76,
        kind,
        filled: false,
        contents: "",
        description: "",
      });
      setIsNewSlot(true);
      setSelectedSlotId(null);
      return;
    }

    setEditingPin({ id: `place-${Date.now()}`, name: "Untitled Place", subtitle: "", abbreviation: "", symbol: "", compactDisplay: "auto", thumbnailUrl: "", x, y, icon: "pin", color: "#4A7BFF", description: "", notes: "", images: [], width: 124, height: 124 });
    setPlaceImageDraft("");
    setIsNewPin(true);
  }, [isDM, isEditMode, activeZone, linkMode, pointConnectMode, isPanning, shellMode, areaMode, wallMode]);

  const finishLine = useCallback(() => {
    if (!activeZoneId || linePoints.length < 2) return;
    const timestamp = Date.now();
    const newLines: MapLine[] = linePoints.slice(1).map((point, index) => ({
      id: `line-${timestamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      start: linePoints[index],
      end: point,
      color: drawColor,
      width: lineWidth,
      opacity: Math.max(0.1, drawOpacity),
      dashed: lineDashed,
      curve: lineCurve,
    })).filter((line) => Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1]) > 0.01);
    if (newLines.length > 0) {
      setZones((previous) => previous.map((zone) => zone.id === activeZoneId ? { ...zone, lines: [...zone.lines, ...newLines] } : zone));
    }
    setLinePoints([]);
    setWallMode(false);
    setPointConnectSource(null);
  }, [activeZoneId, drawColor, drawOpacity, lineCurve, lineDashed, linePoints, lineWidth]);

  const finishArea = useCallback(() => {
    if (!activeZoneId || areaPoints.length < 3) return;
    const newArea: MapArea = {
      id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `Area ${activeZone?.areas.length ? activeZone.areas.length + 1 : 1}`,
      points: areaPoints,
      color: drawColor,
      opacity: drawOpacity,
    };
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, areas: [...zone.areas, newArea] } : zone));
    setAreaPoints([]);
    setAreaMode(false);
    setPointConnectSource(null);
  }, [activeZone?.areas.length, activeZoneId, areaPoints, drawColor, drawOpacity]);

  const finishBuildingShell = useCallback(() => {
    if (!activeZoneId || shellPoints.length < 3) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? {
      ...zone,
      buildingShell: { points: shellPoints, color: drawColor, opacity: drawOpacity, wallWidth: lineWidth },
    } : zone));
    setShellPoints([]);
    setShellMode(false);
  }, [activeZoneId, shellPoints, drawColor, drawOpacity, lineWidth]);

  const resetBuildingShell = useCallback(() => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, buildingShell: createDefaultBuildingShell(drawColor) } : zone));
    setShellPoints([]);
    setShellMode(false);
  }, [activeZoneId, drawColor]);

  const handleDraftPointClick = useCallback((target: DraftPointTarget) => {
    if (!pointConnectMode) return;
    const pointsFor = (kind: DraftGeometryKind) => kind === "line" ? linePoints : kind === "area" ? areaPoints : shellPoints;
    const targetPoint = pointsFor(target.kind)[target.index];
    if (!targetPoint) return;
    if (!pointConnectSource) {
      setPointConnectSource(target);
      setPointConnectError(null);
      return;
    }
    if (pointConnectSource.kind === target.kind && pointConnectSource.index === target.index) {
      setPointConnectSource(null);
      setPointConnectError(null);
      return;
    }
    const sourcePoint = pointsFor(pointConnectSource.kind)[pointConnectSource.index];
    if (!sourcePoint) {
      setPointConnectSource(target);
      return;
    }
    if (Math.hypot(targetPoint[0] - sourcePoint[0], targetPoint[1] - sourcePoint[1]) > 12) {
      setPointConnectError("Choose a closer second point");
      return;
    }
    const snapPoint = (points: MapPoint[]) => points.map((point, index) => index === pointConnectSource.index ? [...targetPoint] as MapPoint : point);
    if (pointConnectSource.kind === "line") setLinePoints(snapPoint);
    else if (pointConnectSource.kind === "area") setAreaPoints(snapPoint);
    else setShellPoints(snapPoint);
    setPointConnectSource(null);
    setPointConnectError(null);
  }, [areaPoints, linePoints, pointConnectMode, pointConnectSource, shellPoints]);

  const deleteMapLine = useCallback((lineId: string) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, lines: zone.lines.filter((line) => line.id !== lineId) } : zone));
  }, [activeZoneId]);

  const deleteArea = useCallback((areaId: string) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, areas: zone.areas.filter((area) => area.id !== areaId) } : zone));
  }, [activeZoneId]);

  const updateAreaName = useCallback((areaId: string, name: string) => {
    if (!activeZoneId) return;
    setZones((prev) => prev.map((zone) => zone.id === activeZoneId ? { ...zone, areas: zone.areas.map((area) => area.id === areaId ? { ...area, name } : area) } : zone));
  }, [activeZoneId]);

  const addEditingPinImage = useCallback(() => {
    const imageUrl = placeImageDraft.trim();
    if (!editingPin || !imageUrl || editingPin.images.includes(imageUrl)) return;
    setEditingPin({ ...editingPin, images: [...editingPin.images, imageUrl] });
    setPlaceImageDraft("");
  }, [editingPin, placeImageDraft]);

  const handlePlaceThumbnailFile = useCallback(async (file: File | undefined) => {
    if (!editingPin || !file) return;
    setPlaceThumbnailBusy(true);
    setMapsError(null);
    try {
      const thumbnailUrl = await createPlaceThumbnail(file);
      setEditingPin((current) => current?.id === editingPin.id ? { ...current, thumbnailUrl } : current);
    } catch (error) {
      setMapsError(error instanceof Error ? error.message : "Failed to prepare the Place thumbnail");
    } finally {
      setPlaceThumbnailBusy(false);
    }
  }, [editingPin]);

  const deleteWall = useCallback((wallIdx: number) => {
    if (!activeZoneId) return;
    setZones(prev => prev.map(z => z.id !== activeZoneId ? z : { ...z, walls: z.walls.filter((_, i) => i !== wallIdx) }));
  }, [activeZoneId]);

  const updateZoneImage = useCallback((zoneId: string, newImage: string) => {
    setZones(prev => prev.map(z => z.id !== zoneId ? z : { ...z, image: newImage }));
  }, []);

  /* ==============================================================
     SVG HEX MAP RENDER
     ============================================================== */

  const renderHexMap = () => {
    const hexPts = VERT_ANGLES.map(a => pol(HEX_R, a));
    const hexInner = VERT_ANGLES.map(a => pol(HEX_R - 16, a));
    const hexMid = VERT_ANGLES.map(a => pol(HEX_R - 8, a));

    const renderSector = (sectorId: string) => {
      const sector = SECTORS.find(s => s.id === sectorId)!;
      const zone = zones.find(z => z.id === sectorId);
      const geo = sectorGeo[sectorId];
      if (!geo) return null;
      const fog = zone?.fogMode ?? "visible";
      const isHov = hoveredSector === sectorId;
      const isCenter = sector.ring === "center";

      const playerInvisible = !isDM && fog === "invisible" && showFog;
      const playerLocked = !isDM && fog === "locked" && showFog;
      const dmFogged = isDM && fog !== "visible";

      if (isCenter) {
        return (
          <g
            key={sectorId}
            onClick={() => handleSectorClick(sectorId)}
            onMouseEnter={() => setHoveredSector(sectorId)}
            onMouseLeave={() => setHoveredSector(null)}
            style={{ cursor: "pointer" }}
          >
            <circle cx={CX} cy={CY} r={R_CORE} fill={isHov ? "#4A7BFF15" : "#0A0A3008"} stroke={isHov ? "#4A7BFF" : "#4A7BFF88"} strokeWidth={isHov ? "2.5" : "1.5"} filter={isHov ? "url(#strongGlow)" : "url(#sectorGlow)"} style={{ transition: "all 0.2s" }} />
            <circle cx={CX} cy={CY} r={R_CORE - 10} fill="none" stroke="#4A7BFF" strokeWidth="0.5" strokeOpacity="0.3" />
            <circle cx={CX} cy={CY} r={10} fill="url(#centerGlow)" stroke="#4A7BFF" strokeWidth="0.5" strokeOpacity="0.5" />
            <line x1={CX - 6} y1={CY} x2={CX + 6} y2={CY} stroke="#4A7BFF" strokeWidth="0.5" strokeOpacity="0.4" />
            <line x1={CX} y1={CY - 6} x2={CX} y2={CY + 6} stroke="#4A7BFF" strokeWidth="0.5" strokeOpacity="0.4" />
            <circle cx={CX} cy={CY} r={R_CORE} fill="none" stroke="#4A7BFF" strokeWidth="1" strokeOpacity="0">
              <animate attributeName="r" values={`${R_CORE};${R_CORE + 14}`} dur="3s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.4;0" dur="3s" repeatCount="indefinite" />
            </circle>
            {showLabels && (
              <g filter="url(#textGlow)" pointerEvents="none">
                <text x={CX} y={CY - 3} textAnchor="middle" dominantBaseline="middle" fill={isHov ? "#FFF" : "#4A7BFF"} fontSize={isHov ? "12" : "10"} fontFamily="'Trebuchet MS', sans-serif" fontWeight="700" style={{ transition: "all 0.2s" }}>Sector 0</text>
              </g>
            )}
          </g>
        );
      }

      if (playerInvisible) {
        return (
          <g key={sectorId}>
            <polygon points={ptsStr(geo.poly)} fill="#060618" stroke="#0A0A2A" strokeWidth="0.5" strokeLinejoin="round" />
          </g>
        );
      }

      const isLocked = playerLocked;

      return (
        <g
          key={sectorId}
          onClick={() => !isLocked && handleSectorClick(sectorId)}
          onMouseEnter={() => setHoveredSector(sectorId)}
          onMouseLeave={() => setHoveredSector(null)}
          style={{ cursor: isLocked ? "not-allowed" : "pointer" }}
        >
          <polygon
            points={ptsStr(geo.poly)}
            fill={isLocked ? "#060618" : `url(#grad-${sectorId})`}
            stroke={isLocked ? `${sector.color}22` : (isHov ? sector.color : `${sector.color}44`)}
            strokeWidth={isHov && !isLocked ? "2" : "1"}
            strokeLinejoin="round"
            filter={isHov && !isLocked ? "url(#sectorGlow)" : undefined}
            style={{ transition: "all 0.2s" }}
          />
          {isLocked && (
            <polygon points={ptsStr(geo.poly)} fill="url(#fogPattern)" fillOpacity="0.4" pointerEvents="none" />
          )}
          {dmFogged && (
            <polygon points={ptsStr(geo.poly)} fill="url(#fogPattern)" fillOpacity="0.5" pointerEvents="none" />
          )}
          {showLabels && (
            <g filter="url(#textGlow)" pointerEvents="none">
              <text x={geo.center[0]} y={geo.center[1]} textAnchor="middle" dominantBaseline="middle" fill={isLocked ? `${sector.color}55` : (isHov ? "#FFF" : sector.color)} fontSize={isHov && !isLocked ? "11" : "9"} fontFamily="'Trebuchet MS', sans-serif" fontWeight="700" style={{ transition: "all 0.2s" }}>
                {dmFogged ? `[Sector ${sector.number}]` : `Sector ${sector.number}`}
              </text>
              {isLocked && (
                <text x={geo.center[0]} y={geo.center[1] + 12} textAnchor="middle" dominantBaseline="middle" fill={sector.color} fontSize="6" fontFamily="'Tahoma', sans-serif" opacity="0.3">
                  LOCKED
                </text>
              )}
            </g>
          )}
          {dmFogged && showLabels && (
            <g pointerEvents="none">
              <text x={geo.center[0]} y={geo.center[1] + 14} textAnchor="middle" dominantBaseline="middle" fill={FOG_COLORS[fog]} fontSize="5" fontFamily="'Courier New', monospace" fontWeight="700" opacity="0.8">
                {fog === "locked" ? "LOCKED" : "HIDDEN"}
              </text>
            </g>
          )}
        </g>
      );
    };

    const outerBoundaryAngles = OUTER_BOUNDS.map(a => a % 360);

    return (
      <svg viewBox="0 0 5000 5000" className="w-full h-full select-none" style={{ background: "transparent", userSelect: "none" }}>
        <defs>
          <filter id="sectorGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="strongGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="textGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="wallGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="fogPattern" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#000" strokeWidth="3" strokeOpacity="0.3" />
          </pattern>
          <pattern id="gridPatternSubtle" patternUnits="userSpaceOnUse" width="40" height="40">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1A1A4B" strokeWidth="0.5" strokeOpacity="0.15" />
          </pattern>
          <pattern id="gridPattern" patternUnits="userSpaceOnUse" width="100" height="100">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#2A3A6B" strokeWidth="0.8" strokeOpacity="0.5" />
            <path d="M 50 0 L 50 100 M 0 50 L 100 50" fill="none" stroke="#1A2A5B" strokeWidth="0.4" strokeOpacity="0.3" />
          </pattern>
          <pattern id="steelWallBrick" patternUnits="userSpaceOnUse" width="14" height="7">
            <rect width="14" height="7" fill="#1A2A4A" />
            <rect x="0.5" y="0.5" width="12" height="2.5" fill="#253A5E" stroke="#3A5A8B" strokeWidth="0.3" rx="0.4" />
            <rect x="0.5" y="3.5" width="5" height="2.5" fill="#223556" stroke="#3A5A8B" strokeWidth="0.3" rx="0.4" />
            <rect x="6.5" y="3.5" width="7" height="2.5" fill="#263C62" stroke="#3A5A8B" strokeWidth="0.3" rx="0.4" />
            <line x1="1" y1="1.8" x2="12" y2="1.8" stroke="#4A7AAA" strokeWidth="0.15" strokeOpacity="0.4" />
            <line x1="1" y1="4.8" x2="5" y2="4.8" stroke="#4A7AAA" strokeWidth="0.15" strokeOpacity="0.3" />
            <line x1="7" y1="4.8" x2="13" y2="4.8" stroke="#4A7AAA" strokeWidth="0.15" strokeOpacity="0.3" />
          </pattern>
          <pattern id="outerWallBrick" patternUnits="userSpaceOnUse" width="28" height="14">
            <rect width="28" height="14" fill="#0F1F38" />
            <rect x="1" y="1" width="24" height="5" fill="#1A2E4E" stroke="#2A4A6B" strokeWidth="0.5" rx="0.6" />
            <rect x="1" y="7" width="10" height="5" fill="#162844" stroke="#2A4A6B" strokeWidth="0.5" rx="0.6" />
            <rect x="13" y="7" width="14" height="5" fill="#1C3250" stroke="#2A4A6B" strokeWidth="0.5" rx="0.6" />
            <line x1="2" y1="3.5" x2="24" y2="3.5" stroke="#3A6090" strokeWidth="0.2" strokeOpacity="0.3" />
            <line x1="2" y1="9.5" x2="10" y2="9.5" stroke="#3A6090" strokeWidth="0.2" strokeOpacity="0.25" />
            <line x1="14" y1="9.5" x2="26" y2="9.5" stroke="#3A6090" strokeWidth="0.2" strokeOpacity="0.25" />
          </pattern>
          <filter id="outerWallGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="wallSteelEdge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5A8ABB" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#3A6A9B" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2A4A7B" stopOpacity="0.7" />
          </linearGradient>
          <filter id="innerWallGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="gateGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="bgGrad" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#0E0E3A" /><stop offset="100%" stopColor="#060618" />
          </radialGradient>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4A7BFF" stopOpacity="0.15" /><stop offset="70%" stopColor="#4A7BFF" stopOpacity="0.05" /><stop offset="100%" stopColor="#4A7BFF" stopOpacity="0" />
          </radialGradient>
          {SECTORS.map(s => (
            <radialGradient key={`grad-${s.id}`} id={`grad-${s.id}`} cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor={s.color} stopOpacity={hoveredSector === s.id ? "0.22" : "0.08"} />
              <stop offset="100%" stopColor={s.color} stopOpacity={hoveredSector === s.id ? "0.08" : "0.02"} />
            </radialGradient>
          ))}
        </defs>

        <rect x="0" y="0" width="5000" height="5000" fill="url(#bgGrad)" />
        <rect x="0" y="0" width="5000" height="5000" fill="url(#gridPatternSubtle)" />
        {showGrid && <rect x="0" y="0" width="5000" height="5000" fill="url(#gridPattern)" />}

        {/* Grid coordinate labels */}
        {showGrid && (() => {
          const cellSize = 100;
          const cols = 50; // 5000 / 100
          const rows = 50;
          const labels: React.ReactElement[] = [];
          // Numbers along the bottom (left to right)
          for (let c = 0; c < cols; c++) {
            labels.push(
              <text key={`gn-${c}`} x={c * cellSize + cellSize / 2} y={4980} textAnchor="middle" dominantBaseline="auto" fill="#3A4A7B" fontSize="14" fontFamily="'Courier New', monospace" opacity="0.7">{c + 1}</text>
            );
          }
          // Letters along the left (bottom to top: A at bottom, ascending upward)
          for (let r = 0; r < rows; r++) {
            const letter = String.fromCharCode(65 + (rows - 1 - r)); // A at bottom row
            const displayLabel = (rows - 1 - r) < 26 ? letter : String.fromCharCode(65 + Math.floor((rows - 1 - r) / 26) - 1) + String.fromCharCode(65 + ((rows - 1 - r) % 26));
            labels.push(
              <text key={`gl-${r}`} x={18} y={r * cellSize + cellSize / 2} textAnchor="middle" dominantBaseline="central" fill="#3A4A7B" fontSize="14" fontFamily="'Courier New', monospace" opacity="0.7">{displayLabel}</text>
            );
          }
          return <g>{labels}</g>;
        })()}

        {/* ═══════════ THE OUTER CITY WALL ═���═══��═════ */}
        {(() => {
          const outerPts = OUTER_VERT_ANGLES.map(a => outerHexPol(a));
          const outerInner = OUTER_VERT_ANGLES.map(a => {
            const rad = (a * Math.PI) / 180;
            return [CX + (OUTER_HEX_R - 40) * Math.cos(rad), CY + (OUTER_HEX_R - 40) * Math.sin(rad)] as [number, number];
          });
          const outerMid = OUTER_VERT_ANGLES.map(a => {
            const rad = (a * Math.PI) / 180;
            return [CX + (OUTER_HEX_R - 20) * Math.cos(rad), CY + (OUTER_HEX_R - 20) * Math.sin(rad)] as [number, number];
          });
          const outerOuter = OUTER_VERT_ANGLES.map(a => {
            const rad = (a * Math.PI) / 180;
            return [CX + (OUTER_HEX_R + 10) * Math.cos(rad), CY + (OUTER_HEX_R + 10) * Math.sin(rad)] as [number, number];
          });

          /* Merlons along outer wall */
          const merlons: React.ReactElement[] = [];
          for (let vi = 0; vi < 6; vi++) {
            const a0 = OUTER_VERT_ANGLES[vi];
            const a1 = OUTER_VERT_ANGLES[(vi + 1) % 6];
            let end = a1; if (end <= a0) end += 360;
            const MERLON_COUNT = 60;
            for (let m = 0; m <= MERLON_COUNT; m++) {
              const a = a0 + (end - a0) * (m / MERLON_COUNT);
              const rad = (a * Math.PI) / 180;
              const mx = CX + (OUTER_HEX_R + 18) * Math.cos(rad);
              const my = CY + (OUTER_HEX_R + 18) * Math.sin(rad);
              merlons.push(
                <rect key={`om-${vi}-${m}`} x={mx - 3} y={my - 3} width="6" height="6"
                  fill="#1A2E4E" fillOpacity="0.7" stroke="#2A4A6B" strokeWidth="0.4" strokeOpacity="0.5"
                  transform={`rotate(${a}, ${mx.toFixed(1)}, ${my.toFixed(1)})`} />
              );
            }
          }

          /* Inner merlons (facing inward) */
          const innerMerlons: React.ReactElement[] = [];
          for (let vi = 0; vi < 6; vi++) {
            const a0 = OUTER_VERT_ANGLES[vi];
            const a1 = OUTER_VERT_ANGLES[(vi + 1) % 6];
            let end = a1; if (end <= a0) end += 360;
            const MERLON_COUNT = 60;
            for (let m = 0; m <= MERLON_COUNT; m++) {
              const a = a0 + (end - a0) * (m / MERLON_COUNT);
              const rad = (a * Math.PI) / 180;
              const mx = CX + (OUTER_HEX_R - 48) * Math.cos(rad);
              const my = CY + (OUTER_HEX_R - 48) * Math.sin(rad);
              innerMerlons.push(
                <rect key={`oim-${vi}-${m}`} x={mx - 2.5} y={my - 2.5} width="5" height="5"
                  fill="#162844" fillOpacity="0.5" stroke="#2A4A6B" strokeWidth="0.3" strokeOpacity="0.4"
                  transform={`rotate(${a}, ${mx.toFixed(1)}, ${my.toFixed(1)})`} />
              );
            }
          }

          /* Reference rings in the expanse between walls */
          const expanseRings = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000];

          /* Radial reference lines in expanse */
          const radialLines: React.ReactElement[] = [];
          for (let i = 0; i < 12; i++) {
            const a = i * 30;
            const rad = (a * Math.PI) / 180;
            const r1 = HEX_R + 40;
            const r2 = OUTER_HEX_R - 60;
            radialLines.push(
              <line key={`rl-${i}`}
                x1={CX + r1 * Math.cos(rad)} y1={CY + r1 * Math.sin(rad)}
                x2={CX + r2 * Math.cos(rad)} y2={CY + r2 * Math.sin(rad)}
                stroke="#0E1A3B" strokeWidth="1" strokeDasharray="8 20" strokeOpacity="0.3" />
            );
          }

          return (
            <g>

              {radialLines}

              {/* Outer sectors are rendered separately after the wall */}

              {/* Main outer wall – dark base stroke */}
              <polygon points={ptsStr(outerPts)} fill="none"
                stroke="#080E20" strokeWidth="45" strokeOpacity="0.9" strokeLinejoin="round" />
              {/* Brick texture layer */}
              <polygon points={ptsStr(outerPts)} fill="none"
                stroke="url(#outerWallBrick)" strokeWidth="38" strokeLinejoin="round" />
              {/* Outer bright edge */}
              <polygon points={ptsStr(outerOuter)} fill="none"
                stroke="#3A6090" strokeWidth="1.5" strokeOpacity="0.5" strokeLinejoin="round" />
              {/* Main highlight edge */}
              <polygon points={ptsStr(outerPts)} fill="none"
                stroke="#4A7AAA" strokeWidth="1.2" strokeOpacity="0.45" strokeLinejoin="round" />
              {/* Mid accent */}
              <polygon points={ptsStr(outerMid)} fill="none"
                stroke="#3A6A9B" strokeWidth="1" strokeOpacity="0.35" strokeLinejoin="round" />
              {/* Inner edge */}
              <polygon points={ptsStr(outerInner)} fill="none"
                stroke="#2A5080" strokeWidth="1.5" strokeOpacity="0.4" strokeLinejoin="round" />

              {/* Merlons */}
              {merlons}
              {innerMerlons}

              {/* Corner towers */}
              {OUTER_VERT_ANGLES.map((a, i) => {
                const [tx, ty] = outerHexPol(a);
                return (
                  <g key={`tower-${i}`}>
                    <circle cx={tx} cy={ty} r={28} fill="#0A1428" stroke="#2A4A6B" strokeWidth="2" strokeOpacity="0.6" />
                    <circle cx={tx} cy={ty} r={20} fill="#0D1A30" stroke="#3A5A8B" strokeWidth="1" strokeOpacity="0.4" />
                    <circle cx={tx} cy={ty} r={8} fill="#1A2E4E" stroke="#4A7AAA" strokeWidth="0.8" strokeOpacity="0.5" />
                    <circle cx={tx} cy={ty} r={3} fill="#4A7AAA" fillOpacity="0.3">
                      <animate attributeName="fill-opacity" values="0.15;0.4;0.15" dur="4s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}

              {/* Pulsing ward glow on outer wall */}
              <polygon points={ptsStr(outerPts)} fill="none"
                stroke="#4A7AAA" strokeWidth="2" strokeOpacity="0" strokeLinejoin="round">
                <animate attributeName="stroke-opacity" values="0;0.2;0" dur="6s" repeatCount="indefinite" />
              </polygon>

              {/* Outer wall label — top */}
              <g transform={`translate(${CX}, ${CY - OUTER_HEX_R - 70})`}>
                <rect x="-220" y="-16" width="440" height="32" fill="#060618" stroke="#2A4A6B" strokeWidth="1.5" rx="2" />
                <text x="0" y="2" textAnchor="middle" dominantBaseline="middle"
                  fill="#4A7AAA" fontSize="14" fontFamily="'Courier New', monospace" letterSpacing="4">
                  THE OUTER CITY WALL
                </text>
              </g>

              {/* ═══ THE GREAT CITY — ornate bottom label ═══ */}
              <g transform={`translate(${CX}, ${CY + OUTER_HEX_R + 110})`}>
                {/* Glow backdrop */}
                <rect x="-420" y="-58" width="840" height="116" fill="#080820" rx="4" filter="url(#towerGlow)" opacity="0.3" />
                {/* Outer frame — warm gold-bronze border */}
                <rect x="-410" y="-52" width="820" height="104" fill="#07071A" stroke="#8B6A3E" strokeWidth="2.5" rx="4" />
                {/* Second border — slightly inset, copper tone */}
                <rect x="-400" y="-46" width="800" height="92" fill="none" stroke="#6B5A3A88" strokeWidth="1.2" rx="3" />
                {/* Third border — innermost, faint amber */}
                <rect x="-392" y="-40" width="784" height="80" fill="none" stroke="#6B5A3A44" strokeWidth="0.6" rx="2" />
                {/* Filigree lines — top */}
                <line x1="-370" y1="-40" x2="-180" y2="-40" stroke="#8B6A3E55" strokeWidth="0.5" />
                <line x1="180" y1="-40" x2="370" y2="-40" stroke="#8B6A3E55" strokeWidth="0.5" />
                <line x1="-370" y1="-36" x2="-220" y2="-36" stroke="#6B5A3A33" strokeWidth="0.4" />
                <line x1="220" y1="-36" x2="370" y2="-36" stroke="#6B5A3A33" strokeWidth="0.4" />
                {/* Filigree lines — bottom */}
                <line x1="-370" y1="40" x2="-180" y2="40" stroke="#8B6A3E55" strokeWidth="0.5" />
                <line x1="180" y1="40" x2="370" y2="40" stroke="#8B6A3E55" strokeWidth="0.5" />
                <line x1="-370" y1="36" x2="-220" y2="36" stroke="#6B5A3A33" strokeWidth="0.4" />
                <line x1="220" y1="36" x2="370" y2="36" stroke="#6B5A3A33" strokeWidth="0.4" />
                {/* Corner ornaments — larger, gold-toned with nested detail */}
                {[[-400, -46], [384, -46], [-400, 30], [384, 30]].map(([ox, oy], i) => (
                  <g key={i}>
                    <rect x={ox} y={oy} width="16" height="16" fill="none" stroke="#8B6A3E66" strokeWidth="1" />
                    <rect x={ox + 2} y={oy + 2} width="12" height="12" fill="none" stroke="#8B6A3E33" strokeWidth="0.5" />
                    <rect x={ox + 5} y={oy + 5} width="6" height="6" fill="#8B6A3E22" />
                    <circle cx={ox + 8} cy={oy + 8} r="2" fill="none" stroke="#C4975544" strokeWidth="0.5" />
                  </g>
                ))}
                {/* Main title — larger, warm gold */}
                <text x="0" y="-5" textAnchor="middle" dominantBaseline="middle"
                  fill="#D4A85A" fontSize="30" fontFamily="'Courier New', monospace" letterSpacing="12" fontWeight="bold"
                  style={{ filter: "drop-shadow(0 0 6px #C4975544) drop-shadow(0 0 16px #8B6A3E33)" } as any}>
                  THE GREAT CITY
                </text>
                {/* Subtitle — larger, warm muted */}
                <text x="0" y="26" textAnchor="middle" dominantBaseline="middle"
                  fill="#8B7A5A" fontSize="11" fontFamily="'Georgia', serif" letterSpacing="5"
                  fontStyle="italic">
                  MAY IT PROTECT US, SHELTER US
                </text>
                {/* Thin inner accent lines flanking subtitle */}
                <line x1="-120" y1="26" x2="-50" y2="26" stroke="#8B6A3E33" strokeWidth="0.4" />
                <line x1="50" y1="26" x2="120" y2="26" stroke="#8B6A3E33" strokeWidth="0.4" />
              </g>

              {/* Vertex labels */}
              {OUTER_VERT_ANGLES.map((a, i) => {
                const rad = (a * Math.PI) / 180;
                const lx = CX + (OUTER_HEX_R + 55) * Math.cos(rad);
                const ly = CY + (OUTER_HEX_R + 55) * Math.sin(rad);
                const labels = ["N", "NE", "SE", "S", "SW", "NW"];
                return (
                  <text key={`ovl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                    fill="#3A5A8B" fontSize="16" fontFamily="'Courier New', monospace" opacity="0.5">
                    {labels[i]}
                  </text>
                );
              })}
            </g>
          );
        })()}

        {/* Hex wall – blue/steel */}
        <polygon points={ptsStr(hexPts)} fill="none" stroke="#0D1A30" strokeWidth="18" strokeOpacity="0.8" strokeLinejoin="round" />
        <polygon points={ptsStr(hexPts)} fill="none" stroke="url(#steelWallBrick)" strokeWidth="14" strokeLinejoin="round" />
        <polygon points={ptsStr(hexPts)} fill="none" stroke="#5A8ABB" strokeWidth="1" strokeOpacity="0.6" strokeLinejoin="round" />
        <polygon points={ptsStr(hexInner)} fill="none" stroke="#3A6A9B" strokeWidth="1.2" strokeOpacity="0.5" strokeLinejoin="round" />
        <polygon points={ptsStr(hexMid)} fill="none" stroke="#4A7AAA" strokeWidth="0.6" strokeOpacity="0.35" strokeLinejoin="round" />

        {/* Hex gate areas – clickable white gates within the wall (North & South) */}
        {GATES.map((gate) => {
          const angle = gate.angle;
          const [gx, gy] = pol(HEX_R - 8, angle);
          const perp = angle + 90;
          const perpRad = (perp * Math.PI) / 180;
          const gateHalfW = 14;
          const wallHalfThick = 9;
          const angRad = (angle * Math.PI) / 180;
          const isHov = hoveredGate === gate.id;
          const x1 = gx - Math.cos(perpRad) * gateHalfW - Math.cos(angRad) * wallHalfThick;
          const y1 = gy - Math.sin(perpRad) * gateHalfW - Math.sin(angRad) * wallHalfThick;
          const x2 = gx + Math.cos(perpRad) * gateHalfW - Math.cos(angRad) * wallHalfThick;
          const y2 = gy + Math.sin(perpRad) * gateHalfW - Math.sin(angRad) * wallHalfThick;
          const x3 = gx + Math.cos(perpRad) * gateHalfW + Math.cos(angRad) * wallHalfThick;
          const y3 = gy + Math.sin(perpRad) * gateHalfW + Math.sin(angRad) * wallHalfThick;
          const x4 = gx - Math.cos(perpRad) * gateHalfW + Math.cos(angRad) * wallHalfThick;
          const y4 = gy - Math.sin(perpRad) * gateHalfW + Math.sin(angRad) * wallHalfThick;
          const pts = `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)}`;
          return (
            <g
              key={gate.id}
              onClick={() => handleGateClick(gate.id)}
              onMouseEnter={() => setHoveredGate(gate.id)}
              onMouseLeave={() => setHoveredGate(null)}
              style={{ cursor: "pointer" }}
            >
              <polygon points={pts} fill={isHov ? "#FFFFFF18" : "#0D1A30"} stroke={isHov ? "#FFFFFF" : "#FFFFFF88"} strokeWidth={isHov ? "1.5" : "0.8"} filter={isHov ? "url(#gateGlow)" : undefined} style={{ transition: "all 0.2s" }} />
              <line x1={gx - Math.cos(perpRad) * gateHalfW} y1={gy - Math.sin(perpRad) * gateHalfW} x2={gx + Math.cos(perpRad) * gateHalfW} y2={gy + Math.sin(perpRad) * gateHalfW} stroke="#FFFFFF" strokeWidth="0.8" strokeOpacity={isHov ? "0.9" : "0.5"} strokeDasharray="3 2" />
              <circle cx={gx} cy={gy} r={isHov ? "3.5" : "2.5"} fill="#FFFFFF" fillOpacity={isHov ? "1" : "0.8"} style={{ transition: "all 0.2s" }}>
                <animate attributeName="fill-opacity" values={isHov ? "0.8;1;0.8" : "0.5;0.8;0.5"} dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={gx - Math.cos(perpRad) * (gateHalfW - 3)} cy={gy - Math.sin(perpRad) * (gateHalfW - 3)} r="1.5" fill="#FFFFFF" fillOpacity="0.5" />
              <circle cx={gx + Math.cos(perpRad) * (gateHalfW - 3)} cy={gy + Math.sin(perpRad) * (gateHalfW - 3)} r="1.5" fill="#FFFFFF" fillOpacity="0.5" />
            </g>
          );
        })}

        {/* Radial boundary lines from R_INNER to hex wall — 10 outer sector boundaries */}
        {outerBoundaryAngles.map((a, i) => {
          const [ix, iy] = pol(R_INNER, a);
          const [ox, oy] = pol(hexR(a % 360) - WALL_PAD, a % 360);
          return <line key={`rad-${i}`} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#1A2A5B" strokeWidth="0.5" strokeDasharray="3 6" strokeOpacity="0.35" />;
        })}

        {/* Inner wedge boundary lines (faint) */}
        {[225, 315, 45, 135].map((a, i) => {
          const [ix, iy] = pol(R_CORE, a);
          const [ox, oy] = pol(R_INNER, a);
          return <line key={`wedge-${i}`} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#1A2A5B" strokeWidth="0.4" strokeDasharray="3 5" strokeOpacity="0.25" />;
        })}

        {/* ═══════════ OUTER SECTORS V2 — 8 sectors around hex ring ═══════════ */}
        {OUTER_SECTORS_V2.map((sector, si) => {
          const { polygon, color, id, name } = sector;
          const subData = OUTER_SECTOR_SUBS[si];
          const polyStr = polygon.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

          // Compute polygon centroid for sector number label
          let cx0 = 0, cy0 = 0;
          polygon.forEach(([x, y]) => { cx0 += x; cy0 += y; });
          cx0 /= polygon.length; cy0 /= polygon.length;

          return (
            <g key={`osv2-${id}`}>
              {/* Sector fill */}
              <polygon points={polyStr} fill={color} fillOpacity="0.03" />

              {/* Sector outline */}
              <polygon points={polyStr} fill="none"
                stroke={color} strokeWidth="2" strokeOpacity="0.35" strokeLinejoin="round" />
              <polygon points={polyStr} fill="none"
                stroke={color} strokeWidth="0.5" strokeOpacity="0.6" strokeLinejoin="round" />

              {/* Sub-sector division lines — grid boundaries */}
              {subData.lines.map((ln, li) => (
                <line key={`osl-${id}-${li}`}
                  x1={ln[0]} y1={ln[1]} x2={ln[2]} y2={ln[3]}
                  stroke={color} strokeWidth="0.8" strokeOpacity="0.2" />
              ))}

              {/* Sub-sector clickable polygon regions + labels */}
              {subData.labels.map(sub => {
                const subKey = sub.label;
                const isHov = hoveredOuterSub === subKey;
                const isSel = false;
                const subPolyStr = sub.poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
                return (
                  <g key={subKey}
                    onClick={(e) => { e.stopPropagation(); if (!wasDraggingRef.current) handleSectorClick(`os-${subKey}`); }}
                    onMouseEnter={() => setHoveredOuterSub(subKey)}
                    onMouseLeave={() => setHoveredOuterSub(null)}
                    style={{ cursor: "pointer" }}>
                    <polygon points={subPolyStr}
                      fill={color}
                      fillOpacity={isSel ? 0.15 : isHov ? 0.08 : 0}
                      stroke={isSel ? color : color}
                      strokeWidth={isSel ? "2" : isHov ? "1.5" : "0.9"}
                      strokeOpacity={isSel ? 0.8 : isHov ? 0.55 : 0.22}
                      filter={isSel ? "url(#strongGlow)" : "url(#sectorGlow)"}
                      style={{ transition: "all 0.2s" }} />
                    <text x={sub.x} y={sub.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={isSel ? "#FFF" : color} fontSize="18" fontFamily="'Courier New', monospace"
                      fontWeight="bold" opacity={isSel ? 0.95 : isHov ? 0.8 : 0.55} letterSpacing="1"
                      filter={isSel || isHov ? "url(#textGlow)" : undefined}
                      pointerEvents="none"
                      style={{ transition: "all 0.2s" }}>
                      {sub.label}
                    </text>
                  </g>
                );
              })}

              {/* Large sector number */}
              <text x={cx0} y={cy0} textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize="90" fontFamily="'Courier New', monospace"
                fontWeight="bold" opacity="0.25" letterSpacing="6"
                stroke={color} strokeWidth="1.5" strokeOpacity="0.15"
                filter="url(#textGlow)"
                pointerEvents="none">
                {id}
              </text>

              {/* Corner dots showing polygon vertices */}
              {polygon.map(([px, py], pi) => (
                <circle key={`ov-${id}-${pi}`} cx={px} cy={py} r="4"
                  fill={color} fillOpacity="0.2" />
              ))}
            </g>
          );
        })}




        {/* Render sectors: outer first, then inner, then center (on top) */}
        {["s14","s13","s12","s11","s10","s9","s8","s7","s6","s5"].map(id => renderSector(id))}
        {["s4","s3","s2","s1"].map(id => renderSector(id))}
        {renderSector("s0")}

        {/* ── Inner Wall between S1-S4 and outer sectors ── */}
        {(() => {
          const WALL_R = R_INNER;
          const GATE_HALF = 2;
          const GATE_ANGLES = [288, 324, 0, 36, 72, 108, 144, 180, 216, 252];
          const GATE_R = 5;

          const wallArcs: { a0: number; a1: number }[] = [];
          const sorted = [...GATE_ANGLES].sort((a, b) => a - b);
          for (let i = 0; i < sorted.length; i++) {
            const from = sorted[i] + GATE_HALF;
            const to = (i < sorted.length - 1 ? sorted[i + 1] : sorted[0] + 360) - GATE_HALF;
            wallArcs.push({ a0: from, a1: to });
          }

          const describeArc = (r: number, startDeg: number, endDeg: number) => {
            let s = startDeg, e = endDeg;
            if (e <= s) e += 360;
            const sr = (s * Math.PI) / 180;
            const er = (e * Math.PI) / 180;
            const sx = CX + r * Math.cos(sr), sy = CY + r * Math.sin(sr);
            const ex = CX + r * Math.cos(er), ey = CY + r * Math.sin(er);
            const span = e - s;
            const lf = span > 180 ? 1 : 0;
            return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${lf} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
          };

          return (
            <g>
              {wallArcs.map((arc, i) => (
                <g key={`iwall-${i}`}>
                  <path d={describeArc(WALL_R, arc.a0, arc.a1)} fill="none" stroke="#0D1A30" strokeWidth="12" strokeOpacity="0.8" />
                  <path d={describeArc(WALL_R, arc.a0, arc.a1)} fill="none" stroke="url(#steelWallBrick)" strokeWidth="10" />
                  <path d={describeArc(WALL_R, arc.a0, arc.a1)} fill="none" stroke="#5A8ABB" strokeWidth="0.8" strokeOpacity="0.5" />
                  <path d={describeArc(WALL_R - 5.5, arc.a0, arc.a1)} fill="none" stroke="#3A6A9B" strokeWidth="0.6" strokeOpacity="0.4" />
                  <path d={describeArc(WALL_R + 5.5, arc.a0, arc.a1)} fill="none" stroke="#3A6A9B" strokeWidth="0.6" strokeOpacity="0.4" />
                  {(() => {
                    const steps = 24;
                    let s = arc.a0, e = arc.a1;
                    if (e <= s) e += 360;
                    const merlons: React.ReactElement[] = [];
                    for (let j = 0; j <= steps; j++) {
                      const a = s + (e - s) * (j / steps);
                      const rad = (a * Math.PI) / 180;
                      const mx = CX + (WALL_R + 7) * Math.cos(rad);
                      const my = CY + (WALL_R + 7) * Math.sin(rad);
                      merlons.push(<rect key={`m-${i}-${j}`} x={mx - 1.3} y={my - 1.3} width="2.6" height="2.6" fill="#2A4A6B" fillOpacity="0.6" stroke="#3A6A9B" strokeWidth="0.2" strokeOpacity="0.4" transform={`rotate(${a}, ${mx.toFixed(1)}, ${my.toFixed(1)})`} />);
                    }
                    return merlons;
                  })()}
                </g>
              ))}

              {GATE_ANGLES.map((ga, i) => {
                const [gx, gy] = pol(WALL_R, ga);
                const gaRad = (ga * Math.PI) / 180;
                const outX = Math.cos(gaRad);
                const outY = Math.sin(gaRad);
                const sa = ga + 90;
                const ea = ga - 90;
                const sr2 = (sa * Math.PI) / 180;
                const er2 = (ea * Math.PI) / 180;
                const sx2 = gx + GATE_R * Math.cos(sr2);
                const sy2 = gy + GATE_R * Math.sin(sr2);
                const ex2 = gx + GATE_R * Math.cos(er2);
                const ey2 = gy + GATE_R * Math.sin(er2);
                const cx2 = gx + GATE_R * 0.5 * outX;
                const cy2 = gy + GATE_R * 0.5 * outY;
                const archD = `M ${sx2.toFixed(1)} ${sy2.toFixed(1)} A ${GATE_R} ${GATE_R} 0 0 0 ${ex2.toFixed(1)} ${ey2.toFixed(1)}`;

                return (
                  <g key={`gate-inner-${i}`}>
                    <circle cx={gx} cy={gy} r={GATE_R + 1} fill="none" stroke="#FFFFFF22" strokeWidth="0.3" strokeDasharray="1.5 2">
                      <animate attributeName="stroke-dashoffset" values="0;7" dur="4s" repeatCount="indefinite" />
                    </circle>
                    <path d={archD} fill="#060618" fillOpacity="0.85" stroke="#FFFFFF" strokeWidth="0.8" filter="url(#gateGlow)" />
                    <path d={archD} fill="none" stroke="#FFFFFF44" strokeWidth="1.5" strokeOpacity="0.3" />
                    <circle cx={sx2} cy={sy2} r="1" fill="#FFFFFF" fillOpacity="0.8" />
                    <circle cx={ex2} cy={ey2} r="1" fill="#FFFFFF" fillOpacity="0.8" />
                    <circle cx={cx2} cy={cy2} r="0.8" fill="#FFFFFF" fillOpacity="0.4">
                      <animate attributeName="fill-opacity" values="0.2;0.6;0.2" dur="2.5s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })()}



        {/* Cartouche — Inner City */}
        <g transform={`translate(${CX}, ${CY + 400})`}>
          <rect x="-100" y="-12" width="200" height="24" fill="#060618" stroke="#2A3A6B" strokeWidth="1" rx="1" />
          <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill="#5A7ABB" fontSize="8" fontFamily="'Courier New', monospace" letterSpacing="2">THE INNER CITY</text>
        </g>



        {/* Scale bar */}
        <g transform={`translate(120, 4860)`} opacity="0.5">
          <line x1="0" y1="0" x2="300" y2="0" stroke="#5A7ABB" strokeWidth="2" />
          <line x1="0" y1="-6" x2="0" y2="6" stroke="#5A7ABB" strokeWidth="2" />
          <line x1="300" y1="-6" x2="300" y2="6" stroke="#5A7ABB" strokeWidth="2" />
          <line x1="150" y1="-4" x2="150" y2="4" stroke="#5A7ABB" strokeWidth="1" />
          <text x="150" y="-12" textAnchor="middle" fill="#5A7ABB" fontSize="12" fontFamily="'Courier New', monospace">2500 ft</text>
        </g>

        {/* Gate labels (North & South only) */}
        {GATES.map((gate) => {
          const [lx, ly] = pol(HEX_R + 22, gate.angle);
          const isHov = hoveredGate === gate.id;
          return <text key={`gl-${gate.angle}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={isHov ? "#FFFFFF" : "#5A7ABB"} fontSize="6.5" fontFamily="'Courier New', monospace" opacity={isHov ? "0.9" : "0.5"} style={{ transition: "all 0.2s" }}>{gate.name}</text>;
        })}
      </svg>
    );
  };

  /* ==============================================================
     MAIN RENDER
     ============================================================== */

  const fogCounts = useMemo(() => {
    const sectorMaps = zones.filter((zone) => zone.mapType === "sector");
    const locked = sectorMaps.filter(z => z.fogMode === "locked").length;
    const invisible = sectorMaps.filter(z => z.fogMode === "invisible").length;
    return { locked, invisible, fogged: locked + invisible };
  }, [zones]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "linear-gradient(180deg, #0A0A3B 0%, #080830 40%, #060625 100%)", fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif" }}>
      {/* Toolbar */}
      <div className={`${retro.toolbar} flex items-center justify-between relative z-20`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/interface")} className="text-[11px] hover:opacity-80 flex items-center gap-1" style={S_ACCENT}><ArrowLeft size={12} /> Back</button>
          <span className="text-[11px]" style={S_DIM}>|</span>
          <span className="text-[11px]" style={S_DIM}>Intelli Maps</span>
          {activeZone && (
            <div style={{ display: "contents" }}>
              <ChevronRight size={10} style={S_DIM} />
              <span className="text-[11px]" style={{ color: activeZone.color }}>{getMapTitle(activeZone)}</span>
            </div>
          )}
          {activeGate && !activeZone && (
            <div style={{ display: "contents" }}>
              <ChevronRight size={10} style={S_DIM} />
              <span className="text-[11px]" style={{ color: "#FFFFFF" }}>{activeGate.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={S_LABEL}>User: {currentUser}</span>
          {isDM && (
            <div style={{ display: "contents" }}>
              <span className="text-[11px]" style={S_DIM}>|</span>
              {isEditMode && (
                <div className="flex items-center gap-1">
                  <button onClick={undoZones} disabled={!canUndo} className="p-1 disabled:opacity-30 hover:bg-[#1A1A4B]" style={S_ACCENT} title="Undo (Ctrl+Z)"><Undo2 size={11} /></button>
                  <button onClick={redoZones} disabled={!canRedo} className="p-1 disabled:opacity-30 hover:bg-[#1A1A4B]" style={S_ACCENT} title="Redo (Ctrl+Y)"><Redo2 size={11} /></button>
                </div>
              )}
              <button onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) {
                  setLinkMode(false);
                  setLinkSource(null);
                  setWallMode(false);
                  setLinePoints([]);
                  setAreaMode(false);
                  setShellMode(false);
                  setAreaPoints([]);
                  setShellPoints([]);
                  setPointConnectMode(false);
                  setPointConnectSource(null);
                  setPointConnectError(null);
                  setSelectedSlotId(null);
                  setEditingSlot(null);
                  setIsNewSlot(false);
                }
              }} className="text-[10px] px-2 py-0.5 hover:opacity-80" style={{ color: isEditMode ? "#FF6A6A" : "#4A7BFF", border: "1px solid #2A2A5B", background: "#0E0E35" }}>
                {isEditMode ? "✦ EDITING" : "Edit Mode"}
              </button>
            </div>
          )}
        </div>
      </div>

      {(mapsLoading || mapsError) && (
        <div className="px-3 py-2 text-[10px] flex items-center justify-between gap-3" style={{ background: "#0B0B2E", borderBottom: "1px solid #1A1A4B", color: mapsError ? "#FFAA4A" : "#7AA2FF" }}>
          <span>{mapsError ? `Map sync error: ${mapsError}` : "Loading Intelli Maps from Supabase..."}</span>
          {mapsError && (
            <button
              onClick={() => window.location.reload()}
              className="px-2 py-0.5 hover:opacity-80"
              style={{ border: "1px solid #3A3A6B", background: "#11113A", color: "#C0D0F0" }}
            >
              Reload
            </button>
          )}
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 flex flex-col p-3 min-h-0">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2 relative z-10">
            <div className="flex items-center gap-3">
              {(activeZone || activeGate) && (
                <button onClick={handleBackToWorld} className={`${retro.button} px-3 py-1 text-[11px] flex items-center gap-1.5`} style={S_TEXT}><CornerUpLeft size={12} /> {parentZone ? getMapTitle(parentZone) : "City Map"}</button>
              )}
              <div>
                <h1 className="text-[18px] tracking-tight" style={{ color: activeGate ? "#FFFFFF" : (activeZone ? activeZone.color : "#4A7BFF"), fontWeight: 700, fontFamily: "'Trebuchet MS', 'Tahoma', sans-serif", textShadow: "1px 1px 0px #0A0A3B" }}>
                  {activeGate ? activeGate.name : (activeZone ? getMapTitle(activeZone) : "The Deep City")}
                </h1>
                <p className="text-[10px]" style={S_LABEL}>{activeGate ? activeGate.description : (activeZone ? (activeZone.mapType === "place" ? `Nested inside ${parentZone ? getMapTitle(parentZone) : "Intelli Maps"}` : (activeZone.subtitle || "Custom sector workspace")) : "The Great City · Inner City · 8 Outer Sectors")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!activeZone && !activeGate && (
                <div style={{ display: "contents" }}>
                  <button onClick={() => setShowLabels(!showLabels)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showLabels ? "#C0D0F0" : "#5A6A8A" }}>{showLabels ? <Eye size={10} /> : <EyeOff size={10} />} Labels</button>
                  <button onClick={() => setShowGrid(!showGrid)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showGrid ? "#C0D0F0" : "#5A6A8A" }}><Grid3x3 size={10} /> Grid</button>
                  {isDM && <button onClick={() => setShowFog(!showFog)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showFog ? "#FFAA4A" : "#5A6A8A" }} title="Toggle Fog of War">{showFog ? <Cloud size={10} /> : <CloudOff size={10} />} Fog</button>}
                </div>
              )}
              {activeZone && activeZone.editorVariant !== "building" && <button onClick={() => setShowPaths(!showPaths)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showPaths ? "#C0D0F0" : "#5A6A8A" }}><Link2 size={10} /> Paths</button>}
              {activeZone && <button onClick={() => setShowGrid(!showGrid)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showGrid ? "#C0D0F0" : "#5A6A8A" }}><Grid3x3 size={10} /> Grid</button>}
              {activeZone && isEditMode && isDM && (
                <div style={{ display: "contents" }}>
                  {activeZone.editorVariant === "building" ? (
                    <div style={{ display: "contents" }}>
                      <button onClick={() => { setLinkMode(false); setWallMode(false); setAreaMode(false); setShellMode(false); setPointConnectMode(false); setPointConnectSource(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: !wallMode && !areaMode && !shellMode && !pointConnectMode ? "#4AFF4A" : "#5A6A8A" }} title="Place building slots"><Boxes size={10} /> Slot</button>
                      <button onClick={() => { setShellMode(!shellMode); setLinkMode(false); setWallMode(false); setAreaMode(false); setPointConnectMode(false); setPointConnectSource(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: shellMode ? drawColor : "#5A6A8A" }} title="Redraw the building shell"><Building2 size={10} /> Shell{shellPoints.length > 0 ? ` ${shellPoints.length}` : ""}</button>
                    </div>
                  ) : (
                    <div style={{ display: "contents" }}>
                      <button onClick={() => { setLinkMode(false); setLinkSource(null); setWallMode(false); setAreaMode(false); setShellMode(false); setPointConnectMode(false); setPointConnectSource(null); setPointConnectError(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: !linkMode && !wallMode && !areaMode && !pointConnectMode ? "#4AFF4A" : "#5A6A8A" }} title="Place boxes on the map"><MapPin size={10} /> Place</button>
                      <button onClick={() => { setLinkMode(!linkMode); setLinkSource(null); setWallMode(false); setAreaMode(false); setShellMode(false); setPointConnectMode(false); setPointConnectSource(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: linkMode ? "#4AFFFF" : "#5A6A8A" }} title="Connect two Place markers">{linkMode ? <Unlink size={10} /> : <Link2 size={10} />} Connect Places</button>
                    </div>
                  )}
                  <button onClick={() => { setWallMode(!wallMode); setLinkMode(false); setLinkSource(null); setAreaMode(false); setShellMode(false); setPointConnectMode(false); setPointConnectSource(null); setPointConnectError(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: wallMode ? drawColor : "#5A6A8A" }} title="Draw an editable line"><Minus size={10} /> Line{linePoints.length > 0 ? ` ${linePoints.length}` : ""}</button>
                  <button onClick={() => { setAreaMode(!areaMode); setLinkMode(false); setLinkSource(null); setWallMode(false); setShellMode(false); setPointConnectMode(false); setPointConnectSource(null); setPointConnectError(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: areaMode ? drawColor : "#5A6A8A" }} title="Draw an editable filled polygon"><Pentagon size={10} /> Area{areaPoints.length > 0 ? ` ${areaPoints.length}` : ""}</button>
                  {linePoints.length + areaPoints.length >= 2 && <button onClick={() => { setPointConnectMode(!pointConnectMode); setPointConnectSource(null); setPointConnectError(null); setLinkMode(false); setLinkSource(null); setWallMode(false); setAreaMode(false); setShellMode(false); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: pointConnectMode ? "#FFD34A" : "#5A6A8A" }} title="Snap the first selected nearby draft point onto the second"><Combine size={10} /> Snap Points</button>}
                  {!linkMode && !wallMode && !areaMode && !shellMode && !pointConnectMode && (
                    <span className="text-[10px] px-2 py-1" style={{ color: selectedConnectionKey ? "#4AFFFF" : "#4AFF4A", background: selectedConnectionKey ? "#0A1A2A" : "#0A1A12", border: selectedConnectionKey ? "1px solid #1A3A4A" : "1px solid #1A3A2A" }}>
                      {selectedConnectionKey ? "Click path to add bend | drag handles to reshape" : `Click to add ${activeZone.editorVariant === "building" ? "slot" : "place"}`}
                    </span>
                  )}
                  {linkMode && <span className="text-[10px] px-2 py-1" style={{ color: "#4AFFFF", background: "#0A1A2A", border: "1px solid #1A3A4A" }}>{linkSource ? "Click second Place" : "Click first Place"}</span>}
                  {pointConnectMode && <span className="text-[10px] px-2 py-1" style={{ color: pointConnectError ? "#FF8A8A" : "#FFD34A", background: "#241D08", border: "1px solid #5A4918" }}>{pointConnectError || (pointConnectSource ? "Choose nearby target" : "Choose point to snap")}</span>}
                  {wallMode && <div className="flex gap-1"><button onClick={finishLine} disabled={linePoints.length < 2} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1 disabled:opacity-40`} style={{ color: drawColor }}><Check size={10} /> Finish ({linePoints.length})</button>{linePoints.length > 0 && <button onClick={() => { setLinePoints([]); setPointConnectSource(null); }} className={`${retro.button} p-1.5`} style={S_RED} title="Discard line draft"><X size={10} /></button>}</div>}
                  {areaMode && <div className="flex gap-1"><button onClick={finishArea} disabled={areaPoints.length < 3} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1 disabled:opacity-40`} style={{ color: drawColor }}><Check size={10} /> Finish ({areaPoints.length})</button>{areaPoints.length > 0 && <button onClick={() => { setAreaPoints([]); setPointConnectSource(null); }} className={`${retro.button} p-1.5`} style={S_RED} title="Discard area draft"><X size={10} /></button>}</div>}
                  {shellMode && <div className="flex gap-1"><button onClick={finishBuildingShell} disabled={shellPoints.length < 3} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1 disabled:opacity-40`} style={{ color: drawColor }}><Check size={10} /> Finish shell ({shellPoints.length})</button>{shellPoints.length > 0 && <button onClick={() => setShellPoints([])} className={`${retro.button} p-1.5`} style={S_RED} title="Discard shell draft"><X size={10} /></button>}</div>}
                </div>
              )}
            </div>
          </div>

          <div
            ref={mapContainerRef}
            className={`${retro.raised} flex-1 relative overflow-hidden`}
            style={{ background: "#060618", minHeight: 400, cursor: isDragging ? "grabbing" : (mapZoom > 1 ? "grab" : undefined) }}
            onWheel={handleWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
          >
            {/* Loading overlay */}
            {!mapReady && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "#060618" }}>
                <div className="mb-4" style={{ width: 48, height: 48, border: "2px solid #1A1A4B", borderTop: "2px solid #4A7BFF", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                <div className="text-[13px] tracking-widest" style={{ color: "#4A7BFF", fontFamily: "'Courier New', monospace", textShadow: "0 0 8px #4A7BFF44" }}>INITIALIZING MAP</div>
                <div className="text-[9px] mt-1 tracking-wider" style={{ color: "#3A4A6B", fontFamily: "'Courier New', monospace" }}>Calibrating sector coordinates...</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            <div style={{ opacity: (mapReady && !zoomTransition) ? 1 : 0, transition: "opacity 0.4s ease" }} className="absolute inset-0">
            {activeGate && !activeZone ? (
              <div className="absolute inset-0" style={{ transform: `translate(${mapPan[0]}px, ${mapPan[1]}px) scale(${mapZoom})`, transformOrigin: "0 0", transition: isPanning ? "none" : "transform 0.1s ease-out" }}>
                <ImageWithFallback src={activeGate.image} alt={activeGate.name} className="w-full h-full object-cover" style={{ filter: "brightness(0.4) saturate(0.6) contrast(1.2)" }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(6,6,24,0.9) 100%)" }} />
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <DoorOpen size={48} style={{ color: "#FFFFFF", opacity: 0.3, margin: "0 auto 12px" }} />
                    <div className="text-[14px] font-bold" style={{ color: "#FFFFFF", textShadow: "0 0 12px rgba(255,255,255,0.3)", fontFamily: "'Trebuchet MS', sans-serif" }}>{activeGate.name}</div>
                    <div className="text-[10px] mt-1" style={{ color: "#AABBDD", fontFamily: "'Courier New', monospace" }}>{activeGate.description}</div>
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 pointer-events-none">
                  <div className="text-[9px] px-2 py-1" style={{ color: "#FFFFFF", background: "rgba(6,6,24,0.85)", border: "1px solid #FFFFFF33", fontFamily: "'Courier New', monospace" }}>{activeGate.name.toUpperCase()} · FORTIFIED ENTRANCE</div>
                </div>
              </div>
            ) : !activeZone ? (
              <div className="absolute inset-0 flex items-center justify-center" style={{ padding: "8px", transform: `translate(${mapPan[0]}px, ${mapPan[1]}px) scale(${mapZoom})`, transformOrigin: "0 0", transition: isPanning ? "none" : "transform 0.1s ease-out" }}>{renderHexMap()}</div>
            ) : (
              <div className="absolute inset-0" onClick={handleMapClick} style={{ cursor: isEditMode && isDM ? ((wallMode || areaMode || shellMode || pointConnectMode) ? "crosshair" : linkMode ? "pointer" : "crosshair") : (isDragging ? "grabbing" : (mapZoom > 1 ? "grab" : "default")), transform: `translate(${mapPan[0]}px, ${mapPan[1]}px) scale(${mapZoom})`, transformOrigin: "0 0", transition: isPanning ? "none" : "transform 0.1s ease-out" }}>
                {(activeZone.useMapBg || !activeZone.image) ? (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: `radial-gradient(ellipse at 30% 40%, ${activeZone.color}15 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, ${activeZone.color}10 0%, transparent 50%), linear-gradient(180deg, #080828 0%, #0A0A3B 30%, #0E0E35 60%, #080828 100%)`,
                  }}>
                    <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(26,26,75,0.15) 38px, rgba(26,26,75,0.15) 40px), repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(26,26,75,0.15) 38px, rgba(26,26,75,0.15) 40px)" }} />
                    <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 20% 30%, ${activeZone.color}08 0%, transparent 25%), radial-gradient(circle at 80% 70%, ${activeZone.color}06 0%, transparent 30%), radial-gradient(circle at 50% 50%, #1A1A4B08 0%, transparent 40%)` }} />
                  </div>
                ) : (
                  <ImageWithFallback src={activeZone.image} alt={activeZone.name} draggable={false} className="w-full h-full object-cover select-none pointer-events-none" style={{ filter: "brightness(0.45) saturate(0.7) contrast(1.15)", userSelect: "none", WebkitUserDrag: "none" } as any} />
                )}
                <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${activeZone.color}0A 0%, transparent 50%, ${activeZone.color}05 100%)` }} />
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(6,6,24,0.85) 100%)" }} />
                <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)" }} />
                {showGrid && (
                  <div className="absolute inset-0 pointer-events-none z-[2]">
                    <div className="absolute inset-0" style={{
                      backgroundImage: `
                        linear-gradient(to right, rgba(42,58,107,0.35) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(42,58,107,0.35) 1px, transparent 1px),
                        linear-gradient(to right, rgba(26,42,91,0.2) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(26,42,91,0.2) 1px, transparent 1px)
                      `,
                      backgroundSize: "100px 100px, 100px 100px, 50px 50px, 50px 50px",
                    }} />
                    {(() => {
                      const el = mapContainerRef.current;
                      const w = el?.clientWidth ?? 800;
                      const h = el?.clientHeight ?? 600;
                      const cellSize = 100;
                      const cols = Math.ceil(w / cellSize);
                      const rows = Math.ceil(h / cellSize);
                      return (
                        <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
                          {Array.from({ length: cols }, (_, c) => (
                            <text key={`sgn-${c}`} x={c * cellSize + cellSize / 2} y={h - 4} textAnchor="middle" fill="#3A4A7B" fontSize="9" fontFamily="'Courier New', monospace" opacity="0.8">{c + 1}</text>
                          ))}
                          {Array.from({ length: rows }, (_, r) => {
                            const idx = rows - 1 - r;
                            const letter = idx < 26 ? String.fromCharCode(65 + idx) : String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
                            return <text key={`sgl-${r}`} x={8} y={r * cellSize + cellSize / 2} textAnchor="middle" dominantBaseline="central" fill="#3A4A7B" fontSize="9" fontFamily="'Courier New', monospace" opacity="0.8">{letter}</text>;
                          })}
                        </svg>
                      );
                    })()}
                  </div>
                )}
                {renderBuildingShell(activeZone)}
                {renderAreas(activeZone)}
                {linePoints.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-[6]" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {linePoints.slice(1).map((point, index) => <path key={`draft-line-segment-${index}`} d={getLinePath(linePoints[index], point, lineCurve)} fill="none" stroke={drawColor} strokeOpacity={0.95} strokeWidth={lineWidth} strokeDasharray={lineDashed ? "5 4" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
                  </svg>
                )}
                {areaPoints.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-[6]" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline points={areaPoints.map(([x, y]) => `${x},${y}`).join(" ")} fill={areaPoints.length >= 3 ? drawColor : "none"} fillOpacity={areaPoints.length >= 3 ? drawOpacity * 0.55 : 0} stroke={drawColor} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                {shellPoints.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-[6]" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline points={shellPoints.map(([x, y]) => `${x},${y}`).join(" ")} fill={shellPoints.length >= 3 ? drawColor : "none"} fillOpacity={shellPoints.length >= 3 ? drawOpacity * 0.55 : 0} stroke={drawColor} strokeWidth={lineWidth} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                {renderConnectionLines(activeZone)}
                {renderWalls(activeZone)}
                {renderMapLines(activeZone)}
                {isDM && isEditMode && ([
                  { kind: "line", points: linePoints, color: drawColor },
                  { kind: "area", points: areaPoints, color: "#FFD34A" },
                  { kind: "shell", points: shellPoints, color: "#FF8A4A" },
                ] as Array<{ kind: DraftGeometryKind; points: MapPoint[]; color: string }>).flatMap(({ kind, points, color }) => points.map((point, index) => {
                  const target: DraftPointTarget = { kind, index };
                  const isConnectSource = pointConnectSource?.kind === kind && pointConnectSource.index === index;
                  const isConnectable = kind !== "shell";
                  const sourcePoints = pointConnectSource?.kind === "line" ? linePoints : pointConnectSource?.kind === "area" ? areaPoints : shellPoints;
                  const sourcePoint = pointConnectSource ? sourcePoints[pointConnectSource.index] : null;
                  const isNearbyTarget = !sourcePoint || Math.hypot(point[0] - sourcePoint[0], point[1] - sourcePoint[1]) <= 12;
                  const handleSize = kind === "area" ? 11 : 15;
                  return (
                    <button
                      key={`draft-${kind}-${index}`}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        if (event.button === 0 && !pointConnectMode) setDraggingDraftPoint(target);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (pointConnectMode && isConnectable) handleDraftPointClick(target);
                      }}
                      className="absolute z-20 flex items-center justify-center text-[7px] font-bold"
                      style={{
                        left: `${point[0]}%`, top: `${point[1]}%`, transform: "translate(-50%, -50%)",
                        width: handleSize, height: handleSize, fontSize: kind === "area" ? 6 : 7, borderRadius: kind === "line" ? "50%" : 2,
                        color: "#071021", background: isConnectSource ? "#FFFFFF" : (pointConnectMode && sourcePoint && isNearbyTarget && isConnectable ? "#64D98B" : color),
                        border: `2px solid ${isConnectSource ? "#FFD34A" : "#F0F4FF"}`,
                        boxShadow: isConnectSource ? "0 0 12px #FFD34A" : `0 0 7px ${color}88`,
                        cursor: pointConnectMode ? (isConnectable ? "crosshair" : "not-allowed") : "move",
                        opacity: pointConnectMode && (!isConnectable || !isNearbyTarget) ? 0.35 : 1,
                      }}
                      title={pointConnectMode ? (isConnectable ? "Connect this point" : "Shell points cannot be connected") : `Drag ${kind} point ${index + 1}`}
                    >{index + 1}</button>
                  );
                }))}
                {activeZone.editorVariant === "building" && activeZone.buildingSlots.map((slot) => {
                  const meta = BUILDING_SLOT_KINDS[slot.kind];
                  const isSelected = selectedSlotId === slot.id;
                  const selectSlot = () => {
                    if (wasDraggingRef.current) return;
                    setSelectedSlotId(isSelected ? null : slot.id);
                    setEditingSlot(null);
                    setIsNewSlot(false);
                  };
                  return (
                    <div
                      key={slot.id}
                      role="button"
                      tabIndex={0}
                      onMouseDown={(event) => {
                        if (event.button === 0 && isDM && isEditMode && !wallMode && !areaMode && !shellMode && !pointConnectMode) {
                          event.stopPropagation();
                          setDraggingSlotId(slot.id);
                        }
                      }}
                      onClick={(event) => { event.stopPropagation(); selectSlot(); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectSlot(); } }}
                      className="absolute z-10 overflow-hidden text-left transition-[width,height,box-shadow] duration-200"
                      style={{
                        left: `${slot.x}%`,
                        top: `${slot.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: isSelected ? Math.max(slot.width, 210) : slot.width,
                        height: isSelected ? "auto" : slot.height,
                        minHeight: slot.height,
                        color: "#E6ECFF",
                        backgroundColor: slot.filled ? `${meta.color}38` : "rgba(8,8,32,0.9)",
                        backgroundImage: slot.filled ? undefined : `repeating-linear-gradient(135deg, transparent 0, transparent 7px, ${meta.color}16 7px, ${meta.color}16 10px)`,
                        border: `2px ${slot.filled ? "solid" : "dashed"} ${meta.color}`,
                        boxShadow: isSelected ? `0 0 22px ${meta.color}66` : "0 5px 14px rgba(0,0,0,0.4)",
                        cursor: isDM && isEditMode && !wallMode && !areaMode && !shellMode && !pointConnectMode ? "move" : "pointer",
                      }}
                    >
                      <div className="px-2 py-1.5 flex items-center gap-1.5" style={{ background: `${meta.color}${slot.filled ? "22" : "0D"}`, borderBottom: `1px solid ${meta.color}44` }}>
                        {slot.filled ? <Building2 size={12} style={{ color: meta.color }} /> : <Boxes size={12} style={{ color: meta.color }} />}
                        <span className="text-[10px] font-semibold truncate">{slot.name}</span>
                        <span className="ml-auto text-[7px] px-1 py-0.5 shrink-0" style={{ color: slot.filled ? "#DFFFF0" : "#AAB3CC", border: `1px solid ${meta.color}55`, background: slot.filled ? `${meta.color}25` : "rgba(0,0,0,0.25)" }}>{slot.filled ? "FILLED" : "EMPTY"}</span>
                      </div>
                      <div className="px-2 py-1 text-[8px] uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</div>
                      {slot.filled && slot.contents && <div className="px-2 pb-1.5 text-[9px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{slot.contents}</div>}
                      {isSelected && (
                        <div className="px-2 pb-2" style={{ borderTop: `1px solid ${meta.color}33` }}>
                          <div className="mt-2 text-[9px]" style={{ color: slot.filled ? "#CFFFE0" : "#8993AD" }}>{slot.filled ? (slot.contents || "Filled, contents not named") : "Available building slot"}</div>
                          {slot.description && <p className="text-[9px] leading-relaxed mt-1.5" style={S_TEXT}>{slot.description}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeZone.editorVariant === "building" && editingSlot && isNewSlot && (
                  <div className="absolute z-20 pointer-events-none" style={{ left: `${editingSlot.x}%`, top: `${editingSlot.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div className="flex items-center justify-center gap-1.5 animate-pulse" style={{ width: editingSlot.width, height: editingSlot.height, color: BUILDING_SLOT_KINDS[editingSlot.kind].color, background: "rgba(14,14,53,0.92)", border: `2px dashed ${BUILDING_SLOT_KINDS[editingSlot.kind].color}`, boxShadow: `0 0 15px ${BUILDING_SLOT_KINDS[editingSlot.kind].color}44` }}><Plus size={15} /><span className="text-[9px]">New slot</span></div>
                  </div>
                )}
                {activeZone.editorVariant !== "building" && activeZone.pins.map(pin => {
                  const isSelected = selectedPinId === pin.id;
                  const isLinkSrc = linkSource === pin.id;
                  const wikiPage = wikiPages.find((page) => page.id === pin.wikiPageId);
                  const hasPlaceMap = Boolean(pin.placeMapId && zones.some((zone) => zone.id === pin.placeMapId));
                  const hasBuildingMap = Boolean(pin.buildingMapId && zones.some((zone) => zone.id === pin.buildingMapId));
                  const placeSize = Math.max(64, Math.min(280, pin.width));
                  const expandedWidth = Math.max(280, placeSize);
                  const expandedHeight = Math.max(310, Math.min(360, placeSize + 100));
                  const compactLabel = resolveCompactPlaceLabel(pin, placeSize);
                  const selectPlace = () => {
                    if (wasDraggingRef.current) return;
                    if (linkMode && isDM && isEditMode) handlePinClickForLink(pin.id);
                    else {
                      setSelectedPinId(isSelected ? null : pin.id);
                      setEditingPin(null);
                      setIsNewPin(false);
                      setPlaceImageDraft("");
                    }
                  };
                  return (
                    <div
                      key={pin.id}
                      role="button"
                      tabIndex={0}
                      onMouseDown={(event) => {
                        if (event.button === 0 && isDM && isEditMode && !linkMode && !wallMode && !areaMode && !pointConnectMode) {
                          event.stopPropagation();
                          setDraggingPinId(pin.id);
                        }
                      }}
                      onClick={(event) => { event.stopPropagation(); selectPlace(); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPlace(); } }}
                      className="absolute z-10 overflow-hidden text-left transition-[width,height,box-shadow] duration-200 flex flex-col"
                      style={{
                        left: `${pin.x}%`,
                        top: `${pin.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: isSelected ? expandedWidth : placeSize,
                        height: isSelected ? expandedHeight : placeSize,
                        background: isLinkSrc ? "rgba(10,38,52,0.96)" : "rgba(10,10,42,0.95)",
                        border: `2px solid ${isLinkSrc ? "#4AFFFF" : pin.color}`,
                        boxShadow: isSelected ? `0 0 22px ${pin.color}66` : "0 5px 16px rgba(0,0,0,0.42)",
                        cursor: isDM && isEditMode && !linkMode && !wallMode && !areaMode && !pointConnectMode ? "move" : "pointer",
                      }}
                    >
                      {!isSelected ? (
                        <div
                          className="relative h-full w-full flex items-center justify-center overflow-hidden px-2"
                          style={pin.thumbnailUrl ? {
                            backgroundImage: `linear-gradient(rgba(4,6,20,0.28), rgba(4,6,20,0.82)), url(${JSON.stringify(pin.thumbnailUrl)})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          } : { background: `${pin.color}12` }}
                        >
                          <span
                            className="max-w-full text-center font-bold leading-none truncate"
                            style={{
                              color: isLinkSrc ? "#4AFFFF" : "#F2F5FF",
                              fontSize: compactLabel.kind === "symbol" ? Math.max(18, Math.min(38, placeSize * 0.34)) : placeSize < 84 ? 9 : 11,
                              textShadow: pin.thumbnailUrl ? "0 1px 5px #000, 0 0 2px #000" : undefined,
                            }}
                            title={pin.name}
                          >
                            {compactLabel.text}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="h-8 px-2 flex items-center gap-1.5 shrink-0" style={{ background: `${pin.color}16`, borderBottom: `1px solid ${pin.color}44` }}>
                            {pin.thumbnailUrl
                              ? <ImageWithFallback src={pin.thumbnailUrl} alt="" className="w-6 h-6 object-cover shrink-0" />
                              : renderIcon(pin.icon, 13, isLinkSrc ? "#4AFFFF" : pin.color)}
                            <span className="text-[11px] font-semibold truncate flex-1" style={{ color: isLinkSrc ? "#4AFFFF" : "#E0E8FF" }}>{pin.name}</span>
                            {pin.wikiPageId && <button onClick={(event) => { event.stopPropagation(); navigate(`/interface/inet-page/${pin.wikiPageId}`); }} className="p-0.5 shrink-0 hover:bg-[#1A1A4B]" style={S_ACCENT} title={wikiPage?.title || wikiPage?.name || "Open linked wiki article"}><BookOpen size={10} /></button>}
                          </div>
                          <div className="h-5 px-2 flex items-center shrink-0 text-[8px] truncate" style={{ color: pin.subtitle ? "#9AA8C8" : "#536080", background: "rgba(5,5,24,0.28)", borderBottom: `1px solid ${pin.color}22` }}>{pin.subtitle || " "}</div>
                          <div className="flex-1 min-h-0 px-2 py-2" style={{ background: "rgba(4,4,22,0.18)" }}>
                            <p className="h-full text-[9px] leading-relaxed whitespace-pre-wrap pr-1 overflow-y-auto" style={{ ...S_TEXT, overflowWrap: "anywhere" }}>{pin.description || <span style={S_DIM}>No description</span>}</p>
                          </div>
                          {(hasPlaceMap || hasBuildingMap) && (
                            <div className={`grid ${hasPlaceMap && hasBuildingMap ? "grid-cols-2" : "grid-cols-1"} h-7 shrink-0`} style={{ borderTop: `1px solid ${pin.color}44` }}>
                              {hasPlaceMap && <button onClick={(event) => { event.stopPropagation(); createOrOpenPlaceMap(pin, "places"); }} className="text-[8px] flex items-center justify-center gap-1 hover:bg-[#1A1A4B]" style={{ color: pin.color, borderRight: hasBuildingMap ? "1px solid #2A2A5B" : undefined }}><MapPinned size={9} /> Place Map</button>}
                              {hasBuildingMap && <button onClick={(event) => { event.stopPropagation(); createOrOpenPlaceMap(pin, "building"); }} className="text-[8px] flex items-center justify-center gap-1 hover:bg-[#2A1E14]" style={{ color: "#FFB35A" }}><Building2 size={9} /> Building</button>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {activeZone.editorVariant !== "building" && editingPin && isNewPin && (
                  <div className="absolute z-20 pointer-events-none" style={{ left: `${editingPin.x}%`, top: `${editingPin.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div className="flex items-center justify-center gap-1.5 animate-pulse" style={{ width: editingPin.width, height: editingPin.width, background: "rgba(14,14,53,0.9)", border: `2px solid ${editingPin.color}`, boxShadow: `0 0 15px ${editingPin.color}44`, color: editingPin.color }}><Plus size={16} /><span className="text-[10px]">New place</span></div>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 pointer-events-none">
                  <div className="text-[9px] px-2 py-1" style={{ color: activeZone.color, background: "rgba(6,6,24,0.85)", border: `1px solid ${activeZone.color}33`, fontFamily: "'Courier New', monospace" }}>{getMapTitle(activeZone).toUpperCase()} · {activeZone.editorVariant === "building" ? `${activeZone.buildingSlots.length} SLOTS` : `${activeZone.pins.length} PLACES`}</div>
                </div>
              </div>
            )}
            </div>{/* end opacity wrapper */}

            {/* Zoom controls overlay */}
            <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1" style={{ pointerEvents: "auto" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setMapZoom(prev => Math.min(MAX_ZOOM, prev * 1.25)); }}
                className="p-1.5 hover:opacity-80 transition-opacity"
                style={{ background: "rgba(6,6,37,0.9)", border: "1px solid #2A2A5B", color: "#5A7ABB" }}
                title="Zoom In"
              ><ZoomIn size={13} /></button>
              <button
                onClick={(e) => { e.stopPropagation(); setMapZoom(prev => Math.max(MIN_ZOOM, prev * 0.8)); }}
                className="p-1.5 hover:opacity-80 transition-opacity"
                style={{ background: "rgba(6,6,37,0.9)", border: "1px solid #2A2A5B", color: "#5A7ABB" }}
                title="Zoom Out"
              ><ZoomOut size={13} /></button>
              {(mapZoom !== 1 || mapPan[0] !== 0 || mapPan[1] !== 0) && (
                <button
                  onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                  className="p-1.5 hover:opacity-80 transition-opacity"
                  style={{ background: "rgba(6,6,37,0.9)", border: "1px solid #2A2A5B", color: "#FFAA4A" }}
                  title="Reset View"
                ><Maximize2 size={13} /></button>
              )}
              {mapZoom !== 1 && (
                <div className="text-center text-[8px] px-1 py-0.5" style={{ background: "rgba(6,6,37,0.9)", border: "1px solid #2A2A5B", color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>
                  {Math.round(mapZoom * 100)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === SIDEBAR === */}
        <div className="lg:w-72 xl:w-80 flex flex-col gap-0 shrink-0 overflow-y-auto overscroll-contain" style={{ background: "#0B0B2E", borderLeft: "2px solid #050520" }}>
          {activeGate && !activeZone ? (
            <div style={{ display: "contents" }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #FFFFFF22", background: "#FFFFFF08" }}>
                <div className="flex items-center gap-2"><DoorOpen size={13} style={{ color: "#FFFFFF" }} /><span className="text-[12px] font-semibold" style={{ color: "#FFFFFF" }}>{activeGate.name}</span></div>
              </div>
              <div className="px-3 py-3 space-y-3">
                <div>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                  <div className="text-[11px]" style={S_TEXT}>{activeGate.description}</div>
                </div>
                <div>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>STATUS</div>
                  <div className="text-[10px] flex items-center gap-1.5" style={{ color: "#4AFF4A" }}><Shield size={10} /> Fortified · Operational</div>
                </div>
                <div>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>POSITION</div>
                  <div className="text-[10px]" style={{ color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>{activeGate.angle === 270 ? "North" : "South"} wall · {activeGate.angle}°</div>
                </div>
              </div>
            </div>
          ) : !activeZone ? (
            <div style={{ display: "contents" }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #1A1A4B" }}>
                <div className="flex items-center gap-2"><Layers size={13} style={S_ACCENT} /><span className="text-[12px]" style={S_ACCENT_HDR}>Sectors</span></div>
                <span className="text-[9px]" style={S_DIM}>{zones.filter(z => z.mapType === "sector" && z.fogMode === "visible").length}/{zones.filter(z => z.mapType === "sector").length} visible</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const innerZones = zones.filter(zone => zone.mapType === "sector" && !zone.id.startsWith(OUTER_ZONE_ID_PREFIX));
                  const outerZones = zones
                    .filter(zone => zone.mapType === "sector" && zone.id.startsWith(OUTER_ZONE_ID_PREFIX))
                    .sort(compareOuterZones);

                  const renderZoneRow = (zone: MapZone) => {
                    const fog = zone.fogMode;
                    const outerSubLabel = getOuterSubLabelFromZone(zone);
                    const isOuterZone = zone.id.startsWith(OUTER_ZONE_ID_PREFIX);
                    const isHov = isOuterZone ? hoveredOuterSub === outerSubLabel : hoveredSector === zone.id;
                    if (!isDM && showFog && fog === "invisible") return null;
                    const isLockedForPlayer = !isDM && showFog && fog === "locked";
                    const zoneLabel = isOuterZone ? `Sector ${outerSubLabel}` : `Sector ${zone.sectorNumber}`;
                    const zoneMeta = isOuterZone ? zone.subtitle : undefined;
                    return (
                      <div
                        key={zone.id}
                        onMouseEnter={() => {
                          if (isOuterZone) setHoveredOuterSub(outerSubLabel);
                          else setHoveredSector(zone.id);
                        }}
                        onMouseLeave={() => {
                          if (isOuterZone) setHoveredOuterSub(null);
                          else setHoveredSector(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 transition-colors"
                        style={{ borderBottom: "1px solid #0E0E35", background: isHov ? `${zone.color}0D` : "transparent" }}
                      >
                        <button
                          onClick={() => !isLockedForPlayer && handleSectorClick(zone.id)}
                          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                          style={{ cursor: isLockedForPlayer ? "not-allowed" : "pointer", opacity: isLockedForPlayer ? 0.5 : 1 }}
                        >
                          <div className="w-7 h-7 shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ border: `1px solid ${isLockedForPlayer ? "#2A2A4B" : `${zone.color}55`}`, color: isLockedForPlayer ? "#5A6A8A" : zone.color, background: isLockedForPlayer ? "#080820" : `${zone.color}0A`, fontFamily: "'Courier New', monospace" }}>
                            {isLockedForPlayer ? <Lock size={10} /> : isOuterZone ? outerSubLabel : `${zone.sectorNumber}`}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate" style={{ color: isLockedForPlayer ? "#5A6A8A" : zone.color }}>{zoneLabel}</div>
                            {zoneMeta && <div className="text-[9px] truncate" style={S_DIM}>{zoneMeta}</div>}
                          </div>
                        </button>
                        {isDM && isEditMode ? (
                          <button
                            onClick={() => cycleFogMode(zone.id)}
                            className="p-1 hover:bg-[#1A1A4B] transition-colors shrink-0 flex items-center gap-1"
                            title={`Fog: ${FOG_LABELS[fog]} (click to cycle)`}
                            style={{ color: FOG_COLORS[fog] }}
                          >
                            {fog === "visible" && <Eye size={10} />}
                            {fog === "locked" && <Lock size={10} />}
                            {fog === "invisible" && <Ban size={10} />}
                            <span className="text-[8px]">{FOG_LABELS[fog][0]}</span>
                          </button>
                        ) : (
                          <ChevronRight size={12} style={{ color: isLockedForPlayer ? "#2A2A4B" : `${zone.color}44` }} />
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "#0A0A2A", borderBottom: "1px solid #1A1A4B" }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: "#4A7BFF", boxShadow: "0 0 4px #4A7BFF55" }} />
                        <span className="text-[9px] tracking-widest" style={{ color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>INNER SECTORS</span>
                        <span className="text-[8px] ml-auto" style={{ color: "#3A4A6B" }}>{innerZones.length}</span>
                      </div>
                      {innerZones.map(renderZoneRow)}
                      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "#0A0A2A", borderBottom: "1px solid #1A1A4B" }}>
                        <div className="w-2 h-2" style={{ background: "#4AFFFF22", border: "1px solid #4AFFFF55" }} />
                        <span className="text-[9px] tracking-widest" style={{ color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>OUTER SUBSECTORS</span>
                        <span className="text-[8px] ml-auto" style={{ color: "#3A4A6B" }}>{outerZones.length}</span>
                      </div>
                      {outerZones.map(renderZoneRow)}
                    </>
                  );
                })()}
              </div>
              <div className="px-3 py-2" style={{ borderTop: "1px solid #1A1A4B", background: "#090928" }}>
                <div className="text-[9px] mb-1.5" style={S_SECTION_HDR}>CITY LAYOUT</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full border" style={{ borderColor: "#4A7BFF55", background: "#4A7BFF15" }} /><span className="text-[9px]" style={S_MUTED}>0 — Central Core</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3" style={{ background: "#7B68EE15", border: "1px solid #7B68EE44", transform: "rotate(45deg)", marginLeft: 1 }} /><span className="text-[9px]" style={S_MUTED}>1-4 — Inner Ring (N/E/S/W)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-1.5" style={{ background: "#2A3A6B33", border: "1px solid #2A3A6B", borderRadius: 1 }} /><span className="text-[9px]" style={S_MUTED}>Inner Wall · 3 gates</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-2" style={{ background: "#FFFFFF10", border: "1px solid #FFFFFF33", borderRadius: 1 }} /><span className="text-[9px]" style={S_MUTED}>Inner City Wall · 2 gates (N/S)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3" style={{ background: "#4AFFFF10", border: "1px solid #4AFFFF33" }} /><span className="text-[9px]" style={S_MUTED}>5-14 — Outer Ring (10 sectors)</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-2.5" style={{ background: "#0F1F3855", border: "1px solid #2A4A6B55", borderRadius: 1 }} /><span className="text-[9px]" style={S_MUTED}>The Great City Wall · No gates</span></div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3" style={{ background: "#4A7BFF08", border: "1px solid #4A7BFF33" }} /><span className="text-[9px]" style={S_MUTED}>15-22 - Outer Sectors (8 sectors | 60 deg / 30 deg)</span></div>
                </div>
                {isDM && (
                  <div className="mt-1.5 space-y-0.5">
                    <div className="text-[8px] flex items-center gap-1" style={S_DIM}><Cloud size={8} /> Fog: {fogCounts.locked} locked, {fogCounts.invisible} hidden</div>
                    <div className="text-[8px] flex items-center gap-2" style={S_DIM}>
                      <span className="flex items-center gap-0.5"><Eye size={7} style={{ color: "#4AFF4A" }} /> Vis</span>
                      <span className="flex items-center gap-0.5"><Lock size={7} style={{ color: "#FFAA4A" }} /> Lock</span>
                      <span className="flex items-center gap-0.5"><Ban size={7} style={{ color: "#FF6A6A" }} /> Invis</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "contents" }}>
              <div className="px-3 py-2" style={{ borderBottom: `1px solid ${activeZone.color}22`, background: `${activeZone.color}08` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeZone.editorVariant === "building" ? <Building2 size={13} style={{ color: activeZone.color }} /> : <MapPin size={13} style={{ color: activeZone.color }} />}
                    <span className="text-[12px] font-semibold" style={{ color: activeZone.color }}>{getMapTitle(activeZone)} - {activeZone.editorVariant === "building" ? "Building" : "Places"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeZone.fogMode !== "visible" && isDM && (
                      <span className="text-[9px] px-1.5 py-0.5" style={{ color: FOG_COLORS[activeZone.fogMode], background: "#1A1A0A", border: "1px solid #3A3A1A" }}>
                        {activeZone.fogMode === "locked" ? "LOCKED" : "HIDDEN"}
                      </span>
                    )}
                    {isDM && isEditMode && (
                      <button onClick={() => cycleFogMode(activeZone.id)} className="p-1 hover:bg-[#1A1A4B]" style={{ color: FOG_COLORS[activeZone.fogMode] }} title={`Fog: ${FOG_LABELS[activeZone.fogMode]}`}>
                        {activeZone.fogMode === "visible" && <Eye size={10} />}
                        {activeZone.fogMode === "locked" && <Lock size={10} />}
                        {activeZone.fogMode === "invisible" && <Ban size={10} />}
                      </button>
                    )}
                  </div>
                </div>
                {isDM && isEditMode && (
                  <div className="grid grid-cols-2 gap-1 mt-2 p-0.5" style={{ background: "#070724", border: "1px solid #1A1A4B" }}>
                    <button onClick={() => setActiveEditorVariant("places")} className="px-2 py-1 text-[9px] flex items-center justify-center gap-1" style={{ color: activeZone.editorVariant === "places" ? "#E0E8FF" : "#687394", background: activeZone.editorVariant === "places" ? "#19194B" : "transparent", border: activeZone.editorVariant === "places" ? `1px solid ${activeZone.color}77` : "1px solid transparent" }}><MapPinned size={10} /> Place Map</button>
                    <button onClick={() => setActiveEditorVariant("building")} className="px-2 py-1 text-[9px] flex items-center justify-center gap-1" style={{ color: activeZone.editorVariant === "building" ? "#FFF0D8" : "#687394", background: activeZone.editorVariant === "building" ? "#332014" : "transparent", border: activeZone.editorVariant === "building" ? "1px solid #FFB35A88" : "1px solid transparent" }}><Building2 size={10} /> Building</button>
                  </div>
                )}
              </div>
              {activeZone.editorVariant !== "building" && activeZone.connections.length > 0 && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>PATHS ({activeZone.connections.length})</div>
                  {isDM && isEditMode && <div className="text-[8px] mb-1.5 leading-relaxed" style={S_DIM}>Click a path on the map to add a bend. Drag its handles to reshape it; double-click a handle to remove it.</div>}
                  <div className="space-y-1">
                    {activeZone.connections.map(([aId, bId], idx) => {
                      const pinA = activeZone.pins.find(p => p.id === aId); const pinB = activeZone.pins.find(p => p.id === bId);
                      if (!pinA || !pinB) return null;
                      const routeKey = getConnectionRouteKey(aId, bId);
                      const bendCount = (activeZone.connectionRoutes[routeKey] || []).length;
                      const isSelected = selectedConnectionKey === routeKey;
                      return (
                        <div key={`${routeKey}-${idx}`} className="flex items-center min-w-0 text-[9px]" style={{ ...S_SUBTLE, background: isSelected ? "#101C3D" : "transparent", border: isSelected ? `1px solid ${activeZone.color}88` : "1px solid transparent" }}>
                          <button className="flex items-center gap-1.5 min-w-0 flex-1 px-1 py-1 text-left" onClick={() => setSelectedConnectionKey(isSelected ? null : routeKey)} title="Select this path for editing">
                            <Link2 size={8} className="shrink-0" style={{ color: activeZone.color, opacity: isSelected ? 1 : 0.5 }} />
                            <span className="truncate" style={{ color: pinA.color }}>{pinA.name}</span>
                            <span className="shrink-0" style={S_DIM}>to</span>
                            <span className="truncate" style={{ color: pinB.color }}>{pinB.name}</span>
                            <span className="ml-auto shrink-0" style={S_DIM}>{bendCount} {bendCount === 1 ? "bend" : "bends"}</span>
                          </button>
                          {isSelected && isDM && isEditMode && bendCount > 0 && (
                            <button
                              onClick={() => clearConnectionRoute(routeKey)}
                              className="mr-1 px-1 py-0.5 shrink-0 hover:bg-[#1A2A4B]"
                              style={{ color: "#7ACBFF", border: "1px solid #2A4A6B" }}
                              title="Remove all bends from this path"
                            >
                              Straighten
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeZone.lines.length > 0 && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>LINES ({activeZone.lines.length})</div>
                  <div className="space-y-1">
                    {activeZone.lines.map((line, index) => (
                      <div key={line.id} className="flex items-center gap-1.5 text-[9px]" style={S_SUBTLE}>
                        <span className="w-8 h-[3px]" style={{ background: line.color, opacity: line.opacity, borderTop: line.dashed ? "1px dashed #060618" : undefined }} />
                        <span>Segment {index + 1}</span>
                        {line.curve !== 0 && <span className="flex items-center gap-0.5" style={{ color: "#FFD34A" }} title={`Curve ${line.curve}`}><Spline size={8} /> {line.curve}</span>}
                        <span className="ml-auto" style={S_DIM}>{line.width}px</span>
                        {isDM && isEditMode && <button onClick={() => deleteMapLine(line.id)} className="p-0.5 hover:bg-[#2A1A1A]" style={S_RED} title="Delete line"><Trash2 size={8} /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeZone.areas.length > 0 && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>AREAS ({activeZone.areas.length})</div>
                  <div className="space-y-1">
                    {activeZone.areas.map((area) => (
                      <div key={area.id} className="flex items-center gap-1.5 text-[9px]" style={S_SUBTLE}>
                        <span className="w-3 h-3 shrink-0" style={{ background: area.color, opacity: area.opacity + 0.2, border: `1px solid ${area.color}` }} />
                        {isDM && isEditMode ? (
                          <input value={area.name} onChange={(event) => updateAreaName(area.id, event.target.value)} className="min-w-0 flex-1 px-1 py-0.5 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} aria-label="Area name" />
                        ) : <span className="truncate flex-1">{area.name}</span>}
                        <span style={S_DIM}>{Math.round(area.opacity * 100)}%</span>
                        {isDM && isEditMode && <button onClick={() => deleteArea(area.id)} className="p-0.5 hover:bg-[#2A1A1A]" style={S_RED} title="Delete area"><Trash2 size={8} /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeZone.walls && activeZone.walls.length > 0 && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>WALLS ({activeZone.walls.length})</div>
                  <div className="space-y-1">
                    {activeZone.walls.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[9px]" style={S_SUBTLE}>
                        <Square size={8} style={{ color: "#7A7A8B", opacity: 0.6 }} />
                        <span style={{ color: "#8A8A9B", fontFamily: "'Courier New', monospace" }}>({w[0].toFixed(0)},{w[1].toFixed(0)}) → ({w[2].toFixed(0)},{w[3].toFixed(0)})</span>
                        {isDM && isEditMode && <button onClick={() => deleteWall(idx)} className="p-0.5 hover:bg-[#2A1A1A] ml-auto" style={S_RED}><Trash2 size={8} /></button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isDM && isEditMode && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  {activeZone.editorVariant === "building" && (
                    <div className="mb-3 pb-3" style={{ borderBottom: "1px solid #1A1A4B" }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[9px]" style={S_SECTION_HDR}>BUILDING SHELL</div>
                        <span className="text-[8px]" style={S_DIM}>{activeZone.buildingShell.points.length} corners</span>
                      </div>
                      <div className="flex gap-1 flex-wrap mb-2">
                        {PIN_COLORS.map((color) => (
                          <button key={color} onClick={() => setZones((previous) => previous.map((zone) => zone.id === activeZone.id ? { ...zone, buildingShell: { ...zone.buildingShell, color } } : zone))} className="w-4 h-4" style={{ background: color, border: activeZone.buildingShell.color === color ? "2px solid #FFF" : "1px solid #2A2A5B" }} title={`Shell color ${color}`} />
                        ))}
                      </div>
                      <label className="text-[8px] flex items-center gap-2 mb-1" style={S_MUTED}>Fill
                        <input type="range" min="0.05" max="0.6" step="0.05" value={activeZone.buildingShell.opacity} onChange={(event) => setZones((previous) => previous.map((zone) => zone.id === activeZone.id ? { ...zone, buildingShell: { ...zone.buildingShell, opacity: Number(event.target.value) } } : zone))} className="flex-1" />
                        <span className="w-7 text-right" style={S_DIM}>{Math.round(activeZone.buildingShell.opacity * 100)}%</span>
                      </label>
                      <label className="text-[8px] flex items-center gap-2 mb-2" style={S_MUTED}>Walls
                        <input type="range" min="1" max="14" step="1" value={activeZone.buildingShell.wallWidth} onChange={(event) => setZones((previous) => previous.map((zone) => zone.id === activeZone.id ? { ...zone, buildingShell: { ...zone.buildingShell, wallWidth: Number(event.target.value) } } : zone))} className="flex-1" />
                        <span className="w-7 text-right" style={S_DIM}>{activeZone.buildingShell.wallWidth}px</span>
                      </label>
                      <div className="flex gap-1">
                        <button onClick={() => { setShellMode(true); setShellPoints([]); setLinkMode(false); setWallMode(false); setAreaMode(false); setPointConnectMode(false); setPointConnectSource(null); }} className={`${retro.button} flex-1 px-2 py-1 text-[9px] flex items-center justify-center gap-1`} style={{ color: shellMode ? activeZone.buildingShell.color : "#FFB35A" }}><Building2 size={10} /> Redraw</button>
                        <button onClick={resetBuildingShell} className={`${retro.button} p-1.5`} style={S_MUTED} title="Reset to rectangular shell"><RotateCcw size={10} /></button>
                      </div>
                    </div>
                  )}
                  <div className="text-[9px] mb-1.5" style={S_SECTION_HDR}>DRAW STYLE</div>
                  <div className="flex gap-1 flex-wrap mb-2">
                    {PIN_COLORS.map((color) => (
                      <button key={color} onClick={() => setDrawColor(color)} className="w-4 h-4" style={{ background: color, border: drawColor === color ? "2px solid #FFF" : "1px solid #2A2A5B" }} title={`Draw with ${color}`} />
                    ))}
                  </div>
                  <label className="text-[8px] flex items-center gap-2 mb-1" style={S_MUTED}>
                    Opacity
                    <input type="range" min="0.05" max="0.9" step="0.05" value={drawOpacity} onChange={(event) => setDrawOpacity(Number(event.target.value))} className="flex-1" />
                    <span className="w-7 text-right" style={S_DIM}>{Math.round(drawOpacity * 100)}%</span>
                  </label>
                  <label className="text-[8px] flex items-center gap-2 mb-2" style={S_MUTED}>
                    Line width
                    <input type="range" min="1" max="12" step="1" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} className="flex-1" />
                    <span className="w-7 text-right" style={S_DIM}>{lineWidth}px</span>
                  </label>
                  <div className="text-[8px] mb-1" style={S_MUTED}>Line shape</div>
                  <div className="grid grid-cols-2 gap-1 p-0.5 mb-2" style={{ background: "#070724", border: "1px solid #1A1A4B" }}>
                    <button onClick={() => setLineCurve(0)} className="px-2 py-1 text-[9px] flex items-center justify-center gap-1" style={{ color: lineCurve === 0 ? "#E0E8FF" : "#687394", background: lineCurve === 0 ? "#19194B" : "transparent", border: lineCurve === 0 ? "1px solid #4A7BFF77" : "1px solid transparent" }}><Minus size={9} /> Straight</button>
                    <button onClick={() => setLineCurve((curve) => curve === 0 ? 28 : curve)} className="px-2 py-1 text-[9px] flex items-center justify-center gap-1" style={{ color: lineCurve !== 0 ? "#FFF1C4" : "#687394", background: lineCurve !== 0 ? "#30260D" : "transparent", border: lineCurve !== 0 ? "1px solid #FFD34A77" : "1px solid transparent" }}><Spline size={9} /> Curve</button>
                  </div>
                  {lineCurve !== 0 && <label className="text-[8px] flex items-center gap-2 mb-2" style={S_MUTED}>Bend
                    <input type="range" min="-50" max="50" step="1" value={lineCurve} onChange={(event) => setLineCurve(Number(event.target.value))} className="flex-1" />
                    <span className="w-7 text-right" style={S_DIM}>{lineCurve}</span>
                  </label>}
                  <button onClick={() => setLineDashed((value) => !value)} className={`${retro.button} px-2 py-1 text-[9px] flex items-center gap-1 mb-3`} style={{ color: lineDashed ? "#4AFFFF" : "#5A6A8A" }}>
                    <Minus size={9} /> {lineDashed ? "Dashed line" : "Solid line"}
                  </button>
                  <div className="text-[9px] mb-1.5" style={S_SECTION_HDR}>BACKGROUND</div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <button
                      onClick={() => setZones(prev => prev.map(z => z.id !== activeZone.id ? z : { ...z, useMapBg: !z.useMapBg }))}
                      className={`${retro.button} px-2 py-1 text-[9px] flex items-center gap-1`}
                      style={{ color: activeZone.useMapBg ? "#4AFF4A" : "#5A6A8A" }}
                    >
                      <Layers size={9} /> Map Style
                    </button>
                    <span className="text-[8px]" style={S_DIM}>{activeZone.useMapBg ? "Procedural map background" : "Image background"}</span>
                  </div>
                  {!activeZone.useMapBg && (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={activeZone.image}
                        onChange={e => updateZoneImage(activeZone.id, e.target.value)}
                        className="flex-1 px-2 py-1 text-[9px] outline-none min-w-0"
                        style={{ ...SUNKEN_INPUT, color: "#8A9ABB", fontFamily: "'Courier New', monospace" }}
                        placeholder="Image URL..."
                      />
                      <button onClick={() => { const url = prompt("Paste image URL:"); if (url) updateZoneImage(activeZone.id, url); }} className={`${retro.button} px-2 py-1 text-[9px] shrink-0`} style={{ color: "#5A7ABB" }}><Image size={10} /></button>
                    </div>
                  )}
                </div>
              )}
              {activeZone.editorVariant !== "building" && <div className="flex-1 overflow-y-auto">
                {activeZone.pins.length === 0 && <div className="px-3 py-6 text-center"><MapPin size={20} style={{ color: "#1A1A4B", margin: "0 auto 8px" }} /><div className="text-[11px]" style={S_MUTED}>No places yet</div>{isDM && <div className="text-[9px] mt-1" style={S_DIM}>Enable Edit Mode to add places</div>}</div>}
                {activeZone.pins.map(pin => {
                  const isSel = selectedPinId === pin.id;
                  const connCount = activeZone.connections.filter(([a, b]) => a === pin.id || b === pin.id).length;
                  return (
                    <div key={pin.id} className="flex items-center gap-2 px-3 py-2 transition-colors" style={{ background: isSel ? `${pin.color}11` : "transparent", borderBottom: "1px solid #0E0E35", borderLeft: isSel ? `2px solid ${pin.color}` : "2px solid transparent" }}>
                      <button onClick={() => { setSelectedPinId(pin.id); setEditingPin(null); setIsNewPin(false); setPlaceImageDraft(""); }} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {renderIcon(pin.icon, 13, pin.color)}
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: isSel ? pin.color : "#C0D0F0" }}>{pin.name}</div>
                          <div className="text-[9px] truncate" style={S_MUTED}>{pin.description || pin.icon}{connCount > 0 && <span style={{ color: activeZone.color }}> · {connCount} path{connCount !== 1 ? "s" : ""}</span>}</div>
                        </div>
                      </button>
                      {isDM && isEditMode && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setEditingPin(pin); setIsNewPin(false); setPlaceImageDraft(""); }} className="p-1 hover:bg-[#1A1A4B]" style={S_ACCENT} title="Edit place"><Edit2 size={10} /></button>
                          <button onClick={() => deletePin(pin.id)} className="p-1 hover:bg-[#2A1A1A]" style={S_RED}><Trash2 size={10} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
              {activeZone.editorVariant === "building" && (
                <div className="flex-1 overflow-y-auto">
                  {activeZone.buildingSlots.length === 0 && (
                    <div className="px-3 py-6 text-center">
                      <Boxes size={20} style={{ color: "#2A2A4B", margin: "0 auto 8px" }} />
                      <div className="text-[11px]" style={S_MUTED}>No building slots yet</div>
                      {isDM && <div className="text-[9px] mt-1" style={S_DIM}>Enable Edit Mode to add slots</div>}
                    </div>
                  )}
                  {activeZone.buildingSlots.map((slot) => {
                    const meta = BUILDING_SLOT_KINDS[slot.kind];
                    const isSelected = selectedSlotId === slot.id;
                    return (
                      <div key={slot.id} className="flex items-center gap-2 px-3 py-2" style={{ background: isSelected ? `${meta.color}12` : "transparent", borderBottom: "1px solid #0E0E35", borderLeft: isSelected ? `2px solid ${meta.color}` : "2px solid transparent" }}>
                        <button onClick={() => { setSelectedSlotId(slot.id); setEditingSlot(null); setIsNewSlot(false); }} className="flex items-center gap-2 flex-1 text-left min-w-0">
                          <span className="w-6 h-6 shrink-0 flex items-center justify-center" style={{ color: meta.color, background: `${meta.color}16`, border: `1px ${slot.filled ? "solid" : "dashed"} ${meta.color}77` }}>{slot.filled ? <Building2 size={12} /> : <Boxes size={12} />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[11px] font-semibold truncate" style={{ color: isSelected ? meta.color : "#C0D0F0" }}>{slot.name}</span>
                            <span className="block text-[8px] truncate uppercase" style={S_MUTED}>{meta.label} · {slot.filled ? (slot.contents || "Filled") : "Empty"}</span>
                          </span>
                        </button>
                        {isDM && isEditMode && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => { setEditingSlot(slot); setIsNewSlot(false); setSelectedSlotId(slot.id); }} className="p-1 hover:bg-[#1A1A4B]" style={S_ACCENT} title="Edit slot"><Edit2 size={10} /></button>
                            <button onClick={() => deleteBuildingSlot(slot.id)} className="p-1 hover:bg-[#2A1A1A]" style={S_RED} title="Delete slot"><Trash2 size={10} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {activeZone.editorVariant === "building" && editingSlot && (
                <div className="px-3 py-3 max-h-[56vh] overflow-y-auto" style={{ borderTop: "1px solid #1A1A4B", background: "#0A0A2A" }}>
                  <div className="text-[11px] mb-2" style={{ color: BUILDING_SLOT_KINDS[editingSlot.kind].color }}>{isNewSlot ? "New Building Slot" : "Edit Building Slot"}</div>
                  <div className="space-y-2">
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Name</label><input type="text" value={editingSlot.name} onChange={(event) => setEditingSlot({ ...editingSlot, name: event.target.value })} className="w-full px-2 py-1 text-[11px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Slot type</label><select value={editingSlot.kind} onChange={(event) => {
                      const nextKind = event.target.value as BuildingSlotKind;
                      const currentDefaultName = `${BUILDING_SLOT_KINDS[editingSlot.kind].label} Slot`;
                      setEditingSlot({ ...editingSlot, kind: nextKind, name: editingSlot.name === currentDefaultName ? `${BUILDING_SLOT_KINDS[nextKind].label} Slot` : editingSlot.name });
                    }} className="w-full px-2 py-1 text-[10px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}>{(Object.keys(BUILDING_SLOT_KINDS) as BuildingSlotKind[]).map((kind) => <option key={kind} value={kind}>{BUILDING_SLOT_KINDS[kind].label}</option>)}</select></div>
                    <button onClick={() => setEditingSlot({ ...editingSlot, filled: !editingSlot.filled, contents: editingSlot.filled ? "" : editingSlot.contents })} className={`${retro.button} w-full px-2 py-1.5 text-[10px] flex items-center justify-center gap-1.5`} style={{ color: editingSlot.filled ? "#64D98B" : "#A0A8C0" }}>
                      {editingSlot.filled ? <Building2 size={11} /> : <Boxes size={11} />} {editingSlot.filled ? "Filled" : "Empty"}
                    </button>
                    {editingSlot.filled && <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Filled with</label><input type="text" value={editingSlot.contents} onChange={(event) => setEditingSlot({ ...editingSlot, contents: event.target.value })} className="w-full px-2 py-1 text-[10px] outline-none" style={{ ...SUNKEN_INPUT, color: "#E0E8FF" }} placeholder="Workshop, refinery, apartments..." /></div>}
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Description</label><textarea value={editingSlot.description} rows={2} onChange={(event) => setEditingSlot({ ...editingSlot, description: event.target.value })} className="w-full px-2 py-1 text-[10px] outline-none resize-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px]" style={S_MUTED}>Width<input type="range" min="72" max="300" step="4" value={editingSlot.width} onChange={(event) => setEditingSlot({ ...editingSlot, width: Number(event.target.value) })} className="w-full mt-1" /><span className="block text-right" style={S_DIM}>{editingSlot.width}px</span></label>
                      <label className="text-[9px]" style={S_MUTED}>Height<input type="range" min="48" max="220" step="4" value={editingSlot.height} onChange={(event) => setEditingSlot({ ...editingSlot, height: Number(event.target.value) })} className="w-full mt-1" /><span className="block text-right" style={S_DIM}>{editingSlot.height}px</span></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px]" style={S_MUTED}>Horizontal<input type="number" min="0" max="100" step="0.5" value={Number(editingSlot.x.toFixed(1))} onChange={(event) => setEditingSlot({ ...editingSlot, x: Math.max(0, Math.min(100, Number(event.target.value))) })} className="w-full px-2 py-1 mt-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></label>
                      <label className="text-[9px]" style={S_MUTED}>Vertical<input type="number" min="0" max="100" step="0.5" value={Number(editingSlot.y.toFixed(1))} onChange={(event) => setEditingSlot({ ...editingSlot, y: Math.max(0, Math.min(100, Number(event.target.value))) })} className="w-full px-2 py-1 mt-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveBuildingSlot} disabled={!editingSlot.name.trim()} className={`${retro.button} flex-1 px-3 py-1.5 text-[10px] flex items-center justify-center gap-1 disabled:opacity-40`} style={S_GREEN_BTN}><Save size={10} /> Save</button>
                      <button onClick={() => { setEditingSlot(null); setIsNewSlot(false); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED} title="Cancel"><X size={10} /></button>
                    </div>
                  </div>
                </div>
              )}
              {activeZone.editorVariant === "building" && selectedSlot && !editingSlot && (() => {
                const meta = BUILDING_SLOT_KINDS[selectedSlot.kind];
                return (
                  <div className="px-3 py-3" style={{ borderTop: `1px solid ${meta.color}44`, background: `${meta.color}08` }}>
                    <div className="flex items-center gap-2 mb-2">{selectedSlot.filled ? <Building2 size={14} style={{ color: meta.color }} /> : <Boxes size={14} style={{ color: meta.color }} />}<span className="text-[12px] font-semibold" style={{ color: meta.color }}>{selectedSlot.name}</span><span className="ml-auto text-[8px]" style={S_MUTED}>{selectedSlot.filled ? "FILLED" : "EMPTY"}</span></div>
                    <div className="text-[9px] uppercase mb-1.5" style={{ color: meta.color }}>{meta.label}</div>
                    {selectedSlot.filled && <div className="mb-1.5"><div className="text-[9px]" style={S_MUTED}>Filled with</div><div className="text-[11px]" style={S_TEXT}>{selectedSlot.contents || "Not specified"}</div></div>}
                    {selectedSlot.description && <div className="mb-2"><div className="text-[9px]" style={S_MUTED}>Description</div><div className="text-[10px]" style={S_TEXT}>{selectedSlot.description}</div></div>}
                    <div className="flex gap-4"><div><div className="text-[9px]" style={S_MUTED}>Position</div><div className="text-[9px]" style={S_DIM}>{selectedSlot.x.toFixed(1)}, {selectedSlot.y.toFixed(1)}</div></div><div><div className="text-[9px]" style={S_MUTED}>Size</div><div className="text-[9px]" style={S_DIM}>{selectedSlot.width} x {selectedSlot.height}</div></div></div>
                  </div>
                );
              })()}
              {activeZone.editorVariant !== "building" && editingPin && (
                <div className="px-3 py-3" style={{ borderTop: "1px solid #1A1A4B", background: "#0A0A2A" }}>
                  <div className="text-[11px] mb-2" style={S_ACCENT_HDR}>{isNewPin ? "New Place" : "Edit Place"}</div>
                  <div className="space-y-2">
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Name</label><input type="text" value={editingPin.name} onChange={e => setEditingPin({ ...editingPin, name: e.target.value })} className="w-full px-2 py-1 text-[11px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Subtitle</label><input type="text" value={editingPin.subtitle} onChange={e => setEditingPin({ ...editingPin, subtitle: e.target.value })} className="w-full px-2 py-1 text-[10px] outline-none" style={{ ...SUNKEN_INPUT, color: "#AAB8D8" }} /></div>
                    <div className="flex gap-2">
                      <div className="flex-1"><label className="text-[9px] block mb-0.5" style={S_MUTED}>Icon</label><select value={editingPin.icon} onChange={e => setEditingPin({ ...editingPin, icon: e.target.value })} className="w-full px-1 py-1 text-[10px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}>{ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></div>
                      <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Color</label><div className="flex gap-1 flex-wrap">{PIN_COLORS.map(c => <button key={c} onClick={() => setEditingPin({ ...editingPin, color: c })} className="w-4 h-4 transition-transform" style={{ background: c, border: editingPin.color === c ? "2px solid #FFF" : "1px solid #2A2A5B", transform: editingPin.color === c ? "scale(1.2)" : "scale(1)" }} />)}</div></div>
                    </div>
                    <div className="space-y-1.5 p-2" style={{ border: "1px solid #1A2D52", background: "#080824" }}>
                      <div className="text-[9px]" style={S_MUTED}>Compact marker</div>
                      <select value={editingPin.compactDisplay} onChange={(event) => setEditingPin({ ...editingPin, compactDisplay: event.target.value as CompactPlaceDisplay })} className="w-full px-2 py-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}>
                        <option value="auto">Automatic: symbol, title, then abbreviation</option>
                        <option value="title">Title</option>
                        <option value="abbreviation">Abbreviation</option>
                        <option value="symbol">Custom symbol</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[8px]" style={S_MUTED}>Abbreviation
                          <input type="text" maxLength={8} value={editingPin.abbreviation} onChange={(event) => setEditingPin({ ...editingPin, abbreviation: event.target.value })} placeholder={getPlaceAbbreviation(editingPin.name)} className="w-full px-2 py-1 mt-0.5 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} />
                        </label>
                        <label className="text-[8px]" style={S_MUTED}>Custom symbol
                          <input type="text" maxLength={4} value={editingPin.symbol} onChange={(event) => setEditingPin({ ...editingPin, symbol: event.target.value })} placeholder="e.g. *" className="w-full px-2 py-1 mt-0.5 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} />
                        </label>
                      </div>
                    </div>
                    <label className="text-[9px] block" style={S_MUTED}>Box size
                      <input type="range" min="64" max="280" step="4" value={editingPin.width} onChange={(event) => { const size = Number(event.target.value); setEditingPin({ ...editingPin, width: size, height: size }); }} className="w-full mt-1" />
                      <span className="block text-right" style={S_DIM}>{editingPin.width}px square</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px]" style={S_MUTED}>Horizontal position
                        <input type="number" min="0" max="100" step="0.5" value={Number(editingPin.x.toFixed(1))} onChange={(event) => setEditingPin({ ...editingPin, x: Math.max(0, Math.min(100, Number(event.target.value))) })} className="w-full px-2 py-1 mt-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} />
                      </label>
                      <label className="text-[9px]" style={S_MUTED}>Vertical position
                        <input type="number" min="0" max="100" step="0.5" value={Number(editingPin.y.toFixed(1))} onChange={(event) => setEditingPin({ ...editingPin, y: Math.max(0, Math.min(100, Number(event.target.value))) })} className="w-full px-2 py-1 mt-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} />
                      </label>
                    </div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Description</label><textarea value={editingPin.description} rows={2} onChange={e => setEditingPin({ ...editingPin, description: e.target.value })} className="w-full px-2 py-1 text-[10px] outline-none resize-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] block" style={S_MUTED}>Thumbnail</label>
                      {editingPin.thumbnailUrl && <ImageWithFallback src={editingPin.thumbnailUrl} alt={`${editingPin.name} thumbnail`} className="w-16 h-16 object-cover" style={{ border: `1px solid ${editingPin.color}66` }} />}
                      <input
                        type="url"
                        value={editingPin.thumbnailUrl.startsWith("data:") ? "" : editingPin.thumbnailUrl}
                        onChange={(event) => setEditingPin({ ...editingPin, thumbnailUrl: event.target.value })}
                        className="w-full px-2 py-1 text-[9px] outline-none"
                        style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}
                        placeholder={editingPin.thumbnailUrl.startsWith("data:") ? "Uploaded thumbnail" : "Thumbnail image URL"}
                      />
                      <div className="flex flex-wrap gap-1">
                        <label className={`${retro.button} px-2 py-1 text-[9px] flex items-center gap-1 cursor-pointer`} style={S_ACCENT}>
                          <ImagePlus size={10} /> {placeThumbnailBusy ? "Preparing..." : "Upload"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={placeThumbnailBusy} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void handlePlaceThumbnailFile(file); }} />
                        </label>
                        {editingPin.images[0] && <button onClick={() => setEditingPin({ ...editingPin, thumbnailUrl: editingPin.images[0] })} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_SUBTLE}>Use first image</button>}
                        {editingPin.thumbnailUrl && <button onClick={() => setEditingPin({ ...editingPin, thumbnailUrl: "" })} className={`${retro.button} px-2 py-1 text-[9px]`} style={S_RED}>Clear</button>}
                      </div>
                      <div className="text-[8px] leading-relaxed" style={S_DIM}>Recommended: square 1:1 image, 512 x 512 px, JPG, PNG, or WebP; source files may be up to 12 MB. Uploads are center-cropped and resized automatically.</div>
                    </div>
                    <div>
                      <label className="text-[9px] block mb-1" style={S_MUTED}>Images</label>
                      {editingPin.images.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 mb-1.5">
                          {editingPin.images.map((imageUrl, index) => (
                            <div key={`${imageUrl}-${index}`} className="relative h-12" style={{ border: "1px solid #2A2A5B" }}>
                              <ImageWithFallback src={imageUrl} alt={`${editingPin.name} ${index + 1}`} className="w-full h-full object-cover" />
                              <button onClick={() => setEditingPin({ ...editingPin, images: editingPin.images.filter((_, imageIndex) => imageIndex !== index) })} className="absolute top-0 right-0 p-0.5" style={{ background: "rgba(20,5,10,0.9)", color: "#FF6A6A" }} title="Remove image"><X size={9} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <input type="url" value={placeImageDraft} onChange={(event) => setPlaceImageDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEditingPinImage(); } }} className="flex-1 min-w-0 px-2 py-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} placeholder="Image URL" />
                        <button onClick={addEditingPinImage} disabled={!placeImageDraft.trim()} className={`${retro.button} p-1.5 disabled:opacity-40`} style={S_ACCENT} title="Add image"><ImagePlus size={11} /></button>
                      </div>
                    </div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Wiki article</label><select value={editingPin.wikiPageId || ""} onChange={(event) => setEditingPin({ ...editingPin, wikiPageId: event.target.value || undefined })} className="w-full px-2 py-1 text-[9px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}><option value="">No wiki link</option>{wikiPages.map((page) => <option key={page.id} value={page.id}>{page.title || page.name || page.id}</option>)}</select></div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Notes</label><textarea value={editingPin.notes} rows={2} onChange={e => setEditingPin({ ...editingPin, notes: e.target.value })} className="w-full px-2 py-1 text-[10px] outline-none resize-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div className="flex gap-2">
                      <button onClick={savePin} className={`${retro.button} flex-1 px-3 py-1.5 text-[10px] flex items-center justify-center gap-1`} style={S_GREEN_BTN}><Save size={10} /> Save</button>
                      <button onClick={() => { setEditingPin(null); setIsNewPin(false); setPlaceImageDraft(""); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}><X size={10} /></button>
                    </div>
                  </div>
                </div>
              )}
              {activeZone.editorVariant !== "building" && selectedPin && !editingPin && (
                <div className="px-3 py-3" style={{ borderTop: `1px solid ${selectedPin.color}22`, background: `${selectedPin.color}06` }}>
                  <div className="flex items-center gap-2 mb-2">{renderIcon(selectedPin.icon, 14, selectedPin.color)}<span className="text-[12px] font-semibold" style={{ color: selectedPin.color }}>{selectedPin.name}</span></div>
                  {selectedPin.subtitle && <div className="text-[9px] mb-2" style={S_MUTED}>{selectedPin.subtitle}</div>}
                  {selectedPin.images.length > 0 && <div className="grid grid-cols-3 gap-1 mb-2">{selectedPin.images.slice(0, 6).map((imageUrl, index) => <ImageWithFallback key={`${imageUrl}-${index}`} src={imageUrl} alt={`${selectedPin.name} ${index + 1}`} className="w-full h-14 object-cover" />)}</div>}
                  {selectedPin.description && <div className="mb-1.5"><div className="text-[9px]" style={S_MUTED}>Description</div><div className="text-[11px]" style={S_TEXT}>{selectedPin.description}</div></div>}
                  {selectedPin.notes && <div className="mb-1.5"><div className="text-[9px]" style={S_MUTED}>Notes</div><div className="text-[10px] italic" style={S_SUBTLE}>{selectedPin.notes}</div></div>}
                  {(selectedPlaceMapExists || selectedBuildingMapExists || (isDM && isEditMode)) && <div className="grid grid-cols-2 gap-1 mb-2">
                    {(selectedPlaceMapExists || (isDM && isEditMode)) && <button onClick={() => createOrOpenPlaceMap(selectedPin, "places")} className={`${retro.button} px-2 py-1 text-[9px] flex items-center justify-center gap-1`} style={{ color: selectedPin.color }}><MapPinned size={10} /> {selectedPlaceMapExists ? "Open Place Map" : "Create Place Map"}</button>}
                    {(selectedBuildingMapExists || (isDM && isEditMode)) && <button onClick={() => createOrOpenPlaceMap(selectedPin, "building")} className={`${retro.button} px-2 py-1 text-[9px] flex items-center justify-center gap-1`} style={{ color: "#FFB35A" }}><Building2 size={10} /> {selectedBuildingMapExists ? "Open Building" : "Create Building"}</button>}
                  </div>}
                  {selectedPin.wikiPageId && <button onClick={() => navigate(`/interface/inet-page/${selectedPin.wikiPageId}`)} className={`${retro.button} px-2 py-1 text-[9px] flex items-center gap-1 mb-2`} style={S_ACCENT}><BookOpen size={10} /> Open Wiki</button>}
                  <div className="flex gap-4">
                    <div><div className="text-[9px]" style={S_MUTED}>Coordinates</div><div className="text-[10px]" style={{ color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>{selectedPin.x.toFixed(1)}, {selectedPin.y.toFixed(1)}</div></div>
                    <div><div className="text-[9px]" style={S_MUTED}>Connections</div><div className="text-[10px]" style={{ color: activeZone.color }}>{activeZone.connections.filter(([a, b]) => a === selectedPin.id || b === selectedPin.id).length} path(s)</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
