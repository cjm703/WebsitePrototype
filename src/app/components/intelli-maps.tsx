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
  ZoomIn, ZoomOut, Maximize2, Image, Square, Grid3x3,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { safeGetItem, safeGetJson } from "./safe-storage";
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

interface MapPin_t { id: string; name: string; x: number; y: number; icon: string; color: string; description: string; notes: string; }

interface MapZone {
  id: string; name: string; subtitle: string; color: string; image: string;
  pins: MapPin_t[]; fogMode: FogMode; connections: [string, string][]; sectorNumber: number;
  walls: [number, number, number, number][]; // [x1,y1,x2,y2] in % coordinates
  useMapBg?: boolean; // true = use procedural map-style background instead of image
  revealed?: boolean;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  pin: MapPin, skull: Skull, shield: Shield, home: Home,
  landmark: Landmark, trees: Trees, anchor: Anchor,
  flame: Flame, alert: AlertTriangle, crosshair: Crosshair,
  eye: Eye, navigation: Navigation,
};
const ICON_OPTIONS = Object.keys(ICON_MAP);
const PIN_COLORS = ["#4A7BFF","#FF6A6A","#4AFF4A","#FFAA4A","#FF4AFF","#4AFFFF","#FFD700","#FF69B4","#7B68EE","#20B2AA"];

const DEFAULT_OUTER_IMG = "https://images.unsplash.com/photo-1636418557948-83835508836b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwdW5kZXJncm91bmQlMjBjYXZlcm4lMjBydWlucyUyMGFlcmlhbHxlbnwxfHx8fDE3NzM4NzI0ODN8MA&ixlib=rb-4.1.0&q=80&w=1080";
const DEFAULT_OUTER_IMG2 = "https://images.unsplash.com/photo-1711211788461-34d6d7175068?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwc3RvbmUlMjBmb3J0cmVzcyUyMHdhc3RlbGFuZCUyMGFlcmlhbHxlbnwxfHx8fDE3NzM4NzI0ODN8MA&ixlib=rb-4.1.0&q=80&w=1080";

function buildDefaultZones(): MapZone[] {
  const innerZones: MapZone[] = SECTORS.map(s => ({
    id: s.id, name: s.name, subtitle: s.subtitle, color: s.color, image: s.image,
    sectorNumber: s.number, fogMode: "visible" as FogMode, connections: [], walls: [],
    pins: s.number === 0
      ? [
          { id: "council", name: "Council Chamber", x: 45, y: 40, icon: "landmark", color: "#FFD700", description: "Where the Deep Council convenes", notes: "All 15 sector representatives attend." },
          { id: "nexus-well", name: "The Nexus Well", x: 55, y: 60, icon: "eye", color: "#4A7BFF", description: "Ancient scrying pool at the city's heart", notes: "Rumored to show visions of the surface." },
        ]
      : s.number === 1 ? [{ id: "obsidian-manor", name: "House Velathorn", x: 40, y: 35, icon: "home", color: "#7B68EE", description: "Most powerful noble house", notes: "Controls the obsidian trade." }]
      : s.number === 2 ? [{ id: "great-forge", name: "The Great Forge", x: 55, y: 45, icon: "flame", color: "#FF6A4A", description: "City's primary weapons forge", notes: "Burns day and night." }]
      : s.number === 3 ? [{ id: "spore-fields", name: "Spore Fields", x: 35, y: 55, icon: "trees", color: "#4AFF4A", description: "Vast bioluminescent mushroom farms", notes: "Primary food source for the city." }]
      : s.number === 5 ? [{ id: "north-gate", name: "The Spire Gate", x: 50, y: 30, icon: "shield", color: "#4AFFFF", description: "Main northern entrance", notes: "Most heavily fortified gate." }]
      : s.number === 9 ? [{ id: "pit-fights", name: "The Bone Pit", x: 50, y: 50, icon: "skull", color: "#CD853F", description: "Underground fighting arena", notes: "Bets placed in teeth and bone chips." }]
      : s.number === 12 ? [{ id: "warden", name: "Warden's Office", x: 40, y: 30, icon: "shield", color: "#708090", description: "Head jailer's quarters", notes: "Holds the master key ring." }]
      : s.number === 13 ? [{ id: "pale-ward", name: "Warding Glyphs", x: 50, y: 45, icon: "alert", color: "#8B5CF6", description: "Ancient protective runes line the ring", notes: "None may pass without the Council's mark." }]
      : [],
  }));

  // Build outer subsector zones from pre-computed data
  const outerZones: MapZone[] = [];
  OUTER_SECTORS_V2.forEach((sector, si) => {
    const subData = OUTER_SECTOR_SUBS[si];
    subData.labels.forEach((sub, idx) => {
      outerZones.push({
        id: `os-${sub.label}`,
        name: `Sector ${sub.label}`,
        subtitle: sector.name,
        color: sector.color,
        image: idx % 2 === 0 ? DEFAULT_OUTER_IMG : DEFAULT_OUTER_IMG2,
        sectorNumber: sector.id,
        fogMode: "visible" as FogMode,
        connections: [],
        walls: [],
        pins: [],
      });
    });
  });

  return [...innerZones, ...outerZones];
}

function migrateZone(z: any): MapZone {
  let fogMode: FogMode = "visible";
  if (z.fogMode && (z.fogMode === "visible" || z.fogMode === "locked" || z.fogMode === "invisible")) {
    fogMode = z.fogMode;
  } else if (typeof z.revealed === "boolean") {
    fogMode = z.revealed ? "visible" : "invisible";
  }
  return { ...z, fogMode, connections: z.connections ?? [], walls: z.walls ?? [], sectorNumber: z.sectorNumber ?? 0, useMapBg: z.useMapBg ?? false };
}

const INTELLI_MAPS_STORAGE_KEY = "inet-map-hexcity-v3";

function buildDefaultMapZones(): MapZone[] {
  return buildDefaultZones();
}

function readLegacyZones(): { zones: MapZone[]; hasAny: boolean } {
  const saved = safeGetJson<any[]>(INTELLI_MAPS_STORAGE_KEY, []);
  const defaults = buildDefaultMapZones();
  if (!Array.isArray(saved) || saved.length === 0) {
    return { zones: defaults, hasAny: false };
  }
  const migrated = saved.map(migrateZone);
  const existingIds = new Set(migrated.map((zone) => zone.id));
  const missing = defaults.filter((zone) => !existingIds.has(zone.id));
  return { zones: missing.length > 0 ? [...migrated, ...missing] : migrated, hasAny: true };
}

function normalizeZones(raw: unknown, fallback: MapZone[] = buildDefaultMapZones()): MapZone[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const defaults = buildDefaultMapZones();
  const migrated = raw.map(migrateZone);
  const existingIds = new Set(migrated.map((zone) => zone.id));
  const missing = defaults.filter((zone) => !existingIds.has(zone.id));
  return missing.length > 0 ? [...migrated, ...missing] : migrated;
}

/* ==============================================================
   COMPONENT
   ============================================================== */

export function IntelliMaps() {
  const navigate = useNavigate();
  const [currentUser] = useState<string>(() => safeGetItem("inet-user") || "Agent Phoenix");
  const [zones, setZones] = useState<MapZone[]>(buildDefaultMapZones);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPin, setEditingPin] = useState<MapPin_t | null>(null);
  const [isNewPin, setIsNewPin] = useState(false);
  const [zoomTransition, setZoomTransition] = useState(false);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [hoveredOuterSub, setHoveredOuterSub] = useState<string | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const [wallStart, setWallStart] = useState<[number, number] | null>(null);
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

  const [mapZoom, setMapZoom] = useState(2);
  const [mapPan, setMapPan] = useState<[number, number]>([0, 0]);
  const [hasInitializedPan, setHasInitializedPan] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const panStart = useRef<[number, number]>([0, 0]);
  const panOrigin = useRef<[number, number]>([0, 0]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const DRAG_THRESHOLD = 4;
  const wasDraggingRef = useRef(false);

  const MIN_ZOOM = 0.8;
  const MAX_ZOOM = 6;

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
    if (activeZone && isEditMode && isDM && !linkMode && !wallMode) return;
    setIsPanning(true);
    setIsDragging(false);
    panStart.current = [e.clientX, e.clientY];
    panOrigin.current = mapPan;
  }, [mapPan, activeZone, isEditMode, isDM, linkMode, wallMode]);

  const handlePanMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
  }, [isPanning, isDragging, mapZoom]);

  const handlePanEnd = useCallback(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
      requestAnimationFrame(() => { wasDraggingRef.current = false; });
    }
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
      const fallbackZones = buildDefaultMapZones();
      const legacy = readLegacyZones();
      try {
        setMapsLoading(true);
        setMapsError(null);
        const remoteZones = await appStore.loadIntelliMapsState<MapZone[]>(fallbackZones);
        const remoteUsedFallback = remoteZones === fallbackZones;
        const normalizedRemote = normalizeZones(remoteZones, fallbackZones);
        if (cancelled) return;

        if (remoteUsedFallback && legacy.hasAny) {
          setZones(legacy.zones);
          hasLoadedMapsRef.current = true;
          void appStore.saveIntelliMapsState<MapZone[]>(legacy.zones).catch((err) => {
            console.warn("Failed to import legacy Intelli Maps state", err);
          });
          return;
        }

        setZones(normalizedRemote);
        hasLoadedMapsRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setMapsError(err instanceof Error ? err.message : "Failed to load Intelli Maps state");
          setZones(legacy.hasAny ? legacy.zones : fallbackZones);
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
    if (!hasLoadedMapsRef.current) return;
    const timeout = window.setTimeout(() => {
      appStore.saveIntelliMapsState<MapZone[]>(zones).catch((err) => {
        console.warn("Failed to save Intelli Maps state", err);
        setMapsError(err instanceof Error ? err.message : "Failed to save Intelli Maps state");
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [zones]);

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
      setSelectedPinId(null); setEditingPin(null); setIsNewPin(false);
      setLinkMode(false); setLinkSource(null); setWallMode(false); setWallStart(null);
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, [zones, isDM, showFog]);

  const handleGateClick = useCallback((gateId: string) => {
    setZoomTransition(true);
    setTimeout(() => {
      setActiveGateId(gateId);
      setActiveZoneId(null);
      setSelectedPinId(null); setEditingPin(null); setIsNewPin(false);
      setLinkMode(false); setLinkSource(null);
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, []);

  const handleBackToWorld = useCallback(() => {
    setZoomTransition(true);
    setTimeout(() => {
      setActiveZoneId(null); setActiveGateId(null); setSelectedPinId(null); setEditingPin(null);
      setIsNewPin(false); setLinkMode(false); setLinkSource(null); setWallMode(false); setWallStart(null);
      setMapZoom(1); setMapPan([0, 0]);
      setTimeout(() => setZoomTransition(false), 50);
    }, 300);
  }, []);

  const handlePinClickForLink = useCallback((pinId: string) => {
    if (!linkMode || !activeZoneId) return;
    if (!linkSource) { setLinkSource(pinId); return; }
    if (linkSource === pinId) { setLinkSource(null); return; }
    setZones(prev => prev.map(z => {
      if (z.id !== activeZoneId) return z;
      const exists = z.connections.some(([a, b]) => (a === linkSource && b === pinId) || (a === pinId && b === linkSource));
      if (exists) return { ...z, connections: z.connections.filter(([a, b]) => !((a === linkSource && b === pinId) || (a === pinId && b === linkSource))) };
      return { ...z, connections: [...z.connections, [linkSource!, pinId] as [string, string]] };
    }));
    setLinkSource(null);
  }, [linkMode, linkSource, activeZoneId]);

  const savePin = useCallback(() => {
    if (!editingPin || !activeZoneId) return;
    setZones(prev => prev.map(z => {
      if (z.id !== activeZoneId) return z;
      const existing = z.pins.find(p => p.id === editingPin.id);
      if (existing) return { ...z, pins: z.pins.map(p => p.id === editingPin.id ? editingPin : p) };
      return { ...z, pins: [...z.pins, editingPin] };
    }));
    setEditingPin(null); setIsNewPin(false); setSelectedPinId(editingPin.id);
  }, [editingPin, activeZoneId]);

  const deletePin = useCallback((pinId: string) => {
    if (!activeZoneId) return;
    setZones(prev => prev.map(z => {
      if (z.id !== activeZoneId) return z;
      return { ...z, pins: z.pins.filter(p => p.id !== pinId), connections: z.connections.filter(([a, b]) => a !== pinId && b !== pinId) };
    }));
    if (selectedPinId === pinId) setSelectedPinId(null);
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

  const renderConnectionLines = (zone: MapZone) => {
    if (!showPaths || zone.connections.length === 0) return null;
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5]">
        <defs>
          <filter id="pathGlow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {zone.connections.map(([aId, bId], idx) => {
          const pinA = zone.pins.find(p => p.id === aId);
          const pinB = zone.pins.find(p => p.id === bId);
          if (!pinA || !pinB) return null;
          return (
            <g key={`${aId}-${bId}-${idx}`} filter="url(#pathGlow)">
              <line x1={`${pinA.x}%`} y1={`${pinA.y}%`} x2={`${pinB.x}%`} y2={`${pinB.y}%`} stroke={zone.color} strokeWidth="1.5" strokeDasharray="6 4" strokeOpacity="0.5" />
              <line x1={`${pinA.x}%`} y1={`${pinA.y}%`} x2={`${pinB.x}%`} y2={`${pinB.y}%`} stroke={zone.color} strokeWidth="0.5" strokeOpacity="0.8" />
            </g>
          );
        })}
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

    if (wallMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (!wallStart) {
        setWallStart([x, y]);
      } else {
        const newWall: [number, number, number, number] = [wallStart[0], wallStart[1], x, y];
        setZones(prev => prev.map(z => z.id !== activeZone.id ? z : { ...z, walls: [...z.walls, newWall] }));
        setWallStart(null);
      }
      return;
    }

    if (linkMode) return;

    // Default: place pin
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setEditingPin({ id: `pin-${Date.now()}`, name: "New Location", x, y, icon: "pin", color: "#4A7BFF", description: "", notes: "" });
    setIsNewPin(true);
  }, [isDM, isEditMode, activeZone, linkMode, isPanning, wallMode, wallStart]);

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
                      stroke={isSel ? color : isHov ? color : "none"}
                      strokeWidth={isSel ? "2" : "1"}
                      strokeOpacity={isSel ? 0.7 : isHov ? 0.35 : 0}
                      filter={isHov || isSel ? "url(#sectorGlow)" : undefined}
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
    const locked = zones.filter(z => z.fogMode === "locked").length;
    const invisible = zones.filter(z => z.fogMode === "invisible").length;
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
              <span className="text-[11px]" style={{ color: activeZone.color }}>{activeZone.id.startsWith("os-") ? activeZone.name : `Sector ${activeZone.sectorNumber}`}</span>
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
              <button onClick={() => { setIsEditMode(!isEditMode); if (isEditMode) { setLinkMode(false); setLinkSource(null); setWallMode(false); setWallStart(null); } }} className="text-[10px] px-2 py-0.5 hover:opacity-80" style={{ color: isEditMode ? "#FF6A6A" : "#4A7BFF", border: "1px solid #2A2A5B", background: "#0E0E35" }}>
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
                <button onClick={handleBackToWorld} className={`${retro.button} px-3 py-1 text-[11px] flex items-center gap-1.5`} style={S_TEXT}><CornerUpLeft size={12} /> City Map</button>
              )}
              <div>
                <h1 className="text-[18px] tracking-tight" style={{ color: activeGate ? "#FFFFFF" : (activeZone ? activeZone.color : "#4A7BFF"), fontWeight: 700, fontFamily: "'Trebuchet MS', 'Tahoma', sans-serif", textShadow: "1px 1px 0px #0A0A3B" }}>
                  {activeGate ? activeGate.name : (activeZone ? activeZone.name : "The Deep City")}
                </h1>
                <p className="text-[10px]" style={S_LABEL}>{activeGate ? activeGate.description : (activeZone ? (activeZone.id.startsWith("os-") ? activeZone.subtitle : `Sector ${activeZone.sectorNumber}`) : "The Great City · Inner City · 8 Outer Sectors")}</p>
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
              {activeZone && <button onClick={() => setShowPaths(!showPaths)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showPaths ? "#C0D0F0" : "#5A6A8A" }}><Link2 size={10} /> Paths</button>}
              {activeZone && <button onClick={() => setShowGrid(!showGrid)} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: showGrid ? "#C0D0F0" : "#5A6A8A" }}><Grid3x3 size={10} /> Grid</button>}
              {activeZone && isEditMode && isDM && (
                <div style={{ display: "contents" }}>
                  <button onClick={() => { setLinkMode(!linkMode); setLinkSource(null); setWallMode(false); setWallStart(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: linkMode ? "#4AFFFF" : "#5A6A8A" }}>{linkMode ? <Unlink size={10} /> : <Link2 size={10} />} {linkMode ? "Stop" : "Link"}</button>
                  <button onClick={() => { setWallMode(!wallMode); setWallStart(null); setLinkMode(false); setLinkSource(null); }} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={{ color: wallMode ? "#8A8A9B" : "#5A6A8A" }}><Square size={10} /> {wallMode ? "Stop" : "Wall"}</button>
                  {!linkMode && !wallMode && <span className="text-[10px] px-2 py-1" style={{ color: "#FF6A6A", background: "#1A0A0A", border: "1px solid #3A1A1A" }}>Click map to place</span>}
                  {linkMode && <span className="text-[10px] px-2 py-1" style={{ color: "#4AFFFF", background: "#0A1A2A", border: "1px solid #1A3A4A" }}>{linkSource ? "Click 2nd pin" : "Click 1st pin"}</span>}
                  {wallMode && <span className="text-[10px] px-2 py-1" style={{ color: "#8A8A9B", background: "#1A1A1E", border: "1px solid #3A3A42" }}>{wallStart ? "Click wall end" : "Click wall start"}</span>}
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
              <div className="absolute inset-0" onClick={handleMapClick} style={{ cursor: isEditMode && isDM ? (wallMode ? "crosshair" : linkMode ? "pointer" : "crosshair") : (isDragging ? "grabbing" : (mapZoom > 1 ? "grab" : "default")), transform: `translate(${mapPan[0]}px, ${mapPan[1]}px) scale(${mapZoom})`, transformOrigin: "0 0", transition: isPanning ? "none" : "transform 0.1s ease-out" }}>
                {activeZone.useMapBg ? (
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
                {renderConnectionLines(activeZone)}
                {renderWalls(activeZone)}
                {wallStart && wallMode && (
                  <div className="absolute z-20 pointer-events-none" style={{ left: `${wallStart[0]}%`, top: `${wallStart[1]}%`, transform: "translate(-50%, -50%)" }}>
                    <div className="w-3 h-3 animate-pulse" style={{ background: "#7A7A8B44", border: "2px solid #8A8A9B", borderRadius: "50%" }} />
                  </div>
                )}
                {activeZone.pins.map(pin => {
                  const isSelected = selectedPinId === pin.id;
                  const isLinkSrc = linkSource === pin.id;
                  return (
                    <button key={pin.id} onClick={(e) => { e.stopPropagation(); if (linkMode && isDM && isEditMode) handlePinClickForLink(pin.id); else { setSelectedPinId(pin.id); setEditingPin(null); setIsNewPin(false); } }} className="absolute group z-10" style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: "translate(-50%, -50%)" }}>
                      {isSelected && !linkMode && <div className="absolute rounded-full animate-ping" style={{ width: 32, height: 32, top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: `${pin.color}44` }} />}
                      {isLinkSrc && <div className="absolute rounded-full animate-pulse" style={{ width: 36, height: 36, top: "50%", left: "50%", transform: "translate(-50%, -50%)", border: "2px solid #4AFFFF", background: "#4AFFFF11" }} />}
                      <div className="relative z-10 p-1.5 transition-all duration-150" style={{ background: isSelected ? `${pin.color}33` : (isLinkSrc ? "#4AFFFF22" : "rgba(14,14,53,0.85)"), border: `1.5px solid ${isLinkSrc ? "#4AFFFF" : (isSelected ? pin.color : `${pin.color}77`)}`, boxShadow: isSelected ? `0 0 12px ${pin.color}55` : (isLinkSrc ? "0 0 12px #4AFFFF44" : `0 0 6px ${pin.color}22`) }}>
                        {renderIcon(pin.icon, 16, isLinkSrc ? "#4AFFFF" : pin.color)}
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20" style={{ background: "rgba(6,6,37,0.92)", border: `1px solid ${pin.color}55`, padding: "2px 8px", fontSize: 10, color: pin.color, textShadow: `0 0 6px ${pin.color}44` }}>{pin.name}</div>
                    </button>
                  );
                })}
                {editingPin && isNewPin && (
                  <div className="absolute z-20 pointer-events-none" style={{ left: `${editingPin.x}%`, top: `${editingPin.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div className="p-1.5 animate-pulse" style={{ background: "rgba(14,14,53,0.85)", border: `2px solid ${editingPin.color}`, boxShadow: `0 0 15px ${editingPin.color}44` }}><Plus size={16} style={{ color: editingPin.color }} /></div>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 pointer-events-none">
                  <div className="text-[9px] px-2 py-1" style={{ color: activeZone.color, background: "rgba(6,6,24,0.85)", border: `1px solid ${activeZone.color}33`, fontFamily: "'Courier New', monospace" }}>{activeZone.id.startsWith("os-") ? activeZone.name.toUpperCase() : `SECTOR ${activeZone.sectorNumber}`} · {activeZone.pins.length} PLACES</div>
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
                <span className="text-[9px]" style={S_DIM}>{zones.filter(z => z.fogMode === "visible").length}/{zones.length} visible</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const innerZones = zones; // Sectors 0-14 are all inner city

                  const renderZoneRow = (zone: MapZone) => {
                    const fog = zone.fogMode;
                    const isHov = hoveredSector === zone.id;
                    if (!isDM && showFog && fog === "invisible") return null;
                    const isLockedForPlayer = !isDM && showFog && fog === "locked";
                    return (
                      <div key={zone.id} onMouseEnter={() => setHoveredSector(zone.id)} onMouseLeave={() => setHoveredSector(null)} className="flex items-center gap-2 px-3 py-2 transition-colors" style={{ borderBottom: "1px solid #0E0E35", background: isHov ? `${zone.color}0D` : "transparent" }}>
                        <button
                          onClick={() => !isLockedForPlayer && handleSectorClick(zone.id)}
                          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                          style={{ cursor: isLockedForPlayer ? "not-allowed" : "pointer", opacity: isLockedForPlayer ? 0.5 : 1 }}
                        >
                          <div className="w-7 h-7 shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ border: `1px solid ${isLockedForPlayer ? "#2A2A4B" : `${zone.color}55`}`, color: isLockedForPlayer ? "#5A6A8A" : zone.color, background: isLockedForPlayer ? "#080820" : `${zone.color}0A`, fontFamily: "'Courier New', monospace" }}>
                            {isLockedForPlayer ? <Lock size={10} /> : `${zone.sectorNumber}`}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate" style={{ color: isLockedForPlayer ? "#5A6A8A" : zone.color }}>Sector {zone.sectorNumber}</div>
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
                        <span className="text-[8px] ml-auto" style={{ color: "#3A4A6B" }}>{zones.length}</span>
                      </div>
                      {innerZones.map(renderZoneRow)}
                      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "#0A0A2A", borderBottom: "1px solid #1A1A4B" }}>
                        <div className="w-2 h-2" style={{ background: "#4AFFFF22", border: "1px solid #4AFFFF55" }} />
                        <span className="text-[9px] tracking-widest" style={{ color: "#5A7ABB", fontFamily: "'Courier New', monospace" }}>OUTER SECTORS</span>
                        <span className="text-[8px] ml-auto" style={{ color: "#3A4A6B" }}>{OUTER_SECTORS_V2.length}</span>
                      </div>
                      {OUTER_SECTORS_V2.map(os => (
                        <div key={os.id} className="flex items-center gap-2 px-3 py-2 transition-colors" style={{ borderBottom: "1px solid #0E0E35" }}>
                          <div className="w-7 h-7 shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ border: `1px solid ${os.color}55`, color: os.color, background: `${os.color}0A`, fontFamily: "'Courier New', monospace" }}>
                            {os.id}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold truncate" style={{ color: os.color }}>Sector {os.id}</div>
                          </div>
                          <span className="text-[8px] shrink-0" style={{ color: "#3A4A6B" }}>{os.numSubs} sub</span>
                        </div>
                      ))}
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
                  <div className="flex items-center gap-2"><div className="w-3 h-3" style={{ background: "#4A7BFF08", border: "1px solid #4A7BFF33" }} /><span className="text-[9px]" style={S_MUTED}>15-22 — Outer Sectors (8 · 60��/30°)</span></div>
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
                  <div className="flex items-center gap-2"><MapPin size={13} style={{ color: activeZone.color }} /><span className="text-[12px] font-semibold" style={{ color: activeZone.color }}>{activeZone.id.startsWith("os-") ? activeZone.name : `Sector ${activeZone.sectorNumber}`} — Places</span></div>
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
              </div>
              {activeZone.connections.length > 0 && (
                <div className="px-3 py-2" style={{ borderBottom: "1px solid #0E0E35" }}>
                  <div className="text-[9px] mb-1" style={S_SECTION_HDR}>PATHS ({activeZone.connections.length})</div>
                  <div className="space-y-1">
                    {activeZone.connections.map(([aId, bId], idx) => {
                      const pinA = activeZone.pins.find(p => p.id === aId); const pinB = activeZone.pins.find(p => p.id === bId);
                      if (!pinA || !pinB) return null;
                      return <div key={idx} className="flex items-center gap-1.5 text-[9px]" style={S_SUBTLE}><Link2 size={8} style={{ color: activeZone.color, opacity: 0.5 }} /><span style={{ color: pinA.color }}>{pinA.name}</span><span style={S_DIM}>→</span><span style={{ color: pinB.color }}>{pinB.name}</span></div>;
                    })}
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
              <div className="flex-1 overflow-y-auto">
                {activeZone.pins.length === 0 && <div className="px-3 py-6 text-center"><MapPin size={20} style={{ color: "#1A1A4B", margin: "0 auto 8px" }} /><div className="text-[11px]" style={S_MUTED}>No places yet</div>{isDM && <div className="text-[9px] mt-1" style={S_DIM}>Enable Edit Mode to add places</div>}</div>}
                {activeZone.pins.map(pin => {
                  const isSel = selectedPinId === pin.id;
                  const connCount = activeZone.connections.filter(([a, b]) => a === pin.id || b === pin.id).length;
                  return (
                    <div key={pin.id} className="flex items-center gap-2 px-3 py-2 transition-colors" style={{ background: isSel ? `${pin.color}11` : "transparent", borderBottom: "1px solid #0E0E35", borderLeft: isSel ? `2px solid ${pin.color}` : "2px solid transparent" }}>
                      <button onClick={() => { setSelectedPinId(pin.id); setEditingPin(null); setIsNewPin(false); }} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {renderIcon(pin.icon, 13, pin.color)}
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: isSel ? pin.color : "#C0D0F0" }}>{pin.name}</div>
                          <div className="text-[9px] truncate" style={S_MUTED}>{pin.description || pin.icon}{connCount > 0 && <span style={{ color: activeZone.color }}> · {connCount} path{connCount !== 1 ? "s" : ""}</span>}</div>
                        </div>
                      </button>
                      {isDM && isEditMode && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { setEditingPin(pin); setIsNewPin(false); }} className="p-1 hover:bg-[#1A1A4B]" style={S_ACCENT}><Edit2 size={10} /></button>
                          <button onClick={() => deletePin(pin.id)} className="p-1 hover:bg-[#2A1A1A]" style={S_RED}><Trash2 size={10} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {editingPin && (
                <div className="px-3 py-3" style={{ borderTop: "1px solid #1A1A4B", background: "#0A0A2A" }}>
                  <div className="text-[11px] mb-2" style={S_ACCENT_HDR}>{isNewPin ? "New Pin" : "Edit Pin"}</div>
                  <div className="space-y-2">
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Name</label><input type="text" value={editingPin.name} onChange={e => setEditingPin({ ...editingPin, name: e.target.value })} className="w-full px-2 py-1 text-[11px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div className="flex gap-2">
                      <div className="flex-1"><label className="text-[9px] block mb-0.5" style={S_MUTED}>Icon</label><select value={editingPin.icon} onChange={e => setEditingPin({ ...editingPin, icon: e.target.value })} className="w-full px-1 py-1 text-[10px] outline-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }}>{ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></div>
                      <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Color</label><div className="flex gap-1 flex-wrap">{PIN_COLORS.map(c => <button key={c} onClick={() => setEditingPin({ ...editingPin, color: c })} className="w-4 h-4 transition-transform" style={{ background: c, border: editingPin.color === c ? "2px solid #FFF" : "1px solid #2A2A5B", transform: editingPin.color === c ? "scale(1.2)" : "scale(1)" }} />)}</div></div>
                    </div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Description</label><textarea value={editingPin.description} rows={2} onChange={e => setEditingPin({ ...editingPin, description: e.target.value })} className="w-full px-2 py-1 text-[10px] outline-none resize-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div><label className="text-[9px] block mb-0.5" style={S_MUTED}>Notes</label><textarea value={editingPin.notes} rows={2} onChange={e => setEditingPin({ ...editingPin, notes: e.target.value })} className="w-full px-2 py-1 text-[10px] outline-none resize-none" style={{ ...SUNKEN_INPUT, color: "#C0D0F0" }} /></div>
                    <div className="flex gap-2">
                      <button onClick={savePin} className={`${retro.button} flex-1 px-3 py-1.5 text-[10px] flex items-center justify-center gap-1`} style={S_GREEN_BTN}><Save size={10} /> Save</button>
                      <button onClick={() => { setEditingPin(null); setIsNewPin(false); }} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}><X size={10} /></button>
                    </div>
                  </div>
                </div>
              )}
              {selectedPin && !editingPin && (
                <div className="px-3 py-3" style={{ borderTop: `1px solid ${selectedPin.color}22`, background: `${selectedPin.color}06` }}>
                  <div className="flex items-center gap-2 mb-2">{renderIcon(selectedPin.icon, 14, selectedPin.color)}<span className="text-[12px] font-semibold" style={{ color: selectedPin.color }}>{selectedPin.name}</span></div>
                  {selectedPin.description && <div className="mb-1.5"><div className="text-[9px]" style={S_MUTED}>Description</div><div className="text-[11px]" style={S_TEXT}>{selectedPin.description}</div></div>}
                  {selectedPin.notes && <div className="mb-1.5"><div className="text-[9px]" style={S_MUTED}>Notes</div><div className="text-[10px] italic" style={S_SUBTLE}>{selectedPin.notes}</div></div>}
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
