import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { getPlayerTheme, firstColor } from "./player-theme";
import { DISPLAY_CONTENTS, S_MUTED, S_DIM, S_SUBTLE, S_TEXT, S_RED, S_GREEN_BTN } from "./shared-styles";
import { usePageVisibility } from "./use-visibility";
import { Send, Users, MessageSquare, Hash, Lock, Crown, Edit3, X, Check, Trash2, Image, Pencil, SmilePlus, Settings, Search, Link as LinkIcon, ExternalLink, ChevronDown, Palette, RotateCcw, ArrowLeft, EyeOff, Eye, Plus, Bot, ChevronUp, FolderOpen } from "lucide-react";
import { fetchProfilePictures } from "./profile-picture";
import { STICKER_IMAGES } from "./sticker-images";
import { safeGetItem, safeSetItem, safeGetJson, safeSetJson } from "./safe-storage";
import {
  listCommunityPlayers,
  listNpcAccounts,
  saveNpcAccounts,
  listAllMessages,
  sendCommunityMessage,
  updateCommunityMessage,
  removeCommunityMessage,
  subscribeToCommunityMessages,
  listCommunityImages,
  saveCommunityImage,
  deleteCommunityImage,
  listCustomReactions,
  loadCommunityReadState,
  saveCommunityReadState,
  loadCommunityProfiles,
  loadCommunityProfile,
  saveCommunityProfile,
} from "@/lib/community-api";

/* ── Seeded PRNG ────────────────────────────────────────────����──────── */
function mkRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s & 0x7fffffff) / 2147483647;
  };
}

/* ── Types ──────────────────������─────────────────────���────────────────── */
interface BuildingSection {
  xOff: number;
  w: number;
  h: number;
}

interface Building {
  x: number;
  totalW: number;
  sections: BuildingSection[];
  hue: number;
  sat: number;
  baseLum: number;
  litProb: number;
  hasAntenna: boolean;
  antennaH: number;
  hasWaterTower: boolean;
  hasACUnits: boolean;
  hasCornice: boolean;
  hasFireEscape: boolean;
  hasAwning: boolean;
  windowStyle: "grid" | "wide" | "narrow";
}

/* ── Building generator ──────────���─────────────────────────────���────── */
function generateBuildings(
  seed: number,
  minW: number, maxW: number,
  minH: number, maxH: number,
  gapMax: number,
  detail: "low" | "mid" | "high",
): Building[] {
  const rand = mkRand(seed);
  const buildings: Building[] = [];
  let cx = -4;

  while (cx < 106) {
    const totalW = minW + rand() * (maxW - minW);
    const mainH = minH + rand() * (maxH - minH);

    const sections: BuildingSection[] = [];
    const hasTower = rand() > 0.65 && mainH > 25 && totalW > 5;
    const hasSetback = rand() > 0.7 && mainH > 20;

    if (hasTower) {
      const baseH = mainH * (0.3 + rand() * 0.25);
      sections.push({ xOff: 0, w: totalW, h: baseH });
      const towerW = totalW * (0.4 + rand() * 0.3);
      const towerXOff = rand() > 0.5 ? (totalW - towerW) / 2 : rand() * (totalW - towerW);
      sections.push({ xOff: towerXOff, w: towerW, h: mainH - baseH });
    } else if (hasSetback) {
      const topH = mainH * (0.15 + rand() * 0.15);
      sections.push({ xOff: 0, w: totalW, h: mainH - topH });
      const setW = totalW * (0.5 + rand() * 0.3);
      sections.push({ xOff: (totalW - setW) / 2, w: setW, h: topH });
    } else {
      sections.push({ xOff: 0, w: totalW, h: mainH });
    }

    const hueRoll = rand();
    const hue = hueRoll < 0.3 ? 215 + rand() * 30
      : hueRoll < 0.5 ? 25 + rand() * 15
      : hueRoll < 0.7 ? 180 + rand() * 30
      : 260 + rand() * 20;
    const sat = 6 + rand() * 12;
    const baseLum = 7 + rand() * 6;

    const litProb = 0.2 + rand() * 0.5;
    const hasAntenna = rand() > 0.7 && mainH > 28;
    const antennaH = hasAntenna ? 1.5 + rand() * 4 : 0;
    const hasWaterTower = !hasAntenna && rand() > 0.8 && mainH > 18 && detail !== "low";
    const hasACUnits = !hasAntenna && !hasWaterTower && rand() > 0.65 && detail !== "low";
    const hasCornice = rand() > 0.35;
    const hasFireEscape = detail === "high" && rand() > 0.75 && mainH > 20;
    const hasAwning = detail === "high" && rand() > 0.7 && !hasTower;
    const windowStyles: Building["windowStyle"][] = ["grid", "wide", "narrow"];
    const windowStyle = windowStyles[Math.floor(rand() * 3)];

    buildings.push({
      x: cx, totalW, sections, hue, sat, baseLum, litProb,
      hasAntenna, antennaH, hasWaterTower, hasACUnits,
      hasCornice, hasFireEscape, hasAwning, windowStyle,
    });

    cx += totalW + 0.3 + rand() * gapMax;
  }
  return buildings;
}

/* ── Render a single building ───────────────────────────────────────── */
function renderBuilding(
  b: Building, bi: number,
  layerId: string, brightness: number, yBase: number,
  isFar: boolean,
  windowScale: number = 1,
): React.ReactNode {
  const rand = mkRand(bi * 173 + (isFar ? 7777 : 0));
  const lum = b.baseLum * brightness;
  const bodyHSL = (lumAdj: number) => `hsl(${b.hue}, ${b.sat}%, ${Math.max(2, lum + lumAdj)}%)`;
  const edgeHSL = (lumAdj: number) => `hsl(${b.hue}, ${Math.max(2, b.sat - 3)}%, ${Math.max(3, lum + lumAdj)}%)`;

  const sectionPositions: { sec: BuildingSection; y: number }[] = [];
  let curY = yBase;
  for (let i = 0; i < b.sections.length; i++) {
    const sec = b.sections[i];
    if (i === 0) {
      curY = yBase - sec.h;
      sectionPositions.push({ sec, y: curY });
    } else {
      curY -= sec.h;
      sectionPositions.push({ sec, y: curY });
    }
  }

  const topSection = sectionPositions[sectionPositions.length - 1];
  const topY = topSection.y;
  const topSec = topSection.sec;

  return (
    <g key={`${layerId}-${bi}`}>
      {sectionPositions.map(({ sec, y }, si) => {
        const sx = b.x + sec.xOff;
        const darken = si === 0 ? 0 : 1;
        return (
          <g key={`sec-${si}`}>
            {/* Body */}
            <rect x={sx} y={y} width={sec.w} height={sec.h} fill={bodyHSL(darken)} />

            {/* Left highlight */}
            <rect x={sx} y={y} width={0.3} height={sec.h} fill={edgeHSL(darken + 5)} opacity="0.4" />
            {/* Right shadow */}
            <rect x={sx + sec.w - 0.25} y={y} width={0.25} height={sec.h} fill="#000005" opacity="0.4" />

            {/* Cornice */}
            {b.hasCornice && (
              <g>
                <rect x={sx - 0.2} y={y - 0.3} width={sec.w + 0.4} height={0.35} fill={edgeHSL(darken + 6)} opacity="0.6" />
                <rect x={sx} y={y + 0.05} width={sec.w} height={0.3} fill="#000005" opacity="0.15" />
              </g>
            )}

            {/* Floor bands */}
            {!isFar && sec.h > 10 && Array.from({ length: Math.max(1, Math.floor(sec.h / 8)) }, (_, fi) => {
              const bandY = y + (fi + 1) * (sec.h / (Math.floor(sec.h / 8) + 1));
              return (
                <rect key={`band-${si}-${fi}`} x={sx} y={bandY} width={sec.w} height={0.2} fill={edgeHSL(darken + 3)} opacity="0.25" />
              );
            })}

            {/* Pilasters */}
            {!isFar && sec.w > 6 && (
              <g>
                <rect x={sx + sec.w * 0.33} y={y} width={0.15} height={sec.h} fill={edgeHSL(darken + 2)} opacity="0.15" />
                <rect x={sx + sec.w * 0.66} y={y} width={0.15} height={sec.h} fill={edgeHSL(darken + 2)} opacity="0.15" />
              </g>
            )}

            {/* Shadow recesses — dark panel insets */}
            {!isFar && sec.w > 5 && sec.h > 8 && (() => {
              const panelCount = Math.max(1, Math.floor(sec.h / 10));
              return Array.from({ length: panelCount }, (_, pi) => {
                const panelY = y + 1.5 + pi * (sec.h / (panelCount + 0.5));
                const panelH = Math.min(5, sec.h / (panelCount + 2));
                if (panelY + panelH > y + sec.h - 0.5) return null;
                return (
                  <g key={`recess-${si}-${pi}`}>
                    <rect x={sx + 0.6} y={panelY} width={sec.w - 1.2} height={panelH} fill="#000008" opacity="0.12" />
                    <rect x={sx + 0.6} y={panelY} width={sec.w - 1.2} height={0.06} fill={edgeHSL(darken + 4)} opacity="0.15" />
                    <rect x={sx + 0.6} y={panelY + panelH - 0.06} width={sec.w - 1.2} height={0.06} fill="#000005" opacity="0.2" />
                  </g>
                );
              });
            })()}

            {/* Corner shadow chamfers */}
            {!isFar && sec.h > 6 && (
              <g>
                <rect x={sx + 0.3} y={y + 0.5} width={0.12} height={sec.h - 1} fill="#000008" opacity="0.15" />
                <rect x={sx + sec.w - 0.42} y={y + 0.5} width={0.12} height={sec.h - 1} fill="#000008" opacity="0.2" />
              </g>
            )}

            {/* Base shadow / foundation band */}
            {si === 0 && sec.h > 5 && (
              <g>
                <rect x={sx - 0.15} y={yBase - 1.2} width={sec.w + 0.3} height={1.2} fill="#020208" opacity="0.3" />
                <rect x={sx - 0.15} y={yBase - 1.2} width={sec.w + 0.3} height={0.08} fill={edgeHSL(darken + 3)} opacity="0.2" />
              </g>
            )}

            {/* Subtle vertical groove lines */}
            {!isFar && sec.w > 4 && sec.h > 12 && (() => {
              const grooveCount = Math.floor(sec.w / 2.5);
              return Array.from({ length: grooveCount }, (_, gi) => {
                const gx = sx + 1 + gi * (sec.w - 2) / grooveCount;
                return <rect key={`groove-${si}-${gi}`} x={gx} y={y + 0.8} width={0.04} height={sec.h - 1.6} fill="#000008" opacity="0.12" />;
              });
            })()}

            {/* Windows */}
            {(() => {
              const margin = 0.6;
              const innerW = sec.w - margin * 2;
              const innerH = sec.h - margin * 2;
              if (innerW < 1 || innerH < 1) return null;

              let ww: number, wh: number;
              if (b.windowStyle === "wide") {
                ww = Math.min(1.4, innerW * 0.18) * windowScale;
                wh = Math.min(0.9, innerW * 0.1) * windowScale;
              } else if (b.windowStyle === "narrow") {
                ww = Math.min(0.6, innerW * 0.08) * windowScale;
                wh = Math.min(1.6, innerW * 0.2) * windowScale;
              } else {
                ww = Math.min(1.0, innerW * 0.12) * windowScale;
                wh = Math.min(1.2, innerW * 0.14) * windowScale;
              }

              const cols = Math.max(1, Math.floor(innerW / (ww + 0.5)));
              const rows = Math.max(1, Math.floor(innerH / (wh + 0.6)));
              const gapX = (innerW - cols * ww) / (cols + 1);
              const gapY = (innerH - rows * wh) / (rows + 1);

              return Array.from({ length: rows }, (_, row) => {
                const wy = y + margin + gapY + row * (wh + gapY);
                return Array.from({ length: cols }, (_, col) => {
                  const wx = sx + margin + gapX + col * (ww + gapX);
                  const lit = rand() < b.litProb;
                  const warmth = rand();
                  const flicker = rand() > 0.93 && lit && !isFar;

                  let wColor: string;
                  if (!lit) {
                    wColor = `hsl(${b.hue}, 6%, ${2 + rand() * 2}%)`;
                  } else if (warmth > 0.55) {
                    wColor = `hsl(${40 + rand() * 15}, ${70 + rand() * 25}%, ${45 + rand() * 25}%)`;
                  } else if (warmth > 0.2) {
                    wColor = `hsl(${200 + rand() * 20}, ${30 + rand() * 30}%, ${40 + rand() * 25}%)`;
                  } else {
                    const tintHue = rand() > 0.5 ? 160 + rand() * 40 : 280 + rand() * 40;
                    wColor = `hsl(${tintHue}, ${40 + rand() * 20}%, ${30 + rand() * 20}%)`;
                  }

                  const showGlow = lit && !isFar && rand() > 0.7;

                  return (
                    <g key={`w-${si}-${row}-${col}`}>
                      {showGlow && (
                        <rect x={wx - 0.15} y={wy - 0.1} width={ww + 0.3} height={wh + 0.2} fill={wColor} opacity="0.08" />
                      )}
                      <rect x={wx} y={wy} width={ww} height={wh} fill={wColor} opacity={lit ? (isFar ? 0.55 : 0.9) : 0.15}>
                        {flicker && (
                          <animate attributeName="opacity" values="0.9;0.35;0.8;0.9" dur={`${1.5 + rand() * 3}s`} repeatCount="indefinite" />
                        )}
                      </rect>
                      {!isFar && ww > 0.7 && wh > 0.9 && (
                        <g opacity="0.2">
                          <rect x={wx + ww / 2 - 0.05} y={wy} width={0.1} height={wh} fill={edgeHSL(3)} />
                          <rect x={wx} y={wy + wh / 2 - 0.05} width={ww} height={0.1} fill={edgeHSL(3)} />
                        </g>
                      )}
                    </g>
                  );
                });
              });
            })()}
          </g>
        );
      })}

      {/* Water tower */}
      {b.hasWaterTower && !isFar && (() => {
        const twX = b.x + topSec.xOff + topSec.w * 0.25;
        const twW = topSec.w * 0.5;
        return (
          <g>
            <rect x={twX + twW * 0.15} y={topY - 2} width={0.2} height={2} fill={edgeHSL(3)} opacity="0.6" />
            <rect x={twX + twW * 0.75} y={topY - 2} width={0.2} height={2} fill={edgeHSL(3)} opacity="0.6" />
            <line x1={twX + twW * 0.15} y1={topY - 0.5} x2={twX + twW * 0.75 + 0.2} y2={topY - 1.5} stroke={edgeHSL(3)} strokeWidth="0.1" opacity="0.4" />
            <rect x={twX} y={topY - 3.5} width={twW} height={1.8} fill={bodyHSL(3)} />
            <rect x={twX} y={topY - 3.3} width={twW} height={0.12} fill={edgeHSL(5)} opacity="0.35" />
            <rect x={twX} y={topY - 2.3} width={twW} height={0.12} fill={edgeHSL(5)} opacity="0.35" />
            <polygon points={`${twX + twW / 2},${topY - 4.5} ${twX - 0.2},${topY - 3.5} ${twX + twW + 0.2},${topY - 3.5}`} fill={bodyHSL(5)} />
          </g>
        );
      })()}

      {/* AC units */}
      {b.hasACUnits && !isFar && (() => {
        const acCount = 1 + Math.floor(rand() * 2);
        return Array.from({ length: acCount }, (_, ai) => {
          const acX = b.x + topSec.xOff + topSec.w * (0.15 + ai * 0.4) + rand() * topSec.w * 0.15;
          return (
            <g key={`ac-${ai}`}>
              <rect x={acX} y={topY - 0.8} width={topSec.w * 0.18} height={0.8} fill={bodyHSL(2)} />
              <rect x={acX + 0.1} y={topY - 0.6} width={topSec.w * 0.18 - 0.2} height={0.08} fill={edgeHSL(5)} opacity="0.3" />
              <rect x={acX + 0.1} y={topY - 0.4} width={topSec.w * 0.18 - 0.2} height={0.08} fill={edgeHSL(5)} opacity="0.3" />
            </g>
          );
        });
      })()}

      {/* Antenna */}
      {b.hasAntenna && (() => {
        const ax = b.x + topSec.xOff + topSec.w / 2;
        return (
          <g>
            <rect x={ax - 0.1} y={topY - b.antennaH} width={0.2} height={b.antennaH} fill="#2A2A48" />
            {b.antennaH > 2.5 && (
              <g>
                <rect x={ax - 0.6} y={topY - b.antennaH * 0.6} width={1.2} height={0.1} fill="#2A2A48" opacity="0.7" />
                <rect x={ax - 0.35} y={topY - b.antennaH * 0.85} width={0.7} height={0.1} fill="#2A2A48" opacity="0.6" />
              </g>
            )}
            <rect x={ax - 0.2} y={topY - b.antennaH - 0.2} width={0.4} height={0.4} fill="#FF2020" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.1;0.9" dur={`${1 + (bi % 3) * 0.5}s`} repeatCount="indefinite" />
            </rect>
          </g>
        );
      })()}

      {/* Fire escape */}
      {b.hasFireEscape && (() => {
        const feSec = sectionPositions[0];
        const feX = b.x + feSec.sec.xOff + (rand() > 0.5 ? 0.3 : feSec.sec.w - 1.2);
        const platforms = Math.max(2, Math.floor(feSec.sec.h / 6));
        return (
          <g opacity="0.35">
            <rect x={feX} y={feSec.y + 1} width={0.1} height={feSec.sec.h - 1} fill={edgeHSL(6)} />
            <rect x={feX + 0.8} y={feSec.y + 1} width={0.1} height={feSec.sec.h - 1} fill={edgeHSL(6)} />
            {Array.from({ length: platforms }, (_, pi) => {
              const py = feSec.y + 1.5 + pi * ((feSec.sec.h - 2) / platforms);
              return (
                <g key={`fe-${pi}`}>
                  <rect x={feX - 0.1} y={py} width={1.1} height={0.12} fill={edgeHSL(8)} />
                  <rect x={feX - 0.1} y={py - 0.5} width={0.08} height={0.5} fill={edgeHSL(6)} />
                  <rect x={feX + 0.9} y={py - 0.5} width={0.08} height={0.5} fill={edgeHSL(6)} />
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Awning */}
      {b.hasAwning && (() => {
        const baseSec = sectionPositions[0];
        const awX = b.x + baseSec.sec.xOff + rand() * baseSec.sec.w * 0.3;
        const awW = baseSec.sec.w * (0.3 + rand() * 0.3);
        const awColor = rand() > 0.5 ? `hsl(0, 50%, ${20 + rand() * 10}%)` : `hsl(120, 30%, ${15 + rand() * 10}%)`;
        return (
          <g>
            <polygon points={`${awX},${yBase - 2} ${awX + awW},${yBase - 2} ${awX + awW + 0.4},${yBase - 1.2} ${awX - 0.4},${yBase - 1.2}`} fill={awColor} opacity="0.7" />
            {Array.from({ length: Math.floor(awW / 0.6) }, (_, si) => (
              <rect key={`aw-${si}`} x={awX + si * 0.6 + 0.1} y={yBase - 1.95} width={0.25} height={0.6} fill="#000000" opacity="0.15" />
            ))}
          </g>
        );
      })()}

      {/* Door */}
      {!isFar && b.sections[0].h > 12 && rand() > 0.4 && (() => {
        const baseSec = b.sections[0];
        const doorW = Math.min(1.5, baseSec.w * 0.2);
        const doorX = b.x + baseSec.xOff + baseSec.w / 2 - doorW / 2;
        const doorH = Math.min(2, baseSec.h * 0.12);
        return (
          <g>
            <rect x={doorX} y={yBase - doorH} width={doorW} height={doorH} fill="#020208" opacity="0.7" />
            <rect x={doorX - 0.1} y={yBase - doorH - 0.1} width={doorW + 0.2} height={0.12} fill={edgeHSL(5)} opacity="0.3" />
            <rect x={doorX + doorW / 2 - 0.1} y={yBase - doorH - 0.3} width={0.2} height={0.15} fill="#FFDD66" opacity="0.4" />
          </g>
        );
      })()}
    </g>
  );
}

/* ─�� Blue Star component (HTML overlay — stays properly shaped) ──���──── */
/* ── Generalized Star component ────────────────────────────────────── */
interface StarColors {
  bodyGrad: string;
  glowOuter: string;
  glowMid: string;
  glowInner: string;
  core: string;
  tipGlow: string;
  flareMid: string;
  flareEdge: string;
  dropShadow: string;
}

function SkylineStar({ top, right, left, size = 32, flareLen = 90, colors, animId, animDur = 3 }: {
  top: string; right?: string; left?: string; size?: number; flareLen?: number;
  colors: StarColors; animId: string; animDur?: number;
}) {
  const starClip = "polygon(50% 0%, 62% 35%, 100% 50%, 62% 65%, 50% 100%, 38% 65%, 0% 50%, 38% 35%)";
  const tipOff = size / 2 - 5;
  const tips = [
    { top: -6, left: tipOff, label: "top" },
    { top: tipOff, left: size - 4, label: "right" },
    { top: size - 4, left: tipOff, label: "bottom" },
    { top: tipOff, left: -6, label: "left" },
  ];

  return (
    <div style={{ position: "absolute", top, ...(right != null ? { right } : {}), ...(left != null ? { left } : {}), zIndex: 1, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 2.2, height: flareLen * 2.2, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowOuter} 0%, transparent 65%)` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 1.2, height: flareLen * 1.2, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowMid} 0%, transparent 75%)` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen * 0.6, height: flareLen * 0.6, borderRadius: "50%", background: `radial-gradient(circle, ${colors.glowInner} 0%, transparent 80%)` }} />
      <div style={{ position: "relative", width: size, height: size, clipPath: starClip, background: colors.bodyGrad, filter: colors.dropShadow, animation: `${animId}Pulse ${animDur}s ease-in-out infinite` }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: size * 0.3, height: size * 0.3, borderRadius: "50%", background: `radial-gradient(circle, ${colors.core})` }} />
        {tips.map((tip) => (
          <div key={tip.label} style={{ position: "absolute", top: tip.top, left: tip.left, width: 10, height: 10, borderRadius: "50%", background: `radial-gradient(circle, ${colors.tipGlow})`, animation: `${animId}TipGlow 2.5s ease-in-out infinite`, animationDelay: tip.label === "right" ? "0.6s" : tip.label === "bottom" ? "1.2s" : tip.label === "left" ? "1.8s" : "0s" }} />
        ))}
      </div>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: flareLen, height: 2, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 20%, ${colors.flareMid} 50%, ${colors.flareEdge} 80%, transparent 100%)`, animation: `${animId}Pulse ${animDur}s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 2, height: flareLen, background: `linear-gradient(180deg, transparent 0%, ${colors.flareEdge} 20%, ${colors.flareMid} 50%, ${colors.flareEdge} 80%, transparent 100%)`, animation: `${animId}Pulse ${animDur}s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: flareLen * 0.55, height: 1, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 25%, ${colors.flareMid} 50%, ${colors.flareEdge} 75%, transparent 100%)`, animation: `${animId}Pulse ${animDur}s ease-in-out infinite` }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-45deg)", width: flareLen * 0.55, height: 1, background: `linear-gradient(90deg, transparent 0%, ${colors.flareEdge} 25%, ${colors.flareMid} 50%, ${colors.flareEdge} 75%, transparent 100%)`, animation: `${animId}Pulse ${animDur}s ease-in-out infinite` }} />
      <style>{`
        @keyframes ${animId}Pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }
        @keyframes ${animId}TipGlow { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
      `}</style>
    </div>
  );
}

/* ── Star color presets ────────────────────────────────────────────── */
const STAR_WHITE_GREY: StarColors = {
  bodyGrad: "radial-gradient(circle at 45% 45%, #FFFFFF 0%, #E8E8E8 20%, #C8C8C8 40%, #9A9A9A 65%, #6A6A6A 100%)",
  glowOuter: "rgba(220,220,230,0.1)",
  glowMid: "rgba(240,240,245,0.15)",
  glowInner: "rgba(255,255,255,0.22)",
  core: "rgba(255,255,255,0.95) 0%, rgba(220,220,230,0.5) 50%, transparent 100%",
  tipGlow: "rgba(255,255,255,0.95) 0%, rgba(200,200,210,0.5) 40%, transparent 100%",
  flareMid: "rgba(255,255,255,0.35)",
  flareEdge: "rgba(200,200,210,0.12)",
  dropShadow: "drop-shadow(0 0 8px rgba(255,255,255,0.5)) drop-shadow(0 0 20px rgba(220,220,230,0.25))",
};

const STAR_PALE_YELLOW: StarColors = {
  bodyGrad: "radial-gradient(circle at 45% 45%, #FFFFFF 0%, #FDF99D 25%, #F5EE80 50%, #E8DD55 75%, #D4C830 100%)",
  glowOuter: "rgba(253,249,157,0.08)",
  glowMid: "rgba(253,249,157,0.14)",
  glowInner: "rgba(255,255,220,0.2)",
  core: "rgba(255,255,255,0.95) 0%, rgba(253,249,157,0.5) 50%, transparent 100%",
  tipGlow: "rgba(255,255,240,0.95) 0%, rgba(253,249,157,0.5) 40%, transparent 100%",
  flareMid: "rgba(253,249,157,0.3)",
  flareEdge: "rgba(253,249,157,0.1)",
  dropShadow: "drop-shadow(0 0 8px rgba(253,249,157,0.5)) drop-shadow(0 0 20px rgba(253,249,157,0.2))",
};

const STAR_BLUE_SHADES: StarColors = {
  bodyGrad: "radial-gradient(circle at 45% 45%, #DDEEFF 0%, #88BBFF 25%, #4488EE 50%, #2266CC 75%, #1144AA 100%)",
  glowOuter: "rgba(80,140,255,0.1)",
  glowMid: "rgba(100,160,255,0.15)",
  glowInner: "rgba(140,190,255,0.2)",
  core: "rgba(220,235,255,0.9) 0%, rgba(160,200,255,0.4) 50%, transparent 100%",
  tipGlow: "rgba(200,225,255,0.95) 0%, rgba(120,180,255,0.5) 40%, transparent 100%",
  flareMid: "rgba(180,210,255,0.35)",
  flareEdge: "rgba(120,170,255,0.12)",
  dropShadow: "drop-shadow(0 0 8px rgba(80,140,255,0.5)) drop-shadow(0 0 20px rgba(60,120,230,0.25))",
};

const STAR_DARK_BLUE_RED: StarColors = {
  bodyGrad: "radial-gradient(circle at 45% 45%, #FF4466 0%, #E20934 25%, #8A1A3A 45%, #3A1A55 65%, #112665 100%)",
  glowOuter: "rgba(226,9,52,0.08)",
  glowMid: "rgba(226,9,52,0.12)",
  glowInner: "rgba(255,50,80,0.18)",
  core: "rgba(255,180,190,0.9) 0%, rgba(226,9,52,0.5) 50%, transparent 100%",
  tipGlow: "rgba(255,140,160,0.9) 0%, rgba(226,9,52,0.5) 40%, transparent 100%",
  flareMid: "rgba(226,9,52,0.3)",
  flareEdge: "rgba(17,38,101,0.15)",
  dropShadow: "drop-shadow(0 0 8px rgba(226,9,52,0.5)) drop-shadow(0 0 20px rgba(17,38,101,0.3))",
};

/* ── PixelSkyline component ─────────────────────────────────────────── */
function PixelSkyline() {
  const farBuildings = useMemo(() => generateBuildings(17, 2.5, 8, 8, 38, 1.5, "low"), []);
  const tallBackBuildings = useMemo(() => generateBuildings(131, 4, 10, 8, 20, 5, "low"), []);
  const midBuildings = useMemo(() => generateBuildings(42, 3.5, 10, 15, 55, 1, "mid"), []);
  const nearBuildings = useMemo(() => generateBuildings(73, 4.5, 13, 10, 42, 0.8, "high"), []);

  const stars = useMemo(() => {
    const rand = mkRand(99);
    return Array.from({ length: 140 }, () => ({
      x: rand() * 100,
      y: rand() * 48,
      size: rand() < 0.1 ? 2 : 1,
      opacity: 0.15 + rand() * 0.85,
      twinkle: rand() > 0.6,
      dur: 1.5 + rand() * 4,
    }));
  }, []);

  const clouds = useMemo(() => {
    const rand = mkRand(55);
    return Array.from({ length: 6 }, () => ({
      x: rand() * 100,
      y: 6 + rand() * 28,
      w: 6 + rand() * 18,
      h: 1 + rand() * 2.5,
      opacity: 0.025 + rand() * 0.05,
      dur: 70 + rand() * 100,
    }));
  }, []);

  const streetlights = useMemo(() => {
    const rand = mkRand(777);
    const lights: { x: number }[] = [];
    let lx = 1 + rand() * 4;
    while (lx < 99) {
      lights.push({ x: lx });
      lx += 5 + rand() * 7;
    }
    return lights;
  }, []);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        shapeRendering: "crispEdges",
      }}
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#010108" />
          <stop offset="15%" stopColor="#030316" />
          <stop offset="40%" stopColor="#070728" />
          <stop offset="65%" stopColor="#0B0E3A" />
          <stop offset="85%" stopColor="#10154A" />
          <stop offset="100%" stopColor="#161C55" />
        </linearGradient>
        {/* Warm horizon glow */}
        <linearGradient id="horizonGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF7744" stopOpacity="0" />
          <stop offset="50%" stopColor="#FF5533" stopOpacity="0.035" />
          <stop offset="80%" stopColor="#FF8855" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#FFAA66" stopOpacity="0.1" />
        </linearGradient>
        {/* Secondary cool horizon glow */}
        <linearGradient id="horizonGlowCool" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4466AA" stopOpacity="0" />
          <stop offset="70%" stopColor="#334488" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#5577BB" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id="lampCone" cx="0.5" cy="0" r="0.9">
          <stop offset="0%" stopColor="#FFDD88" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#FFDD88" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fogBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0C0C30" stopOpacity="0" />
          <stop offset="50%" stopColor="#0C0C30" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#0C0C30" stopOpacity="0" />
        </linearGradient>
        {/* Road wet reflection */}
        <linearGradient id="roadReflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A1A44" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#080818" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="100" height="100" fill="url(#sky)" />
      {/* Warm horizon glow */}
      <rect x="0" y="45" width="100" height="55" fill="url(#horizonGlow)" />
      {/* Cool horizon glow */}
      <rect x="0" y="50" width="100" height="50" fill="url(#horizonGlowCool)" />

      {/* Stars */}
      {stars.map((st, i) => (
        <rect
          key={`s${i}`}
          x={st.x} y={st.y}
          width={st.size * 0.25} height={st.size * 0.25}
          fill="#FFFFFF" opacity={st.opacity}
        >
          {st.twinkle && (
            <animate
              attributeName="opacity"
              values={`${st.opacity};${st.opacity * 0.1};${st.opacity}`}
              dur={`${st.dur}s`}
              repeatCount="indefinite"
            />
          )}
        </rect>
      ))}

      {/* Clouds */}
      {clouds.map((c, i) => (
        <rect
          key={`c${i}`}
          y={c.y} width={c.w} height={c.h}
          rx="0.4" fill="#7777BB" opacity={c.opacity}
        >
          <animate
            attributeName="x"
            values={`${c.x};${c.x + 120};${c.x}`}
            dur={`${c.dur}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}

      {/* Shooting star */}
      <line x1="0" y1="0" x2="0" y2="0" stroke="#FFFFFF" strokeWidth="0.15" opacity="0">
        <animate attributeName="x1" values="30;18" dur="0.5s" begin="6s" repeatCount="indefinite" />
        <animate attributeName="y1" values="8;16" dur="0.5s" begin="6s" repeatCount="indefinite" />
        <animate attributeName="x2" values="31;19" dur="0.5s" begin="6s" repeatCount="indefinite" />
        <animate attributeName="y2" values="7.6;15.6" dur="0.5s" begin="6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0;0.85;0;0;0;0;0;0;0;0;0;0;0;0;0" dur="10s" begin="6s" repeatCount="indefinite" />
      </line>

      {/* ═══ TALL BUILDINGS BEHIND THE WALL ═══ */}
      {tallBackBuildings
        .filter(b => b.x + b.totalW < 43 || b.x > 55)
        .map((b, bi) => renderBuilding(b, bi, "tallback", 0.45, 48, true, 0.55))}

      {/* ═══ CENTRAL TOWER — slim dark metal monolith, no windows ═══ */}
      {(() => {
        const tX = 47;
        const tW = 6;
        const tTopY = 2;
        const tBot = 62;
        const tH = tBot - tTopY;
        return (
          <g opacity="0.9">
            {/* Main shaft — dark gunmetal */}
            <rect x={tX} y={tTopY + 6} width={tW} height={tH - 6} fill="#08080E" />
            <rect x={tX} y={tTopY + 6} width={0.4} height={tH - 6} fill="#1A1A28" opacity="0.7" />
            <rect x={tX + 0.4} y={tTopY + 6} width={tW * 0.2} height={tH - 6} fill="#101018" opacity="0.5" />
            <rect x={tX + tW - 0.5} y={tTopY + 6} width={0.5} height={tH - 6} fill="#030308" opacity="0.8" />
            {[0.3, 0.5, 0.7].map(f => (
              <rect key={`ts-${f}`} x={tX + tW * f - 0.03} y={tTopY + 6} width={0.06} height={tH - 6} fill="#141420" opacity="0.6" />
            ))}
            {Array.from({ length: 18 }, (_, i) => {
              const sy = tTopY + 8 + i * 3;
              if (sy > tBot) return null;
              return <rect key={`hs-${i}`} x={tX} y={sy} width={tW} height={0.08} fill="#1C1C2A" opacity="0.5" />;
            })}
            {Array.from({ length: 18 }, (_, i) => {
              const ry = tTopY + 8 + i * 3;
              if (ry > tBot) return null;
              return (
                <g key={`rv-${i}`}>
                  <rect x={tX + 0.15} y={ry - 0.06} width={0.12} height={0.12} fill="#1E1E2E" opacity="0.4" />
                  <rect x={tX + tW - 0.27} y={ry - 0.06} width={0.12} height={0.12} fill="#1E1E2E" opacity="0.4" />
                </g>
              );
            })}
            <polygon points={`${tX},${tTopY + 6} ${tX + tW},${tTopY + 6} ${tX + tW * 0.6},${tTopY + 1.5} ${tX + tW * 0.4},${tTopY + 1.5}`} fill="#0A0A12" />
            <polygon points={`${tX},${tTopY + 6} ${tX + tW * 0.4},${tTopY + 1.5} ${tX + tW * 0.4},${tTopY + 6}`} fill="#121220" opacity="0.5" />
            <rect x={tX + tW * 0.47} y={tTopY - 1} width={0.3} height={3} fill="#0E0E18" />
            <rect x={tX + tW * 0.44} y={tTopY - 1.2} width={0.6} height={0.3} fill="#181828" />
            {/* Finial cap — dark metal, no light */}
            <rect x={tX + tW * 0.42} y={tTopY - 1.7} width={0.8} height={0.55} fill="#0C0C16" />
            <rect x={tX + tW * 0.42} y={tTopY - 1.7} width={0.8} height={0.08} fill="#1A1A2A" opacity="0.5" />
            <polygon points={`${tX + tW * 0.48},${tTopY - 2.2} ${tX + tW * 0.42},${tTopY - 1.7} ${tX + tW * 0.42 + 0.8},${tTopY - 1.7}`} fill="#0A0A14" />
            {/* ── Recessed vertical channel panels ── */}
            {[0.18, 0.82].map(f => (
              <rect key={`ch-${f}`} x={tX + tW * f - 0.15} y={tTopY + 8} width={0.3} height={tH - 14} fill="#040408" opacity="0.5" />
            ))}
            {/* ── Diagonal bracing on lower half ── */}
            {[0, 1].map(side => {
              const bx = side === 0 ? tX + 0.3 : tX + tW - 0.4;
              return (
                <g key={`brace-${side}`} opacity="0.2">
                  <line x1={bx} y1={tTopY + 35} x2={bx + (side === 0 ? 1 : -1)} y2={tTopY + 42} stroke="#1A1A28" strokeWidth="0.12" />
                  <line x1={bx} y1={tTopY + 42} x2={bx + (side === 0 ? 1 : -1)} y2={tTopY + 49} stroke="#1A1A28" strokeWidth="0.12" />
                </g>
              );
            })}
            {/* ── Surface panel recesses (subtle dark rectangles) ── */}
            {Array.from({ length: 8 }, (_, i) => {
              const py = tTopY + 11 + i * 5.8;
              if (py > tBot - 8) return null;
              return (
                <g key={`panel-${i}`}>
                  <rect x={tX + 1} y={py} width={tW - 2} height={3.5} fill="#060610" opacity="0.35" />
                  <rect x={tX + 1} y={py} width={tW - 2} height={0.06} fill="#1A1A28" opacity="0.3" />
                  <rect x={tX + 1} y={py + 3.44} width={tW - 2} height={0.06} fill="#020208" opacity="0.4" />
                </g>
              );
            })}
            {/* ── Buttress flanges at mid-height ── */}
            <polygon points={`${tX},${tTopY + 28} ${tX - 0.8},${tTopY + 32} ${tX},${tTopY + 32}`} fill="#0A0A14" opacity="0.6" />
            <polygon points={`${tX + tW},${tTopY + 28} ${tX + tW + 0.8},${tTopY + 32} ${tX + tW},${tTopY + 32}`} fill="#070710" opacity="0.5" />
            {/* ── Structural ring / collar bands ── */}
            {[12, 22, 34, 46].map(offset => {
              const ry = tTopY + offset;
              if (ry > tBot) return null;
              return (
                <g key={`collar-${offset}`}>
                  <rect x={tX - 0.6} y={ry} width={tW + 1.2} height={0.8} fill="#0C0C16" />
                  <rect x={tX - 0.6} y={ry} width={tW + 1.2} height={0.12} fill="#1E1E30" opacity="0.6" />
                  <rect x={tX - 0.6} y={ry + 0.68} width={tW + 1.2} height={0.12} fill="#040408" opacity="0.7" />
                </g>
              );
            })}
            {/* ── Antenna array / dish at upper section ── */}
            <rect x={tX - 1.2} y={tTopY + 9} width={tW + 2.4} height={0.5} fill="#0A0A14" />
            <rect x={tX - 1.2} y={tTopY + 9} width={tW + 2.4} height={0.08} fill="#222234" opacity="0.5" />
            <polygon points={`${tX - 1.5},${tTopY + 8.5} ${tX - 0.5},${tTopY + 7.5} ${tX - 0.5},${tTopY + 9.5}`} fill="#0C0C18" opacity="0.7" />
            <polygon points={`${tX + tW + 1.5},${tTopY + 8.5} ${tX + tW + 0.5},${tTopY + 7.5} ${tX + tW + 0.5},${tTopY + 9.5}`} fill="#080812" opacity="0.6" />
            {/* ── Lower base widening ── */}
            <polygon points={`${tX},${tBot - 6} ${tX - 1.5},${tBot} ${tX + tW + 1.5},${tBot} ${tX + tW},${tBot - 6}`} fill="#070710" />
            <polygon points={`${tX},${tBot - 6} ${tX - 1.5},${tBot} ${tX + tW * 0.35},${tBot} ${tX + tW * 0.35},${tBot - 6}`} fill="#0E0E1A" opacity="0.4" />
            <rect x={tX - 1.5} y={tBot - 0.4} width={tW + 3} height={0.4} fill="#0C0C18" />
            <rect x={tX - 1.5} y={tBot - 0.4} width={tW + 3} height={0.08} fill="#1A1A2A" opacity="0.4" />
            {/* ── Faint searchlight beams ── */}
            <polygon points={`${tX + tW * 0.25},${tTopY + 10} ${tX - 18},${tTopY + 45} ${tX - 15},${tTopY + 45}`} fill="#FFFFFF" opacity="0.012" />
            <polygon points={`${tX + tW * 0.75},${tTopY + 10} ${tX + tW + 18},${tTopY + 45} ${tX + tW + 15},${tTopY + 45}`} fill="#FFFFFF" opacity="0.012" />
          </g>
        );
      })()}

      {/* ═══ MODERN REINFORCED WALL WITH TURRETS ═══ */}
      {(() => {
        const wTop = 48;
        const wBot = 78;
        const wH = wBot - wTop;
        return (
          <g opacity="1">
            {/* Main wall body — dark concrete/steel */}
            <rect x={0} y={wTop} width={100} height={wH} fill="#0A0A16" />
            <rect x={0} y={wTop} width={100} height={wH * 0.15} fill="#141422" opacity="0.6" />
            <rect x={0} y={wTop + wH * 0.8} width={100} height={wH * 0.2} fill="#050510" opacity="0.5" />
            {/* Horizontal concrete segment lines */}
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={`wc-${i}`} x={0} y={wTop + (i + 1) * (wH / 7)} width={100} height={0.12} fill="#16162A" opacity="0.4" />
            ))}
            {/* Vertical expansion joints */}
            {Array.from({ length: 14 }, (_, i) => (
              <rect key={`vj-${i}`} x={i * 7.3 + 1.5} y={wTop} width={0.07} height={wH} fill="#12121E" opacity="0.35" />
            ))}
            {/* Steel reinforcement band at top */}
            <rect x={0} y={wTop - 0.3} width={100} height={0.5} fill="#0E0E1A" />
            <rect x={0} y={wTop - 0.3} width={100} height={0.08} fill="#222238" opacity="0.5" />
            <rect x={0} y={wTop + 0.12} width={100} height={0.06} fill="#050510" opacity="0.6" />
            {/* Mid-wall steel band */}
            <rect x={0} y={wTop + wH * 0.5 - 0.15} width={100} height={0.3} fill="#0E0E1A" />
            <rect x={0} y={wTop + wH * 0.5 - 0.15} width={100} height={0.06} fill="#1E1E30" opacity="0.4" />
            {/* Steel reinforcement band at bottom */}
            <rect x={0} y={wBot - 0.2} width={100} height={0.4} fill="#08080F" />
            <rect x={0} y={wBot - 0.2} width={100} height={0.06} fill="#1A1A2C" opacity="0.35" />
            {/* ── Anti-climb barrier at base ��─ */}
            <polygon points={`0,${wBot} 0,${wBot + 1.5} 100,${wBot + 1.5} 100,${wBot}`} fill="#080812" />
            <polygon points={`0,${wBot} 0,${wBot + 0.6} 100,${wBot + 0.6} 100,${wBot}`} fill="#0C0C1A" opacity="0.7" />

            {/* ── Animated spotlights mounted on wall face ── */}
            {Array.from({ length: 8 }, (_, i) => {
              const lx = 6 + i * 12;
              const beamLen = wH * 0.85;
              const onDur = 8 + i * 3.7;
              const sweepDur = 6 + (i % 3) * 2.5;
              const sweepFrom = -12 - (i % 2) * 8;
              const sweepTo = 12 + (i % 2) * 8;
              return (
                <g key={`spot-${i}`}>
                  {/* Spotlight housing */}
                  <rect x={lx - 0.2} y={wTop + 0.3} width={0.4} height={0.6} fill="#12121E" />
                  <rect x={lx - 0.1} y={wTop + 0.2} width={0.2} height={0.15} fill="#88AADD" opacity="0.2">
                    <animate attributeName="opacity" values="0;0;0.4;0.4;0.4;0;0" dur={`${onDur}s`} repeatCount="indefinite" />
                  </rect>
                  {/* Animated beam cone */}
                  <g>
                    <polygon
                      points={`${lx - 0.12},${wTop + 0.9} ${lx - 1.8},${wTop + 0.9 + beamLen} ${lx + 1.8},${wTop + 0.9 + beamLen} ${lx + 0.12},${wTop + 0.9}`}
                      fill="#CCDDFF"
                      opacity="0"
                    >
                      <animate attributeName="opacity" values="0;0;0.04;0.06;0.04;0;0" dur={`${onDur}s`} repeatCount="indefinite" />
                    </polygon>
                    <animateTransform attributeName="transform" type="rotate" values={`0 ${lx} ${wTop + 0.9};${sweepFrom} ${lx} ${wTop + 0.9};${sweepTo} ${lx} ${wTop + 0.9};0 ${lx} ${wTop + 0.9}`} dur={`${sweepDur}s`} repeatCount="indefinite" />
                  </g>
                </g>
              );
            })}


            {/* ── Razor wire along top ── */}
            <polyline points={Array.from({ length: 100 }, (_, i) => `${i},${wTop - 0.4 + (i % 2 === 0 ? -0.25 : 0.15)}`).join(' ')} fill="none" stroke="#1A1A2E" strokeWidth="0.06" opacity="0.4" />
            <polyline points={Array.from({ length: 100 }, (_, i) => `${i},${wTop - 0.5 + (i % 2 === 0 ? 0.15 : -0.25)}`).join(' ')} fill="none" stroke="#1A1A2E" strokeWidth="0.04" opacity="0.3" />
            {/* ── Wall shadow cast ── */}
            <rect x={0} y={wBot + 1.5} width={100} height={1.5} fill="#030308" opacity="0.35" />
          </g>
        );
      })()}

      {/* ═══ FAR LAYER ═══ */}
      {farBuildings.map((b, bi) => renderBuilding(b, bi, "far", 0.35, 97, true))}

      {/* Atmospheric haze between far & mid */}
      <rect x="0" y="48" width="100" height="22" fill="url(#fogBand)" />

      {/* ═���═ MID LAYER ═══ */}
      {midBuildings.map((b, bi) => renderBuilding(b, bi, "mid", 0.65, 97, false))}

      {/* Lighter haze between mid & near */}
      <rect x="0" y="60" width="100" height="16" fill="url(#fogBand)" opacity="0.4" />

      {/* ═══ NEAR LAYER ═══ */}
      {nearBuildings.map((b, bi) => renderBuilding(b, bi, "near", 1.0, 97, false))}

      {/* ═══ SKYTRAIN TRACK & TRAIN ═══ */}
      {(() => {
        const trackY = 85;
        const railH = 0.6;
        const pillarSpacing = 9;
        const pillarCount = Math.ceil(100 / pillarSpacing) + 1;
        const groundY = 96.5;

        const carCount = 5;
        const carW = 12;
        const carH = 4;
        const carGap = 0.5;
        const trainTotalW = carCount * carW + (carCount - 1) * carGap;
        const trainY = trackY - carH - 0.2;

        return (
          <g>
            {/* ── Support pillars ── */}
            {Array.from({ length: pillarCount }, (_, i) => {
              const px = i * pillarSpacing + 3;
              const pillarW = 0.7;
              return (
                <g key={`pillar-${i}`}>
                  <rect x={px - pillarW / 2} y={trackY} width={pillarW} height={groundY - trackY} fill="#181838" opacity="0.85" />
                  <rect x={px - pillarW / 2} y={trackY} width={0.15} height={groundY - trackY} fill="#2A2A55" opacity="0.4" />
                  <rect x={px + pillarW / 2 - 0.1} y={trackY} width={0.1} height={groundY - trackY} fill="#08081A" opacity="0.5" />
                  <rect x={px - pillarW * 1.4} y={trackY - 0.3} width={pillarW * 2.8} height={0.5} fill="#1E1E42" opacity="0.8" />
                  <rect x={px - pillarW * 1.4} y={trackY - 0.35} width={pillarW * 2.8} height={0.08} fill="#2A2A55" opacity="0.5" />
                  <line x1={px - pillarW / 2} y1={trackY + 0.5} x2={px - pillarW * 1.3} y2={trackY - 0.25} stroke="#1E1E42" strokeWidth="0.15" opacity="0.5" />
                  <line x1={px + pillarW / 2} y1={trackY + 0.5} x2={px + pillarW * 1.3} y2={trackY - 0.25} stroke="#1E1E42" strokeWidth="0.15" opacity="0.5" />
                  {i < pillarCount - 1 && (
                    <g opacity="0.25">
                      <line x1={px + pillarW / 2} y1={trackY + 2} x2={px + pillarSpacing - pillarW / 2} y2={trackY + (groundY - trackY) * 0.5} stroke="#1A1A40" strokeWidth="0.08" />
                      <line x1={px + pillarW / 2} y1={trackY + (groundY - trackY) * 0.5} x2={px + pillarSpacing - pillarW / 2} y2={trackY + 2} stroke="#1A1A40" strokeWidth="0.08" />
                    </g>
                  )}
                  <rect x={px - pillarW * 0.7} y={groundY - 0.8} width={pillarW * 1.4} height={0.8} fill="#161634" opacity="0.6" />
                </g>
              );
            })}

            {/* ── Rail beam / guideway ── */}
            <rect x="0" y={trackY + railH} width="100" height="0.2" fill="#000008" opacity="0.5" />
            <rect x="0" y={trackY} width="100" height={railH} fill="#14143A" />
            <rect x="0" y={trackY} width="100" height="0.12" fill="#22224A" opacity="0.7" />
            <rect x="0" y={trackY - 0.12} width="100" height="0.12" fill="#2A2A55" opacity="0.5" />
            <rect x="0" y={trackY + railH + 0.08} width="100" height="0.06" fill="#1A1A40" opacity="0.3" />
            {Array.from({ length: 50 }, (_, i) => (
              <rect key={`tie-${i}`} x={i * 2 + 0.5} y={trackY + 0.1} width="0.15" height={railH - 0.2} fill="#1A1A44" opacity="0.3" />
            ))}

            {/* ── Animated train ─�� */}
            <g style={{
              animation: `skytrainSlide 22s linear infinite`,
              willChange: "transform",
            }}>
              <style>{`
                @keyframes skytrainSlide {
                  from { transform: translate(115px, 0); }
                  to { transform: translate(${-trainTotalW - 20}px, 0); }
                }
              `}</style>
              <rect x={-8} y={trackY - 0.5} width={8} height={1.5} fill="#FFEE44" opacity="0.03" />

              {/* Overhead catenary wires */}
              <line x1={-5} y1={trainY - 2.2} x2={trainTotalW + 5} y2={trainY - 2.2} stroke="#2A2A50" strokeWidth="0.06" opacity="0.4" />
              <line x1={-5} y1={trainY - 2.0} x2={trainTotalW + 5} y2={trainY - 2.0} stroke="#222248" strokeWidth="0.04" opacity="0.3" />

              {Array.from({ length: carCount }, (_, ci) => {
                const cx = ci * (carW + carGap);
                const isHead = ci === 0;
                const isTail = ci === carCount - 1;
                const winCount = 7;
                const winMargin = isHead ? 2.4 : 1.0;
                const winMarginR = isTail ? 2.4 : 1.0;
                const usableW = carW - winMargin - winMarginR;
                const winW = (usableW / winCount) - 0.3;
                const winH = carH * 0.38;
                const winY = trainY + carH * 0.18;

                return (
                  <g key={`car-${ci}`}>
                    <rect x={cx + 0.3} y={trackY - 0.15} width={carW - 0.6} height={0.25} fill="#000010" opacity="0.6" />
                    <rect x={cx + 1} y={trackY + railH} width={carW - 2} height={1.0} fill="#3366AA" opacity="0.03" />

                    {/* Car body */}
                    <rect x={cx} y={trainY} width={carW} height={carH} fill="#1C1C4C" />
                    <rect x={cx} y={trainY} width={carW} height={carH * 0.5} fill="#22225A" opacity="0.35" />
                    {/* Panel seams */}
                    <rect x={cx} y={trainY + carH * 0.1} width={carW} height={0.04} fill="#161640" opacity="0.3" />
                    <rect x={cx} y={trainY + carH * 0.5} width={carW} height={0.04} fill="#161640" opacity="0.25" />
                    <rect x={cx} y={trainY + carH * 0.9} width={carW} height={0.04} fill="#161640" opacity="0.2" />
                    {/* Accent stripes */}
                    <rect x={cx} y={trainY + carH * 0.12} width={carW} height={carH * 0.035} fill="#4060CC" opacity="0.5" />
                    <rect x={cx} y={trainY + carH * 0.62} width={carW} height={carH * 0.08} fill="#3050BB" opacity="0.45" />
                    <rect x={cx} y={trainY + carH * 0.72} width={carW} height={carH * 0.025} fill="#4466DD" opacity="0.25" />
                    <rect x={cx} y={trainY + carH * 0.76} width={carW} height={carH * 0.012} fill="#5577EE" opacity="0.15" />
                    {/* Edges */}
                    <rect x={cx} y={trainY} width={carW} height={0.18} fill="#2E2E65" opacity="0.7" />
                    <rect x={cx} y={trainY + carH - 0.2} width={carW} height={0.2} fill="#0C0C28" />
                    <rect x={cx} y={trainY} width={0.1} height={carH} fill="#2A2A5A" opacity="0.25" />
                    <rect x={cx + carW - 0.08} y={trainY} width={0.08} height={carH} fill="#0A0A20" opacity="0.3" />
                    {/* Rivet lines */}
                    {Array.from({ length: Math.floor(carW / 0.8) }, (_, ri) => (
                      <rect key={`rv-${ri}`} x={cx + 0.4 + ri * 0.8} y={trainY + 0.22} width={0.08} height={0.08} fill="#2A2A58" opacity="0.2" />
                    ))}
                    {Array.from({ length: Math.floor(carW / 0.8) }, (_, ri) => (
                      <rect key={`rvb-${ri}`} x={cx + 0.4 + ri * 0.8} y={trainY + carH - 0.3} width={0.08} height={0.08} fill="#2A2A58" opacity="0.15" />
                    ))}
                    {/* Vent grilles */}
                    <rect x={cx + carW * 0.15} y={trainY + carH * 0.58} width={carW * 0.12} height={carH * 0.04} fill="#161640" opacity="0.4" />
                    {Array.from({ length: 4 }, (_, gi) => (
                      <rect key={`grl-${gi}`} x={cx + carW * 0.155 + gi * carW * 0.03} y={trainY + carH * 0.585} width={carW * 0.015} height={carH * 0.03} fill="#1A1A48" opacity="0.3" />
                    ))}
                    <rect x={cx + carW * 0.73} y={trainY + carH * 0.58} width={carW * 0.12} height={carH * 0.04} fill="#161640" opacity="0.4" />
                    {Array.from({ length: 4 }, (_, gi) => (
                      <rect key={`grr-${gi}`} x={cx + carW * 0.735 + gi * carW * 0.03} y={trainY + carH * 0.585} width={carW * 0.015} height={carH * 0.03} fill="#1A1A48" opacity="0.3" />
                    ))}

                    {/* Roof */}
                    <rect x={cx + 0.4} y={trainY - 0.35} width={carW - 0.8} height={0.4} fill="#181845" />
                    <rect x={cx + 0.4} y={trainY - 0.35} width={carW - 0.8} height={0.08} fill="#2A2A58" opacity="0.5" />
                    <rect x={cx + 0.3} y={trainY - 0.05} width={0.12} height={0.1} fill="#222250" opacity="0.3" />
                    <rect x={cx + carW - 0.42} y={trainY - 0.05} width={0.12} height={0.1} fill="#222250" opacity="0.3" />
                    {Array.from({ length: 3 }, (_, si) => (
                      <rect key={`rs-${si}`} x={cx + carW * (0.25 + si * 0.25)} y={trainY - 0.33} width={0.04} height={0.36} fill="#1A1A40" opacity="0.25" />
                    ))}

                    {/* Pantograph (even cars) */}
                    {ci % 2 === 0 && (
                      <g>
                        <rect x={cx + carW * 0.38} y={trainY - 0.5} width={carW * 0.24} height={0.18} fill="#1E1E48" opacity="0.6" />
                        <line x1={cx + carW * 0.4} y1={trainY - 0.5} x2={cx + carW * 0.47} y2={trainY - 1.1} stroke="#2A2A50" strokeWidth="0.1" opacity="0.6" />
                        <line x1={cx + carW * 0.6} y1={trainY - 0.5} x2={cx + carW * 0.53} y2={trainY - 1.1} stroke="#2A2A50" strokeWidth="0.1" opacity="0.6" />
                        <line x1={cx + carW * 0.47} y1={trainY - 1.1} x2={cx + carW * 0.42} y2={trainY - 1.6} stroke="#2A2A50" strokeWidth="0.08" opacity="0.5" />
                        <line x1={cx + carW * 0.53} y1={trainY - 1.1} x2={cx + carW * 0.58} y2={trainY - 1.6} stroke="#2A2A50" strokeWidth="0.08" opacity="0.5" />
                        <line x1={cx + carW * 0.47} y1={trainY - 0.8} x2={cx + carW * 0.53} y2={trainY - 1.1} stroke="#2A2A50" strokeWidth="0.05" opacity="0.35" />
                        <rect x={cx + carW * 0.38} y={trainY - 1.65} width={carW * 0.24} height={0.1} fill="#3A3A60" opacity="0.6" />
                        <rect x={cx + carW * 0.39} y={trainY - 1.65} width={carW * 0.22} height={0.04} fill="#5566AA" opacity="0.4" />
                        <rect x={cx + carW * 0.49} y={trainY - 1.8} width={0.12} height={0.2} fill="#88CCFF" opacity="0">
                          <animate attributeName="opacity" values="0;0;0;0.8;0;0;0;0;0;0.6;0;0;0;0;0" dur="3s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx + carW * 0.46} y={trainY - 2.0} width={0.2} height={0.4} fill="#66AAFF" opacity="0">
                          <animate attributeName="opacity" values="0;0;0;0.15;0;0;0;0;0;0.1;0;0;0;0;0" dur="3s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx + carW * 0.44} y={trainY - 0.55} width={0.15} height={0.08} fill="#3A3A60" opacity="0.5" />
                        <rect x={cx + carW * 0.54} y={trainY - 0.55} width={0.15} height={0.08} fill="#3A3A60" opacity="0.5" />
                      </g>
                    )}
                    {/* AC + antenna (odd cars) */}
                    {ci % 2 === 1 && (
                      <g>
                        <rect x={cx + carW * 0.22} y={trainY - 0.6} width={carW * 0.18} height={0.35} fill="#161640" opacity="0.65" />
                        <rect x={cx + carW * 0.22} y={trainY - 0.6} width={carW * 0.18} height={0.06} fill="#1E1E4A" opacity="0.4" />
                        {Array.from({ length: 5 }, (_, gi) => (
                          <rect key={`ac1-${gi}`} x={cx + carW * 0.225 + gi * carW * 0.035} y={trainY - 0.52} width={carW * 0.02} height={0.2} fill="#1A1A45" opacity="0.35" />
                        ))}
                        <rect x={cx + carW * 0.58} y={trainY - 0.6} width={carW * 0.18} height={0.35} fill="#161640" opacity="0.65" />
                        <rect x={cx + carW * 0.58} y={trainY - 0.6} width={carW * 0.18} height={0.06} fill="#1E1E4A" opacity="0.4" />
                        {Array.from({ length: 5 }, (_, gi) => (
                          <rect key={`ac2-${gi}`} x={cx + carW * 0.585 + gi * carW * 0.035} y={trainY - 0.52} width={carW * 0.02} height={0.2} fill="#1A1A45" opacity="0.35" />
                        ))}
                        <rect x={cx + carW * 0.48} y={trainY - 0.9} width={0.08} height={0.6} fill="#2A2A50" opacity="0.5" />
                        <rect x={cx + carW * 0.46} y={trainY - 0.95} width={0.15} height={0.08} fill="#3A3A60" opacity="0.4" />
                      </g>
                    )}

                    {/* Head car */}
                    {isHead && (
                      <g>
                        <polygon points={`${cx},${trainY + 0.2} ${cx - 1.2},${trainY + carH * 0.32} ${cx - 1.2},${trainY + carH * 0.68} ${cx},${trainY + carH - 0.2}`} fill="#1C1C4C" />
                        <polygon points={`${cx},${trainY + 0.2} ${cx - 1.2},${trainY + carH * 0.32} ${cx - 1.2},${trainY + carH * 0.5} ${cx},${trainY + carH * 0.48}`} fill="#22225A" opacity="0.3" />
                        <line x1={cx - 1.2} y1={trainY + carH * 0.32} x2={cx - 1.2} y2={trainY + carH * 0.68} stroke="#2A2A5A" strokeWidth="0.06" opacity="0.3" />
                        <line x1={cx} y1={trainY + carH * 0.64} x2={cx - 1.0} y2={trainY + carH * 0.56} stroke="#3050BB" strokeWidth="0.3" opacity="0.3" />
                        {/* Headlights quad */}
                        <rect x={cx - 1.25} y={trainY + carH * 0.26} width={0.22} height={0.25} fill="#FFEE88" opacity="0.95">
                          <animate attributeName="opacity" values="0.95;0.75;0.95" dur="1.5s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx - 1.25} y={trainY + carH * 0.36} width={0.22} height={0.2} fill="#FFDD77" opacity="0.8">
                          <animate attributeName="opacity" values="0.8;0.6;0.8" dur="1.8s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx - 1.25} y={trainY + carH * 0.6} width={0.18} height={0.12} fill="#FFCC66" opacity="0.7">
                          <animate attributeName="opacity" values="0.7;0.5;0.7" dur="2s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx - 1.25} y={trainY + carH * 0.65} width={0.18} height={0.08} fill="#FF8844" opacity="0.5" />
                        <polygon points={`${cx - 1.3},${trainY + carH * 0.28} ${cx - 5},${trainY + carH * 0.15} ${cx - 5},${trainY + carH * 0.7} ${cx - 1.3},${trainY + carH * 0.55}`} fill="#FFEE44" opacity="0.015" />
                        {/* Windshield */}
                        <rect x={cx + 0.15} y={trainY + carH * 0.1} width={1.5} height={carH * 0.52} fill="#2244AA" opacity="0.6" />
                        <rect x={cx + 0.88} y={trainY + carH * 0.1} width={0.1} height={carH * 0.52} fill="#1A1A48" opacity="0.5" />
                        <rect x={cx + 0.1} y={trainY + carH * 0.08} width={1.6} height={0.08} fill="#222250" opacity="0.5" />
                        {/* Wipers */}
                        <line x1={cx + 0.5} y1={trainY + carH * 0.58} x2={cx + 0.3} y2={trainY + carH * 0.15} stroke="#1E1E48" strokeWidth="0.04" opacity="0.3" />
                        <line x1={cx + 1.2} y1={trainY + carH * 0.58} x2={cx + 1.4} y2={trainY + carH * 0.15} stroke="#1E1E48" strokeWidth="0.04" opacity="0.3" />
                        {/* Dashboard */}
                        <rect x={cx + 0.2} y={trainY + carH * 0.48} width={1.3} height={carH * 0.1} fill="#113366" opacity="0.25" />
                        <rect x={cx + 0.35} y={trainY + carH * 0.5} width={0.15} height={0.1} fill="#22AA44" opacity="0.3" />
                        <rect x={cx + 0.55} y={trainY + carH * 0.5} width={0.1} height={0.1} fill="#FF6644" opacity="0.2" />
                        <rect x={cx + 0.75} y={trainY + carH * 0.5} width={0.2} height={0.08} fill="#4488CC" opacity="0.2" />
                        {/* Signs */}
                        <rect x={cx + 0.25} y={trainY + carH * 0.02} width={1.2} height={carH * 0.08} fill="#1133AA" opacity="0.8" />
                        <rect x={cx + 0.3} y={trainY + carH * 0.025} width={0.4} height={carH * 0.07} fill="#3366DD" opacity="0.6" />
                        <rect x={cx + 1.8} y={trainY + carH * 0.02} width={3.0} height={carH * 0.08} fill="#0E1E44" opacity="0.6" />
                        <rect x={cx + 1.85} y={trainY + carH * 0.025} width={2.9} height={carH * 0.07} fill="#224488" opacity="0.35" />
                        {/* Horn, coupler, pilot */}
                        <rect x={cx - 0.4} y={trainY - 0.15} width={0.5} height={0.18} fill="#1A1A44" opacity="0.5" />
                        <rect x={cx - 1.6} y={trainY + carH * 0.4} width={0.45} height={carH * 0.2} fill="#121235" />
                        <rect x={cx - 1.6} y={trainY + carH * 0.4} width={0.45} height={0.06} fill="#1A1A45" opacity="0.4" />
                        <polygon points={`${cx - 1.2},${trainY + carH * 0.72} ${cx - 1.5},${trainY + carH * 0.82} ${cx - 0.5},${trainY + carH * 0.82} ${cx},${trainY + carH * 0.72}`} fill="#141438" opacity="0.6" />
                        <rect x={cx + 0.05} y={trainY + carH * 0.08} width={0.12} height={0.12} fill="#FFAA44" opacity="0.6">
                          <animate attributeName="opacity" values="0.6;0.3;0.6" dur="2s" repeatCount="indefinite" />
                        </rect>
                      </g>
                    )}

                    {/* Tail car */}
                    {isTail && (
                      <g>
                        <polygon points={`${cx + carW},${trainY + 0.2} ${cx + carW + 1.2},${trainY + carH * 0.32} ${cx + carW + 1.2},${trainY + carH * 0.68} ${cx + carW},${trainY + carH - 0.2}`} fill="#1C1C4C" />
                        <line x1={cx + carW + 1.2} y1={trainY + carH * 0.32} x2={cx + carW + 1.2} y2={trainY + carH * 0.68} stroke="#1A1A4A" strokeWidth="0.06" opacity="0.25" />
                        <line x1={cx + carW} y1={trainY + carH * 0.64} x2={cx + carW + 1.0} y2={trainY + carH * 0.56} stroke="#3050BB" strokeWidth="0.3" opacity="0.25" />
                        <rect x={cx + carW + 1.05} y={trainY + carH * 0.28} width={0.2} height={0.2} fill="#FF3333" opacity="0.85" />
                        <rect x={cx + carW + 1.05} y={trainY + carH * 0.38} width={0.2} height={0.15} fill="#FF2222" opacity="0.65" />
                        <rect x={cx + carW + 1.05} y={trainY + carH * 0.58} width={0.18} height={0.12} fill="#FF4444" opacity="0.55" />
                        <rect x={cx + carW + 0.8} y={trainY + carH * 0.2} width={0.6} height={carH * 0.6} fill="#FF3333" opacity="0.04" />
                        <rect x={cx + carW - 1.65} y={trainY + carH * 0.1} width={1.5} height={carH * 0.52} fill="#1E3388" opacity="0.5" />
                        <rect x={cx + carW - 0.92} y={trainY + carH * 0.1} width={0.1} height={carH * 0.52} fill="#1A1A48" opacity="0.5" />
                        <rect x={cx + carW - 1.7} y={trainY + carH * 0.08} width={1.6} height={0.08} fill="#222250" opacity="0.5" />
                        <rect x={cx + carW + 1.15} y={trainY + carH * 0.4} width={0.45} height={carH * 0.2} fill="#121235" />
                        <polygon points={`${cx + carW + 1.2},${trainY + carH * 0.72} ${cx + carW + 1.5},${trainY + carH * 0.82} ${cx + carW + 0.5},${trainY + carH * 0.82} ${cx + carW},${trainY + carH * 0.72}`} fill="#141438" opacity="0.6" />
                        <rect x={cx + carW - 0.17} y={trainY + carH * 0.08} width={0.12} height={0.12} fill="#FF4444" opacity="0.5">
                          <animate attributeName="opacity" values="0.5;0.25;0.5" dur="2s" repeatCount="indefinite" />
                        </rect>
                        <rect x={cx + carW - 1.45} y={trainY + carH * 0.02} width={1.2} height={carH * 0.08} fill="#0E1E44" opacity="0.5" />
                      </g>
                    )}

                    {/* Windows with interior */}
                    {Array.from({ length: winCount }, (_, wi) => {
                      const winX = cx + winMargin + wi * (usableW / winCount);
                      const litSeed = (ci * 7 + wi * 13) % 10;
                      const isLit = litSeed < 7;
                      const winColor = isLit ? litSeed < 2 ? "#5599DD" : litSeed < 5 ? "#4488CC" : "#6AAADE" : "#1A1A3A";
                      return (
                        <g key={`win-${wi}`}>
                          <rect x={winX} y={winY} width={winW} height={winH} fill={winColor} opacity={isLit ? 0.75 : 0.25} />
                          <rect x={winX - 0.05} y={winY - 0.07} width={winW + 0.1} height={0.09} fill="#2A2A55" opacity="0.5" />
                          <rect x={winX - 0.05} y={winY + winH - 0.02} width={winW + 0.1} height={0.09} fill="#2A2A55" opacity="0.5" />
                          <rect x={winX - 0.07} y={winY} width={0.07} height={winH} fill="#222250" opacity="0.45" />
                          <rect x={winX + winW} y={winY} width={0.07} height={winH} fill="#222250" opacity="0.35" />
                          {isLit && (
                            <g>
                              <rect x={winX + 0.05} y={winY + 0.06} width={winW - 0.1} height={0.06} fill="#DDEEFF" opacity="0.15" />
                              <rect x={winX + 0.08} y={winY + winH * 0.18} width={winW - 0.16} height={0.04} fill="#8899BB" opacity="0.12" />
                              <rect x={winX + 0.05} y={winY + winH * 0.7} width={winW - 0.1} height={winH * 0.25} fill="#1A2244" opacity="0.25" />
                              <rect x={winX - 0.12} y={winY + winH} width={winW + 0.24} height={0.5} fill={winColor} opacity="0.04" />
                            </g>
                          )}
                          {isLit && wi % 3 === 1 && (
                            <g>
                              <rect x={winX + winW * 0.25} y={winY + winH * 0.12} width={winW * 0.2} height={winH * 0.5} fill="#0A0A30" opacity="0.2" />
                              <rect x={winX + winW * 0.2} y={winY + winH * 0.05} width={winW * 0.12} height={winH * 0.12} fill="#0A0A30" opacity="0.15" rx="0.05" />
                            </g>
                          )}
                          {isLit && wi % 4 === 2 && (
                            <g>
                              <rect x={winX + winW * 0.55} y={winY + winH * 0.15} width={winW * 0.18} height={winH * 0.45} fill="#0A0A30" opacity="0.18" />
                              <rect x={winX + winW * 0.52} y={winY + winH * 0.07} width={winW * 0.11} height={winH * 0.12} fill="#0A0A30" opacity="0.13" rx="0.04" />
                            </g>
                          )}
                          <rect x={winX + winW * 0.6} y={winY + 0.05} width={winW * 0.15} height={winH * 0.4} fill="#FFFFFF" opacity="0.04" />
                        </g>
                      );
                    })}

                    {/* Doors */}
                    {[0.28, 0.68].map((doorPos, di) => (
                      <g key={`door-${di}`}>
                        <rect x={cx + carW * doorPos - 0.55} y={trainY + carH * 0.13} width={1.1} height={carH * 0.74} fill="#141440" opacity="0.5" />
                        <rect x={cx + carW * doorPos - 0.5} y={trainY + carH * 0.14} width={0.47} height={carH * 0.72} fill="#181848" opacity="0.5" />
                        <rect x={cx + carW * doorPos + 0.03} y={trainY + carH * 0.14} width={0.47} height={carH * 0.72} fill="#181848" opacity="0.5" />
                        <rect x={cx + carW * doorPos - 0.03} y={trainY + carH * 0.14} width={0.06} height={carH * 0.72} fill="#0C0C28" opacity="0.6" />
                        <rect x={cx + carW * doorPos - 0.4} y={trainY + carH * 0.16} width={0.8} height={carH * 0.28} fill="#3366AA" opacity="0.45" />
                        <rect x={cx + carW * doorPos - 0.42} y={trainY + carH * 0.155} width={0.84} height={0.06} fill="#222250" opacity="0.4" />
                        <rect x={cx + carW * doorPos - 0.42} y={trainY + carH * 0.435} width={0.84} height={0.06} fill="#222250" opacity="0.4" />
                        <rect x={cx + carW * doorPos - 0.15} y={trainY + carH * 0.52} width={0.1} height={0.12} fill="#3A3A60" opacity="0.5" />
                        <rect x={cx + carW * doorPos + 0.07} y={trainY + carH * 0.52} width={0.1} height={0.12} fill="#3A3A60" opacity="0.5" />
                        <rect x={cx + carW * doorPos - 0.5} y={trainY + carH * 0.84} width={1.0} height={carH * 0.025} fill="#CCAA22" opacity="0.35" />
                        <rect x={cx + carW * doorPos - 0.58} y={trainY + carH * 0.14} width={0.06} height={carH * 0.72} fill="#2A2A55" opacity="0.3" />
                        <rect x={cx + carW * doorPos + 0.52} y={trainY + carH * 0.14} width={0.06} height={carH * 0.72} fill="#2A2A55" opacity="0.3" />
                      </g>
                    ))}

                    {/* Side display + emergency markings */}
                    <rect x={cx + carW * 0.46} y={trainY + carH * 0.06} width={carW * 0.08} height={carH * 0.05} fill="#0E1E44" opacity="0.5" />
                    <rect x={cx + carW * 0.462} y={trainY + carH * 0.065} width={carW * 0.076} height={carH * 0.04} fill="#224488" opacity="0.25" />
                    {[0.12, 0.88].map((ep, ei) => (
                      <rect key={`emg-${ei}`} x={cx + carW * ep} y={trainY + carH * 0.78} width={carW * 0.04} height={carH * 0.03} fill="#CC3333" opacity="0.2" />
                    ))}

                    {/* Grab rail + brackets */}
                    <rect x={cx + 0.3} y={trainY + carH * 0.83} width={carW - 0.6} height={0.06} fill="#2A2A55" opacity="0.35" />
                    {Array.from({ length: 5 }, (_, bi2) => (
                      <rect key={`grb-${bi2}`} x={cx + 0.5 + bi2 * ((carW - 1) / 4)} y={trainY + carH * 0.82} width={0.08} height={0.12} fill="#222250" opacity="0.25" />
                    ))}
                    {/* Car number plate */}
                    <rect x={cx + carW * 0.82} y={trainY + carH * 0.76} width={carW * 0.14} height={carH * 0.065} fill="#161640" opacity="0.4" />
                    <rect x={cx + carW * 0.825} y={trainY + carH * 0.763} width={carW * 0.13} height={carH * 0.055} fill="#2244AA" opacity="0.2" />

                    {/* Connectors / gangway */}
                    {ci < carCount - 1 && (
                      <g>
                        <rect x={cx + carW} y={trainY + carH * 0.08} width={carGap} height={carH * 0.84} fill="#101035" opacity="0.75" />
                        {Array.from({ length: 6 }, (_, li) => (
                          <rect key={`bellow-${li}`} x={cx + carW + carGap * ((li + 0.5) / 6)} y={trainY + carH * 0.08} width={0.04} height={carH * 0.84} fill="#1A1A45" opacity="0.5" />
                        ))}
                        <rect x={cx + carW - 0.12} y={trainY + carH - 0.18} width={carGap + 0.24} height={0.18} fill="#0E0E30" opacity="0.6" />
                        <rect x={cx + carW - 0.05} y={trainY + carH * 0.06} width={carGap + 0.1} height={0.08} fill="#1A1A40" opacity="0.4" />
                        <rect x={cx + carW + carGap * 0.3} y={trainY + carH * 0.12} width={carGap * 0.4} height={carH * 0.15} fill="#3366AA" opacity="0.06" />
                      </g>
                    )}

                    {/* Undercarriage */}
                    <rect x={cx + carW * 0.08} y={trainY + carH} width={carW * 0.26} height={0.55} fill="#121230" />
                    <rect x={cx + carW * 0.66} y={trainY + carH} width={carW * 0.26} height={0.55} fill="#121230" />
                    <rect x={cx + carW * 0.08} y={trainY + carH} width={0.08} height={0.55} fill="#1A1A40" opacity="0.5" />
                    <rect x={cx + carW * 0.34 - 0.08} y={trainY + carH} width={0.08} height={0.55} fill="#1A1A40" opacity="0.5" />
                    <rect x={cx + carW * 0.66} y={trainY + carH} width={0.08} height={0.55} fill="#1A1A40" opacity="0.5" />
                    <rect x={cx + carW * 0.92 - 0.08} y={trainY + carH} width={0.08} height={0.55} fill="#1A1A40" opacity="0.5" />
                    {[0.12, 0.24, 0.70, 0.82].map((sp, si) => (
                      <rect key={`spr-${si}`} x={cx + carW * sp} y={trainY + carH + 0.05} width={carW * 0.06} height={0.15} fill="#1E1E48" opacity="0.4" />
                    ))}
                    {[0.11, 0.18, 0.25, 0.31, 0.69, 0.76, 0.83, 0.89].map((wp, wi2) => (
                      <g key={`wh-${wi2}`}>
                        <rect x={cx + carW * wp} y={trainY + carH + 0.25} width={0.4} height={0.4} fill="#0A0A22" />
                        <rect x={cx + carW * wp + 0.12} y={trainY + carH + 0.33} width={0.16} height={0.16} fill="#141435" opacity="0.5" />
                      </g>
                    ))}
                    {[0.145, 0.28, 0.725, 0.86].map((bp, bri) => (
                      <rect key={`brk-${bri}`} x={cx + carW * bp} y={trainY + carH + 0.3} width={0.12} height={0.25} fill="#1A1A3A" opacity="0.3" />
                    ))}
                    <rect x={cx + carW * 0.36} y={trainY + carH + 0.05} width={carW * 0.12} height={0.35} fill="#0E0E2A" opacity="0.55" />
                    <rect x={cx + carW * 0.36} y={trainY + carH + 0.05} width={carW * 0.12} height={0.06} fill="#141438" opacity="0.35" />
                    <rect x={cx + carW * 0.50} y={trainY + carH + 0.08} width={carW * 0.08} height={0.28} fill="#0E0E2A" opacity="0.5" />
                    <rect x={cx + carW * 0.60} y={trainY + carH + 0.05} width={carW * 0.05} height={0.35} fill="#0E0E2A" opacity="0.45" />
                    <rect x={cx + carW * 0.42} y={trainY + carH + 0.42} width={carW * 0.06} height={0.12} fill="#101030" opacity="0.4" rx="0.04" />
                    <rect x={cx + carW * 0.55} y={trainY + carH + 0.42} width={carW * 0.06} height={0.12} fill="#101030" opacity="0.4" rx="0.04" />
                    <rect x={cx + carW * 0.1} y={trainY + carH + 0.02} width={carW * 0.8} height={0.04} fill="#161638" opacity="0.3" />
                  </g>
                );
              })}
            </g>
          </g>
        );
      })()}

      {/* Ground */}
      <rect x="0" y="96.5" width="100" height="3.5" fill="#040410" />
      {/* Sidewalk curb */}
      <rect x="0" y="96.5" width="100" height="0.15" fill="#1A1A3A" opacity="0.6" />
      {/* Sidewalk */}
      <rect x="0" y="96.65" width="100" height="0.6" fill="#0A0A20" />
      {/* Road */}
      <rect x="0" y="97.5" width="100" height="2.5" fill="#070716" />
      {/* Road wet reflection sheen */}
      <rect x="0" y="97.5" width="100" height="1" fill="url(#roadReflect)" />
      {/* Center lane dashes */}
      {Array.from({ length: 22 }, (_, i) => (
        <rect key={`lane${i}`} x={i * 5 + 0.5} y="98.5" width="2.2" height="0.18" fill="#2A2A50" opacity="0.4" />
      ))}

      {/* ── Animated cars on the road ── */}
      {[
        { y: 97.8, h: 0.9, w: 3.2, color: "#1A1A44", hl: "#FFEEAA", tl: "#FF3333", dur: 18, delay: 0, dir: 1 },
        { y: 98.9, h: 0.8, w: 2.6, color: "#22223A", hl: "#FFEEDD", tl: "#FF2222", dur: 24, delay: 5, dir: -1 },
        { y: 97.9, h: 0.85, w: 3.5, color: "#181830", hl: "#FFDDAA", tl: "#CC2222", dur: 15, delay: 9, dir: 1 },
        { y: 99.0, h: 0.7, w: 2.2, color: "#252540", hl: "#FFFFCC", tl: "#FF4444", dur: 22, delay: 14, dir: -1 },
        { y: 97.7, h: 0.9, w: 2.8, color: "#1E1E38", hl: "#FFEEBB", tl: "#EE2222", dur: 30, delay: 2, dir: 1 },
        { y: 98.8, h: 0.75, w: 3.0, color: "#202040", hl: "#FFEECC", tl: "#DD3333", dur: 20, delay: 18, dir: -1 },
      ].map((c, ci) => {
        const sx = c.dir === 1 ? -c.w - 2 : 102;
        const ex = c.dir === 1 ? 102 : -c.w - 2;
        const a = (offX: number) => ({ values: `${sx + offX};${ex + offX}`, dur: `${c.dur}s`, begin: `${c.delay}s`, repeatCount: "indefinite" as const });
        return (
          <g key={`car-${ci}`} opacity="0.85">
            <rect x={0} y={c.y} width={c.w} height={c.h} rx={0.15} fill={c.color}>
              <animate attributeName="x" {...a(0)} />
            </rect>
            <rect x={c.w * 0.25} y={c.y - c.h * 0.35} width={c.w * 0.45} height={c.h * 0.4} rx={0.08} fill={c.color} opacity="0.8">
              <animate attributeName="x" {...a(c.w * 0.25)} />
            </rect>
            <rect x={0} y={c.y - c.h * 0.3} width={c.w * 0.15} height={c.h * 0.32} fill="#223355" opacity="0.4">
              <animate attributeName="x" {...a(c.dir === 1 ? c.w * 0.55 : c.w * 0.2)} />
            </rect>
            <rect x={0} y={c.y + c.h * 0.15} width={0.4} height={c.h * 0.25} fill={c.hl} opacity="0.6">
              <animate attributeName="x" {...a(c.dir === 1 ? c.w - 0.1 : -0.3)} />
            </rect>
            <rect x={0} y={c.y + c.h * 0.55} width={0.4} height={c.h * 0.25} fill={c.hl} opacity="0.6">
              <animate attributeName="x" {...a(c.dir === 1 ? c.w - 0.1 : -0.3)} />
            </rect>
            <ellipse cx={0} cy={c.y + c.h * 0.5} rx={2} ry={c.h * 0.6} fill={c.hl} opacity="0.04">
              <animate attributeName="cx" {...a(c.dir === 1 ? c.w + 1.5 : -1.5)} />
            </ellipse>
            <rect x={0} y={c.y + c.h * 0.2} width={0.25} height={c.h * 0.2} fill={c.tl} opacity="0.7">
              <animate attributeName="x" {...a(c.dir === 1 ? -0.15 : c.w - 0.25)} />
            </rect>
            <rect x={0} y={c.y + c.h * 0.6} width={0.25} height={c.h * 0.2} fill={c.tl} opacity="0.7">
              <animate attributeName="x" {...a(c.dir === 1 ? -0.15 : c.w - 0.25)} />
            </rect>
          </g>
        );
      })}

      {/* Streetlights */}
      {streetlights.map((sl, i) => (
        <g key={`sl${i}`}>
          <rect x={sl.x} y="93.5" width="0.18" height="3.5" fill="#1A1A3A" />
          <rect x={sl.x - 0.6} y="93.5" width={1.4} height="0.12" fill="#1A1A3A" />
          <rect x={sl.x - 0.6} y="93.35" width="0.12" height="0.2" fill="#1A1A3A" />
          <rect x={sl.x - 0.55} y="93.15" width="0.3" height="0.25" fill="#FFDD88" opacity="0.75">
            <animate attributeName="opacity" values="0.75;0.55;0.75" dur={`${2.5 + (i % 3)}s`} repeatCount="indefinite" />
          </rect>
          <ellipse cx={sl.x - 0.4} cy="95.5" rx="1.5" ry="2.2" fill="url(#lampCone)" />
        </g>
      ))}

      {/* City glow wash — warm ambient along bottom */}
      <rect x="0" y="82" width="100" height="18" fill="#FF884412" />
      {/* Subtle blue ambient wash */}
      <rect x="0" y="88" width="100" height="12" fill="#4466AA08" />
    </svg>
  );
}

/* ── Chat types & helpers ───────────────────────────────────────────── */

interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  imageId?: string;
  edited?: boolean;
  editedAt?: number;
  reactions?: Record<string, string[]>; // reactionId -> userId[]
  nameColor?: string;   // sender-chosen name color
  chatColor?: string;   // sender-chosen message text color
}

interface StoredImage {
  data: string; // base64 data URL
  timestamp: number;
}

type ImageStore = Record<string, StoredImage>;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function loadImages(): ImageStore {
  return safeGetJson("inet-community-images", {});
}

function saveImages(store: ImageStore): void {
  safeSetJson("inet-community-images", store);
}

/** Remove images older than 3 days, return cleaned store */
function cleanExpiredImages(store: ImageStore): ImageStore {
  const now = Date.now();
  const cleaned: ImageStore = {};
  for (const [k, v] of Object.entries(store)) {
    if (now - v.timestamp < THREE_DAYS_MS) cleaned[k] = v;
  }
  return cleaned;
}

function getImageTimeLeft(ts: number): string {
  const remaining = THREE_DAYS_MS - (Date.now() - ts);
  if (remaining <= 0) return "Expired";
  const hrs = Math.floor(remaining / (60 * 60 * 1000));
  if (hrs >= 24) { const days = Math.floor(hrs / 24); return `${days}d ${hrs % 24}h left`; }
  if (hrs > 0) return `${hrs}h left`;
  const mins = Math.floor(remaining / (60 * 1000));
  return `${mins}m left`;
}

/* ── Sticker image map ────────────────────────────────────────────��── */


/* ── Built-in emoji reactions ───────────────────────────────────────��� */
interface ReactionDef {
  id: string;
  display: string; // emoji char or sticker id prefixed with "sticker:"
  label: string;
  type: "emoji" | "sticker";
}

const BUILTIN_EMOJI: ReactionDef[] = [
  { id: "thumbsup", display: "👍", label: "Thumbs Up", type: "emoji" },
  { id: "heart", display: "❤���", label: "Heart", type: "emoji" },
  { id: "laugh", display: "😂", label: "Laugh", type: "emoji" },
  { id: "fire", display: "��", label: "Fire", type: "emoji" },
  { id: "skull", display: "💀", label: "Skull", type: "emoji" },
  { id: "swords", display: "⚔️", label: "Swords", type: "emoji" },
  { id: "dice", display: "🎲", label: "Dice", type: "emoji" },
  { id: "dragon", display: "🐉", label: "Dragon", type: "emoji" },
  { id: "shield", display: "🛡️", label: "Shield", type: "emoji" },
  { id: "sparkles", display: "✨", label: "Sparkles", type: "emoji" },
];

const STICKER_REACTIONS: ReactionDef[] = Object.entries(STICKER_IMAGES).map(([id]) => ({
  id: `sticker:${id}`,
  display: id,
  label: id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
  type: "sticker" as const,
}));

interface CustomReactionDef {
  id: string;
  emoji: string;
  label: string;
}


interface ChatChannel {
  id: string;
  type: "main" | "dm";
  /** For DM channels: sorted pair of player IDs */
  participants?: string[];
  label: string;
  /** If this channel belongs to an NPC (DM-only view) */
  npcId?: string;
  npcName?: string;
}

interface PlayerInfo {
  id: string;
  name: string;
}

interface NpcAccount {
  id: string;       // e.g. "npc-abc123"
  name: string;
  color: string;    // display color
}

interface Nicknames { [playerId: string]: string; }

function getDmChannelId(a: string, b: string): string {
  return `dm-${[a, b].sort().join("-")}`;
}

function getDmChannelLabel(participants: string[], myId: string, players: PlayerInfo[], nicknames: Nicknames): string {
  const other = participants.find(p => p !== myId) || participants[0];
  const player = players.find(p => p.id === other);
  const name = player ? (nicknames[player.id] || player.name) : other;
  return name;
}

function formatTime(ts: number, is24h = false): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  if (is24h) return `${h.toString().padStart(2, "0")}:${m}`;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ── URL detection ────────────────────���────────────────────────────── */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractUrls(text: string): string[] {
  return (text.match(URL_REGEX) || []).filter((u, i, a) => a.indexOf(u) === i);
}

/** Renders message text with clickable links */
function RenderTextWithLinks({ text, color, fontSize }: { text: string; color: string; fontSize: number }) {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  const matches = [...text.matchAll(URL_REGEX)];
  for (const match of matches) {
    const idx = match.index!;
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <a
        key={idx}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:brightness-125 transition-colors inline-flex items-center gap-0.5"
        style={{ color: "#6A9ADA", wordBreak: "break-all" }}
      >
        {match[0].length > 60 ? match[0].slice(0, 57) + "…" : match[0]}
        <ExternalLink size={9} className="shrink-0 inline" style={{ opacity: 0.6 }} />
      </a>
    );
    lastIdx = idx + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <span style={{ color, fontSize }}>{parts}</span>;
}

/** Parse domain/path from a URL */
function parseUrlInfo(url: string): { domain: string; path: string; faviconUrl: string } {
  try {
    const u = new URL(url);
    return {
      domain: u.hostname,
      path: u.pathname + u.search,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`,
    };
  } catch {
    return { domain: url, path: "", faviconUrl: "" };
  }
}

interface LinkPreviewData {
  url: string;
  domain: string;
  path: string;
  faviconUrl: string;
  title?: string;
  description?: string;
  image?: string;
  loaded: boolean;
  error?: boolean;
}

/** Link preview card with IntersectionObserver for lazy load/unload */
function LinkPreviewCard({ url, accent, visible }: { url: string; accent: string; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    if (!visible) { setPreview(null); return; }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); setIsInView(false); };
  }, [visible]);

  // When scrolled out of view, clear the preview data (server removes thumbnail)
  useEffect(() => {
    if (!isInView) { setPreview(null); return; }
    // When in view, parse the URL info and attempt to fetch OG data
    const info = parseUrlInfo(url);
    const initial: LinkPreviewData = { url, ...info, loaded: false };
    setPreview(initial);

    // Try to fetch OG metadata via a lightweight approach
    let cancelled = false;
    (async () => {
      try {
        // Use jsonlink.io free tier for OG extraction
        const resp = await fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
        if (cancelled) return;
        if (resp.ok) {
          const data = await resp.json();
          if (cancelled) return;
          setPreview(prev => prev ? {
            ...prev,
            title: data.title || undefined,
            description: data.description || undefined,
            image: (data.images && data.images[0]) || undefined,
            loaded: true,
          } : null);
        } else {
          if (!cancelled) setPreview(prev => prev ? { ...prev, loaded: true } : null);
        }
      } catch {
        if (!cancelled) setPreview(prev => prev ? { ...prev, loaded: true, error: true } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [isInView, url]);

  if (!visible) return null;

  return (
    <div ref={ref} className="mt-1.5 mb-1 max-w-[380px]">
      {preview ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:brightness-110 transition-all"
          style={{
            background: "rgba(10,10,40,0.8)",
            border: `1px solid ${accent}22`,
            borderLeft: `3px solid ${accent}44`,
            borderRadius: 3,
            textDecoration: "none",
            overflow: "hidden",
          }}
        >
          {preview.image && (
            <div style={{ maxHeight: 160, overflow: "hidden" }}>
              <img
                src={preview.image}
                alt=""
                className="w-full"
                style={{ objectFit: "cover", maxHeight: 160 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="px-2.5 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <img src={preview.faviconUrl} alt="" className="w-4 h-4 shrink-0 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-[9px] truncate" style={{ color: "#5A7A9A" }}>{preview.domain}</span>
            </div>
            {preview.title && (
              <div className="text-[12px] font-semibold leading-tight mb-0.5 line-clamp-2" style={{ color: "#8AB4E8" }}>
                {preview.title}
              </div>
            )}
            {preview.description && (
              <div className="text-[10px] leading-snug line-clamp-2" style={{ color: "#6A7A9A" }}>
                {preview.description}
              </div>
            )}
            {!preview.loaded && (
              <div className="text-[9px] mt-1" style={S_DIM}>Loading preview…</div>
            )}
          </div>
        </a>
      ) : (
        <div className="py-1" />
      )}
    </div>
  );
}

/* ── Color Wheel Picker ────────────────────────────────────────────── */
function ColorWheelPicker({ currentColor, accent, onSelect, onClose }: {
  currentColor: string; accent: string; onSelect: (color: string) => void; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const [hexInput, setHexInput] = useState(currentColor);
  const size = 160;
  const radius = size / 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Draw HSL color wheel
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const angle = Math.atan2(dy, dx);
        const hue = ((angle * 180) / Math.PI + 360) % 360;
        const sat = Math.min(100, (dist / radius) * 100);
        const lum = 50 + (1 - dist / radius) * 20; // center is lighter
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
    setSelectedColor(hex);
    setHexInput(hex);
  };

  const handleHexChange = (val: string) => {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setSelectedColor(val);
    }
  };

  // Preset colors
  const presets = [
    "#FF6B6B", "#FF9A4A", "#FFD93D", "#6BCB77", "#4D96FF",
    "#9B59B6", "#E91E8C", "#F5F5F5", "#C0D0F0", "#FFD700",
    "#FF4444", "#00CED1", "#FF69B4", "#7FFF00", "#FF8C00",
  ];

  return (
    <div
      className="absolute z-50 p-3"
      style={{
        background: "rgba(12,12,40,0.97)",
        border: `1px solid ${accent}44`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        borderRadius: 6,
        width: 220,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold" style={S_TEXT}>Pick Color</span>
        <button onClick={onClose} className="p-0.5 hover:bg-[#FFFFFF08] rounded"><X size={11} style={S_MUTED} /></button>
      </div>
      {/* Color wheel */}
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="cursor-crosshair mx-auto block mb-2"
        style={{ borderRadius: "50%", border: `2px solid ${accent}33` }}
        onClick={handleCanvasClick}
      />
      {/* Preview + hex input */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded shrink-0" style={{ background: selectedColor, border: `1px solid ${accent}33` }} />
        <input
          type="text"
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          className="flex-1 bg-[#0A0A28] px-2 py-1 text-[11px] font-mono outline-none"
          style={{ color: "#C0D0F0", border: `1px solid ${accent}33` }}
          maxLength={7}
          placeholder="#FFFFFF"
        />
      </div>
      {/* Presets */}
      <div className="flex flex-wrap gap-1 mb-2">
        {presets.map(c => (
          <button
            key={c}
            className="w-5 h-5 rounded-sm hover:scale-110 transition-transform"
            style={{ background: c, border: selectedColor === c ? `2px solid white` : `1px solid ${accent}22` }}
            onClick={() => { setSelectedColor(c); setHexInput(c); }}
          />
        ))}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { onSelect(selectedColor); onClose(); }}
          className="flex-1 py-1.5 text-[11px] font-semibold transition-colors hover:brightness-110"
          style={{ background: `${accent}33`, color: accent, border: `1px solid ${accent}55`, borderRadius: 3 }}
        >
          Apply
        </button>
        <button
          onClick={() => { onSelect(""); onClose(); }}
          className="px-3 py-1.5 text-[11px] transition-colors hover:bg-[#FFFFFF08]"
          style={{ color: "#7A8AAA", border: `1px solid ${accent}22`, borderRadius: 3 }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ── Custom Slider ─────────────────────────────────────────��───────── */
function CustomSlider({ value, min, max, step, accent, onChange }: {
  value: number; min: number; max: number; step: number; accent: string; onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbSize = 14;

  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const updateFromEvent = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, parseFloat(snapped.toFixed(4)))));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    updateFromEvent(e.clientX);
  };

  return (
    <div
      ref={trackRef}
      className="relative cursor-pointer select-none"
      style={{ height: 20, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {/* Track bg */}
      <div className="absolute rounded-full" style={{ left: 0, right: 0, top: 8, height: 4, background: "#1A1A3B" }} />
      {/* Track fill */}
      <div className="absolute rounded-full" style={{ left: 0, width: `calc(${pct * 100}%)`, top: 8, height: 4, background: `${accent}66` }} />
      {/* Thumb */}
      <div
        className="absolute rounded-full"
        style={{
          width: thumbSize,
          height: thumbSize,
          top: (20 - thumbSize) / 2,
          left: `calc(${pct * 100}% - ${thumbSize * pct}px)`,
          background: accent,
          border: "2px solid #0A0A28",
          boxShadow: `0 0 4px ${accent}44`,
        }}
      />
    </div>
  );
}

/* ── Setting Toggle ──────────────────────────────────────────��────── */
function SettingToggle({ label, description, checked, onChange, accent }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void; accent: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => onChange(!checked)}
        className="mt-0.5 shrink-0 relative transition-colors"
        style={{
          width: 32, height: 16, borderRadius: 8,
          background: checked ? `${accent}44` : "#1A1A3B",
          border: `1px solid ${checked ? accent + "66" : "#2A2A4B"}`,
        }}
      >
        <div
          className="absolute rounded-full transition-all"
          style={{
            width: 10, height: 10, top: 2,
            left: checked ? 18 : 2,
            background: checked ? accent : "#4A5A7A",
          }}
        />
      </button>
      <div>
        <div className="text-[11px]" style={S_SUBTLE}>{label}</div>
        <div className="text-[9px]" style={S_DIM}>{description}</div>
      </div>
    </div>
  );
}

/* ── Community Page ─────────────────────────────────────────────────── */
export function CommunityPage() {
  const navigate = useNavigate();
  const theme = getPlayerTheme();
  const isPageVisible = usePageVisibility();

  // Current user
  const currentUser = safeGetItem("inet-user") || "";
  const currentUserId = safeGetItem("inet-user-id") || "";
  const isDM = currentUserId === "dm" || currentUser === "DM";

  // ─�� NPC accounts (DM only) ──
  const [npcAccounts, setNpcAccounts] = useState<NpcAccount[]>([]);
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [showNpcPicker, setShowNpcPicker] = useState(false);
  const [showNpcManager, setShowNpcManager] = useState(false);
  const [npcDraftName, setNpcDraftName] = useState("");
  const [npcDraftColor, setNpcDraftColor] = useState("#8A6ABB");
  const NPC_COLORS = ["#8A6ABB", "#6ABB8A", "#BB6A6A", "#6A8ABB", "#BB8A6A", "#6ABBB8", "#BB6ABB", "#9ABB6A", "#6A6ABB", "#BB9A6A", "#6ABB6A", "#BB6A9A"];
  const [serverPlayers, setServerPlayers] = useState<PlayerInfo[]>([]);
  const [customReactions, setCustomReactions] = useState<CustomReactionDef[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, { playerId: string; displayName?: string; hiddenDmChannels?: string[] }>>({});

  const addNpc = () => {
    const name = npcDraftName.trim();
    if (!name) return;
    const npc: NpcAccount = {
      id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color: npcDraftColor,
    };
    setNpcAccounts(prev => [...prev, npc]);
    setNpcDraftName("");
    setNpcDraftColor(NPC_COLORS[Math.floor(Math.random() * NPC_COLORS.length)]);
  };

  const deleteNpc = (id: string) => {
    setNpcAccounts(prev => prev.filter(n => n.id !== id));
    if (activeNpcId === id) setActiveNpcId(null);
  };

  const activeNpc = npcAccounts.find(n => n.id === activeNpcId) || null;

  // ── DM Oversight (view all conversations) ──
  const [showOversight, setShowOversight] = useState(false);
  const [oversightChannelId, setOversightChannelId] = useState<string | null>(null);

  // Load players (including NPC accounts)
  const allPlayers: PlayerInfo[] = useMemo(() => {
    const players = serverPlayers.map(p => ({ id: p.id, name: p.name }));
    for (const npc of npcAccounts) {
      if (!players.find(p => p.id === npc.id)) players.push({ id: npc.id, name: npc.name });
    }
    return players;
  }, [serverPlayers, npcAccounts]);

  // ── Profile pictures (batch fetched from server) ──
  const [profilePics, setProfilePics] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const playerIds = allPlayers.map(p => p.id).filter(id => !id.startsWith("npc-"));
    if (playerIds.length === 0) return;
    fetchProfilePictures(playerIds).then(pics => setProfilePics(pics));
  }, [allPlayers]);

  // Nicknames / profile
  const [nicknames, setNicknames] = useState<Nicknames>({});
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState("");

  const myDisplayName = nicknames[currentUserId] || currentUser || "Unknown";

  // Chat channels
  const [activeChannelId, setActiveChannelId] = useState("main");
  const [dmCollapsed, setDmCollapsed] = useState(false);
  const [hiddenDmChannels, setHiddenDmChannels] = useState<string[]>([]);

  // Build available channels
  const channels: ChatChannel[] = useMemo(() => {
    const chs: ChatChannel[] = [{ id: "main", type: "main", label: "General Chat" }];
    // Real players (non-NPC)
    const realPlayers = allPlayers.filter(p => !p.id.startsWith("npc-"));
    // Create DM channels for each other player
    for (const p of allPlayers) {
      if (p.id === currentUserId) continue;
      // For DM: skip NPC-to-DM channels (NPCs get their own section)
      if (isDM && p.id.startsWith("npc-")) continue;
      const dmId = getDmChannelId(currentUserId, p.id);
      chs.push({ id: dmId, type: "dm", participants: [currentUserId, p.id], label: p.id === "dm" ? "DM Chat" : (nicknames[p.id] || p.name) });
    }
    // For DM: add NPC-to-player channels
    if (isDM) {
      for (const npc of npcAccounts) {
        for (const rp of realPlayers) {
          if (rp.id === currentUserId) continue;
          const npcDmId = getDmChannelId(npc.id, rp.id);
          chs.push({
            id: npcDmId,
            type: "dm",
            participants: [npc.id, rp.id],
            label: nicknames[rp.id] || rp.name,
            npcId: npc.id,
            npcName: npc.name,
          });
        }
      }
    }
    return chs;
  }, [allPlayers, currentUserId, nicknames, isDM, npcAccounts]);

  const activeChannel = channels.find(c => c.id === activeChannelId) || channels[0];

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [communityReady, setCommunityReady] = useState(false);

  // Initial realtime/community load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedPlayers, loadedNpcs, loadedMessages, loadedImages, loadedReactions, loadedReadState, myProfile] = await Promise.all([
          listCommunityPlayers(),
          listNpcAccounts(),
          listAllMessages(),
          listCommunityImages(),
          listCustomReactions(),
          currentUserId ? loadCommunityReadState(currentUserId) : Promise.resolve({}),
          currentUserId ? loadCommunityProfile(currentUserId) : Promise.resolve({ playerId: currentUserId }),
        ]);
        if (cancelled) return;
        setServerPlayers(loadedPlayers);
        setNpcAccounts(loadedNpcs);
        setMessages(loadedMessages);
        setImageStore(Object.fromEntries(loadedImages.map(img => [img.id, { data: img.data, timestamp: img.timestamp }] as const)));
        setCustomReactions(loadedReactions);
        setLastRead(loadedReadState);
        setHiddenDmChannels(myProfile.hiddenDmChannels || []);
        const profileIds = loadedPlayers.map(p => p.id);
        const profiles = await loadCommunityProfiles(profileIds);
        if (cancelled) return;
        setProfileMap(profiles);
        setNicknames(Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, profile.displayName || ""]).filter(([, name]) => !!name)) as Nicknames);
      } catch (error) {
        console.error("Failed to load community data", error);
      } finally {
        if (!cancelled) setCommunityReady(true);
      }
    })();

    const unsubscribe = subscribeToCommunityMessages((message, eventType) => {
      setMessages(prev => {
        if (eventType === "DELETE") return prev.filter(m => m.id !== message.id);
        const index = prev.findIndex(m => m.id === message.id);
        if (index === -1) return [...prev, message].sort((a, b) => a.timestamp - b.timestamp);
        const next = [...prev];
        next[index] = message;
        return next.sort((a, b) => a.timestamp - b.timestamp);
      });
      if (notifSoundRef.current && message.senderId !== currentUserId && eventType === "INSERT") playNotifBeep();
    });

    return () => { cancelled = true; unsubscribe(); };
  }, [currentUserId]);

  useEffect(() => {
    if (!communityReady) return;
    void saveNpcAccounts(npcAccounts).catch((error) => console.error("Failed to save NPC accounts", error));
  }, [npcAccounts, communityReady]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannelId]);

  const channelMessages = useMemo(() => {
    return messages.filter(m => m.channelId === activeChannelId);
  }, [messages, activeChannelId]);

  // Unread counts per channel
  const [lastRead, setLastRead] = useState<Record<string, number>>({});

  // Mark active channel as read
  useEffect(() => {
    if (channelMessages.length > 0) {
      const latestTs = channelMessages[channelMessages.length - 1].timestamp;
      setLastRead(prev => {
        const next = { ...prev, [activeChannelId]: latestTs };
        if (currentUserId) void saveCommunityReadState(currentUserId, next).catch((error) => console.error("Failed to save read state", error));
        return next;
      });
    }
  }, [activeChannelId, channelMessages, currentUserId]);

  const getUnread = (chId: string): number => {
    const lr = lastRead[chId] || 0;
    return messages.filter(m => m.channelId === chId && m.timestamp > lr && m.senderId !== currentUserId && !(isDM && m.senderId.startsWith("npc-"))).length;
  };

  // (handleSend replaced by handleSendFull below)

  const handleNickSave = () => {
    const trimmed = nickDraft.trim();
    setNicknames(prev => {
      const next = { ...prev };
      if (trimmed) next[currentUserId] = trimmed;
      else delete next[currentUserId];
      return next;
    });
    const nextProfile = { ...(profileMap[currentUserId] || { playerId: currentUserId }), playerId: currentUserId, displayName: trimmed || undefined, hiddenDmChannels };
    setProfileMap(prev => ({ ...prev, [currentUserId]: nextProfile }));
    if (currentUserId) void saveCommunityProfile(currentUserId, nextProfile).catch((error) => console.error("Failed to save nickname", error));
    setEditingNick(false);
  };

  // ── Image store ──
  const [imageStore, setImageStore] = useState<ImageStore>({});
  const [pendingImage, setPendingImage] = useState<{ id: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setPendingImage({ id, data });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removePendingImage = () => setPendingImage(null);

  // ── Edit/Delete ──
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingMsgId && editInputRef.current) editInputRef.current.focus();
  }, [editingMsgId]);

  const startEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditDraft(msg.text);
  };

  const cancelEdit = () => { setEditingMsgId(null); setEditDraft(""); };

  const saveEdit = () => {
    if (!editingMsgId) return;
    const text = editDraft.trim();
    setMessages(prev => prev.map(m =>
      m.id === editingMsgId ? { ...m, text: text || m.text, edited: true, editedAt: Date.now() } : m
    ));
    const updated = messages.find(m => m.id === editingMsgId);
    if (updated) {
      void updateCommunityMessage({ ...updated, text: text || updated.text, edited: true, editedAt: Date.now() }).catch((error) => console.error("Failed to save edit", error));
    }
    setEditingMsgId(null);
    setEditDraft("");
  };

  const deleteMessage = (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    if (msg.imageId) {
      setImageStore(prev => {
        const next = { ...prev };
        delete next[msg.imageId!];
        return next;
      });
      void deleteCommunityImage(msg.imageId).catch((error) => console.error("Failed to delete image", error));
    }
    setMessages(prev => prev.filter(m => m.id !== msgId));
    void removeCommunityMessage(msgId).catch((error) => console.error("Failed to delete message", error));
    if (editingMsgId === msgId) cancelEdit();
  };

  // ── Updated send handler (with image support) ──
  const handleSendFull = () => {
    const text = draft.trim();
    if (!text && !pendingImage) return;
    const sendAsNpc = isDM && activeNpc;
    let sendChannelId = activeChannelId;
    if (sendAsNpc && activeChannel.type === "dm" && !activeChannel.npcId) {
      const otherPId = activeChannel.participants?.find(p => p !== currentUserId) || "";
      if (otherPId) {
        const npcChId = getDmChannelId(activeNpc.id, otherPId);
        sendChannelId = npcChId;
        setActiveChannelId(npcChId);
      }
    }
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      channelId: sendChannelId,
      senderId: sendAsNpc ? activeNpc.id : currentUserId,
      senderName: sendAsNpc ? activeNpc.name : myDisplayName,
      text,
      timestamp: Date.now(),
      imageId: pendingImage?.id,
      nameColor: sendAsNpc ? activeNpc.color : (nameColor || undefined),
      chatColor: chatColor || undefined,
    };
    if (pendingImage) {
      const image = { id: pendingImage.id, data: pendingImage.data, timestamp: Date.now(), uploadedBy: currentUserId };
      setImageStore(prev => ({ ...prev, [pendingImage.id]: { data: pendingImage.data, timestamp: image.timestamp } }));
      void saveCommunityImage(image).catch((error) => console.error("Failed to save image", error));
    }
    setMessages(prev => [...prev, msg]);
    void sendCommunityMessage(msg).catch((error) => console.error("Failed to send message", error));
    setDraft("");
    setPendingImage(null);
    inputRef.current?.focus();
  };

  // ── Paste image support (Ctrl+V) ──
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2MB"); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const data = reader.result as string;
            const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            setPendingImage({ id, data });
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // ── Delete with confirmation (Shift bypasses) ──
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteClick = (msgId: string, shiftHeld: boolean) => {
    if (shiftHeld) {
      deleteMessage(msgId);
    } else {
      setDeleteConfirmId(msgId);
    }
  };

  const confirmDelete = () => {
    if (deleteConfirmId) deleteMessage(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  // ── Reactions ──
  const allReactions = useMemo(() => {
    const custom = customReactions.map(c => ({ id: `custom:${c.id}`, display: c.emoji, label: c.label, type: "emoji" as const }));
    return [...BUILTIN_EMOJI, ...custom, ...STICKER_REACTIONS];
  }, [customReactions]);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const toggleReaction = (msgId: string, reactionId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      const users = reactions[reactionId] ? [...reactions[reactionId]] : [];
      const idx = users.indexOf(currentUserId);
      if (idx >= 0) {
        users.splice(idx, 1);
        if (users.length === 0) delete reactions[reactionId]; else reactions[reactionId] = users;
      } else {
        users.push(currentUserId);
        reactions[reactionId] = users;
      }
      const updated = { ...m, reactions: Object.keys(reactions).length > 0 ? reactions : undefined };
      void updateCommunityMessage(updated).catch((error) => console.error("Failed to save reaction", error));
      return updated;
    }));
    setReactionPickerMsgId(null);
  };

  const renderReactionDisplay = (rDef: ReactionDef, size: number = 14) => {
    if (rDef.type === "sticker") {
      const sId = rDef.display; // sticker id
      const img = STICKER_IMAGES[sId];
      if (img) return <img src={img} alt={rDef.label} style={{ width: size, height: size, objectFit: "contain" }} />;
      return <span style={{ fontSize: size - 2 }}>🖼️</span>;
    }
    return <span style={{ fontSize: size - 2 }}>{rDef.display}</span>;
  };

  // (groupedMessages + visibleMessages defined further below, after settings state)

  // Show channels sidebar on mobile
  const [showChannelsMobile, setShowChannelsMobile] = useState(false);

  // Hide chat panel to see skyline
  const [chatHidden, setChatHidden] = useState(false);

  // ── Settings ──
  const [showSettings, setShowSettings] = useState(false);

  const loadSetting = <T,>(key: string, fallback: T): T => safeGetJson(key, fallback);

  const [bgOpacity, setBgOpacity] = useState<number>(() => loadSetting("inet-community-bg-opacity", 0.45));
  const [use24h, setUse24h] = useState<boolean>(() => loadSetting("inet-community-24h", false));
  const [compactMode, setCompactMode] = useState<boolean>(() => loadSetting("inet-community-compact", false));
  const [fontSize, setFontSize] = useState<number>(() => loadSetting("inet-community-fontsize", 13));
  const [showTimestamps, setShowTimestamps] = useState<boolean>(() => loadSetting("inet-community-timestamps", true));
  const [notifSound, setNotifSound] = useState<boolean>(() => loadSetting("inet-community-notifsound", true));
  const [groupThreshold, setGroupThreshold] = useState<number>(() => loadSetting("inet-community-groupthreshold", 5));
  const [imgThumbnails, setImgThumbnails] = useState<boolean>(() => loadSetting("inet-community-imgthumbs", false));
  const [maxVisibleMsgs, setMaxVisibleMsgs] = useState<number>(() => loadSetting("inet-community-maxmsgs", 200));
  const [showLinkPreviews, setShowLinkPreviews] = useState<boolean>(() => loadSetting("inet-community-linkpreviews", true));
  const [nameColor, setNameColor] = useState<string>(() => loadSetting("inet-community-namecolor", ""));
  const [chatColor, setChatColor] = useState<string>(() => loadSetting("inet-community-chatcolor", ""));
  const [dmNameColor, setDmNameColor] = useState<string>(() => loadSetting("inet-community-dmnamecolor", "#FFD700"));

  const saveSetting = (key: string, value: unknown) => { safeSetJson(key, value); };

  useEffect(() => { saveSetting("inet-community-bg-opacity", bgOpacity); }, [bgOpacity]);
  useEffect(() => { saveSetting("inet-community-24h", use24h); }, [use24h]);
  useEffect(() => { saveSetting("inet-community-compact", compactMode); }, [compactMode]);
  useEffect(() => { saveSetting("inet-community-fontsize", fontSize); }, [fontSize]);
  useEffect(() => { saveSetting("inet-community-timestamps", showTimestamps); }, [showTimestamps]);
  useEffect(() => { saveSetting("inet-community-notifsound", notifSound); }, [notifSound]);
  useEffect(() => { saveSetting("inet-community-groupthreshold", groupThreshold); }, [groupThreshold]);
  useEffect(() => { saveSetting("inet-community-imgthumbs", imgThumbnails); }, [imgThumbnails]);
  useEffect(() => { saveSetting("inet-community-maxmsgs", maxVisibleMsgs); }, [maxVisibleMsgs]);
  useEffect(() => { saveSetting("inet-community-linkpreviews", showLinkPreviews); }, [showLinkPreviews]);
  useEffect(() => { saveSetting("inet-community-namecolor", nameColor); }, [nameColor]);
  useEffect(() => { saveSetting("inet-community-chatcolor", chatColor); }, [chatColor]);
  useEffect(() => { saveSetting("inet-community-dmnamecolor", dmNameColor); }, [dmNameColor]);

  useEffect(() => {
    if (!currentUserId || !communityReady) return;
    const nextProfile = { ...(profileMap[currentUserId] || { playerId: currentUserId }), playerId: currentUserId, displayName: nicknames[currentUserId] || undefined, hiddenDmChannels };
    setProfileMap(prev => ({ ...prev, [currentUserId]: nextProfile }));
    void saveCommunityProfile(currentUserId, nextProfile).catch((error) => console.error("Failed to save community profile", error));
  }, [hiddenDmChannels]);

  // Notification beep via Web Audio API
  const playNotifBeep = useRef(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 300);
    } catch {}
  }).current;

  // Ref to track notifSound for use in polling interval (avoids stale closure)
  const notifSoundRef = useRef(notifSound);
  useEffect(() => { notifSoundRef.current = notifSound; }, [notifSound]);

  // Track expanded images in thumbnail mode
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());

  // ── Lightbox ──
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchResultIdx, setSearchResultIdx] = useState(0);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return channelMessages.filter(m => m.text.toLowerCase().includes(q)).map(m => m.id);
  }, [searchQuery, channelMessages]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus();
  }, [showSearch]);

  useEffect(() => { setSearchResultIdx(0); }, [searchResults.length]);

  // Scroll to search result
  const scrollToSearchResult = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    if (searchResults.length > 0 && searchResults[searchResultIdx]) {
      scrollToSearchResult(searchResults[searchResultIdx]);
    }
  }, [searchResultIdx, searchResults, scrollToSearchResult]);

  // ── Color picker popups ──
  const [showNameColorPicker, setShowNameColorPicker] = useState(false);
  const [showChatColorPicker, setShowChatColorPicker] = useState(false);
  const [showDmNameColorPicker, setShowDmNameColorPicker] = useState(false);

  // ── Max visible messages ──
  const [showAllMessages, setShowAllMessages] = useState(false);

  // Reset show all when switching channels
  useEffect(() => { setShowAllMessages(false); }, [activeChannelId]);

  // Apply max visible messages limit (bypass when searching so results are always reachable)
  const visibleMessages = useMemo(() => {
    if (showAllMessages || searchQuery.trim() || channelMessages.length <= maxVisibleMsgs) return channelMessages;
    return channelMessages.slice(-maxVisibleMsgs);
  }, [channelMessages, maxVisibleMsgs, showAllMessages, searchQuery]);

  const hiddenCount = channelMessages.length - visibleMessages.length;

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; msgs: ChatMessage[] }[] = [];
    let lastDate = "";
    for (const m of visibleMessages) {
      const d = formatDate(m.timestamp);
      if (d !== lastDate) {
        groups.push({ date: d, msgs: [m] });
        lastDate = d;
      } else {
        groups[groups.length - 1].msgs.push(m);
      }
    }
    return groups;
  }, [visibleMessages]);

  const accent = firstColor(theme.accentColor);

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col"
      style={{
        background: "#010108",
        fontFamily: "'Tahoma', 'Verdana', 'Arial', sans-serif",
      }}
    >
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        <PixelSkyline />
        {/* Bright white/grey star — original position */}
        <SkylineStar top="6%" right="13%" size={32} flareLen={90} colors={STAR_WHITE_GREY} animId="starWhite" animDur={3} />
        {/* White + pale yellow star */}
        <SkylineStar top="12%" left="8%" size={24} flareLen={65} colors={STAR_PALE_YELLOW} animId="starYellow" animDur={3.5} />
        {/* Light/dark blue shades star */}
        <SkylineStar top="4%" left="38%" size={20} flareLen={50} colors={STAR_BLUE_SHADES} animId="starBlue" animDur={4} />
        {/* Dark blue + bright red star */}
        <SkylineStar top="18%" right="32%" size={22} flareLen={55} colors={STAR_DARK_BLUE_RED} animId="starRed" animDur={3.2} />
      </div>


      {/* �����═ Chat Panel Overlay ═══ */}
      {/* ── Top Navigation Bar ── */}
      <div
        className="relative z-20 shrink-0 flex items-center gap-2 px-3 py-1.5"
        style={{
          background: "rgba(6,6,28,0.92)",
          borderBottom: `1px solid ${accent}22`,
          backdropFilter: "blur(6px)",
        }}
      >
        <button
          onClick={() => navigate("/interface")}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-[#FFFFFF0A] rounded"
          style={{ color: "#C0D0F0", border: `1px solid ${accent}22` }}
          title="Return to Interface"
        >
          <ArrowLeft size={12} style={{ color: accent }} />
          Interface
        </button>
        <button
          onClick={() => navigate("/interface/personal-files")}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-[#FFFFFF0A] rounded"
          style={{ color: "#C0D0F0", border: `1px solid ${accent}22` }}
          title="Open Personal Files"
        >
          <FolderOpen size={12} style={{ color: accent }} />
          Personal Files
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setChatHidden(h => !h)}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold transition-colors rounded"
          style={{
            color: chatHidden ? "#000" : "#C0D0F0",
            background: chatHidden ? accent : "transparent",
            border: `1px solid ${chatHidden ? accent : `${accent}22`}`,
          }}
          title={chatHidden ? "Show Chat" : "Hide Chat"}
        >
          {chatHidden ? <Eye size={12} /> : <EyeOff size={12} style={{ color: accent }} />}
          {chatHidden ? "Show Chat" : "Hide Chat"}
        </button>
      </div>

      <div className={`relative z-10 flex flex-1 min-h-0 transition-opacity duration-300 ${chatHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`} style={{ background: `rgba(1,1,8,${bgOpacity})`, backdropFilter: chatHidden ? "none" : "blur(2px)" }}>

        {/* ── Left: Channel List ── */}
        <div
          className={`shrink-0 flex flex-col ${showChannelsMobile ? "absolute inset-y-0 left-0 z-20" : "hidden md:flex"}`}
          style={{
            width: 220,
            background: "rgba(8,8,32,0.92)",
            borderRight: `1px solid ${accent}33`,
          }}
        >
          {/* Header */}
          <div className="px-3 py-3" style={{ borderBottom: `1px solid ${accent}22` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[14px] font-bold" style={{ color: accent }}>Community</span>
              <button className="md:hidden" onClick={() => setShowChannelsMobile(false)}><X size={14} style={S_MUTED} /></button>
            </div>
            {/* Nickname edit */}
            <div className="flex items-center gap-1 mt-2">
              {editingNick ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={nickDraft}
                    onChange={(e) => setNickDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleNickSave(); if (e.key === "Escape") setEditingNick(false); }}
                    placeholder={currentUser}
                    className="flex-1 bg-[#0A0A28] px-2 py-1 text-[11px] outline-none"
                    style={{ color: "#C0D0F0", border: `1px solid ${accent}44` }}
                    autoFocus
                    maxLength={24}
                  />
                  <button onClick={handleNickSave} title="Save"><Check size={12} style={S_GREEN_BTN} /></button>
                  <button onClick={() => setEditingNick(false)} title="Cancel"><X size={12} style={S_RED} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {profilePics[currentUserId] ? (
                    <img src={profilePics[currentUserId]!} alt="" className="w-5 h-5 rounded shrink-0 object-cover" draggable={false} />
                  ) : (
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#4ADE80" }} />
                  )}
                  <span className="text-[11px] truncate" style={S_TEXT}>
                    {myDisplayName}
                  </span>
                  {isDM && <Crown size={10} style={{ color: dmNameColor }} className="shrink-0" />}
                  <button onClick={() => { setNickDraft(nicknames[currentUserId] || ""); setEditingNick(true); }} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity" title="Set nickname">
                    <Edit3 size={10} style={S_SUBTLE} />
                  </button>
                </div>
              )}
            </div>
            <div className="text-[9px] mt-1" style={S_DIM}>
              {nicknames[currentUserId] ? `(${currentUser})` : "Click ✎ to set a nickname"}
            </div>
          </div>

          {/* Channels */}
          <div className="flex-1 overflow-y-auto py-2">
            {/* Main chat */}
            <div className="px-2 mb-1">
              <div className="text-[9px] uppercase tracking-widest px-2 mb-1" style={{ color: "#4A5A7A", fontWeight: 600 }}>Channels</div>
              <button
                onClick={() => { setActiveChannelId("main"); setShowChannelsMobile(false); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] transition-colors hover:bg-[#FFFFFF08]"
                style={{
                  color: activeChannelId === "main" ? "#FFFFFF" : "#7A8AAA",
                  background: activeChannelId === "main" ? `${accent}18` : "transparent",
                  borderLeft: activeChannelId === "main" ? `2px solid ${accent}` : "2px solid transparent",
                }}
              >
                <Hash size={13} style={{ color: activeChannelId === "main" ? accent : "#4A5A7A" }} />
                <span className="flex-1 text-left truncate">General Chat</span>
                {(() => { const u = getUnread("main"); return u > 0 ? <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: accent, color: "#000" }}>{u}</span> : null; })()}
              </button>
            </div>

            {/* DM channels (own) */}
            {(() => {
              const ownDmChs = channels.filter(c => c.type === "dm" && !c.npcId);
              const visibleDmChs = ownDmChs.filter(ch => {
                if (activeChannelId === ch.id) return true;
                const hasMessages = messages.some(m => m.channelId === ch.id);
                if (!hasMessages) return false;
                if (hiddenDmChannels.includes(ch.id) && getUnread(ch.id) === 0) return false;
                return true;
              });
              if (visibleDmChs.length === 0 && ownDmChs.length === 0) return null;
              return (
                <div className="px-2 mt-3">
                  <button
                    onClick={() => setDmCollapsed(c => !c)}
                    className="flex items-center gap-1 w-full px-2 mb-1 hover:opacity-80 transition-opacity"
                  >
                    <div className="text-[9px] uppercase tracking-widest flex-1 text-left" style={{ color: "#4A5A7A", fontWeight: 600 }}>Direct Messages</div>
                    {dmCollapsed ? <ChevronUp size={10} style={{ color: "#4A5A7A" }} /> : <ChevronDown size={10} style={{ color: "#4A5A7A" }} />}
                  </button>
                  {!dmCollapsed && visibleDmChs.map(ch => {
                    const unread = getUnread(ch.id);
                    const isActive = activeChannelId === ch.id;
                    const otherPId = ch.participants?.find(p => p !== currentUserId) || "";
                    const otherIsDM = otherPId === "dm";
                    return (
                      <div key={ch.id} className="group flex items-center hover:bg-[#FFFFFF08] transition-colors" style={{
                        background: isActive ? `${accent}18` : "transparent",
                        borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
                      }}>
                        <button
                          onClick={() => { setActiveChannelId(ch.id); setShowChannelsMobile(false); }}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[12px] min-w-0"
                          style={{ color: isActive ? "#FFFFFF" : "#7A8AAA" }}
                        >
                          <Lock size={11} style={{ color: isActive ? accent : "#3A4A6A" }} />
                          <span className="flex-1 text-left truncate">{ch.label}</span>
                          {otherIsDM && <Crown size={9} style={{ color: dmNameColor }} />}
                          {unread > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: accent, color: "#000" }}>{unread}</span>}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setHiddenDmChannels(prev => [...prev, ch.id]); if (activeChannelId === ch.id) setActiveChannelId("main"); }}
                          className="shrink-0 p-1 mr-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                          title="Hide conversation"
                        >
                          <X size={10} style={S_DIM} />
                        </button>
                      </div>
                    );
                  })}
                  {!dmCollapsed && visibleDmChs.length === 0 && (
                    <div className="text-[10px] px-2 py-2" style={S_DIM}>No active conversations</div>
                  )}
                </div>
              );
            })()}

            {/* NPC DM channels (DM only) */}
            {isDM && (() => {
              const npcIds = [...new Set(channels.filter(c => c.npcId).map(c => c.npcId!))];
              if (npcIds.length === 0) return null;
              return npcIds.map(nId => {
                const npcChs = channels.filter(c => c.npcId === nId);
                const npcName = npcChs[0]?.npcName || nId;
                const npcColor = npcAccounts.find(n => n.id === nId)?.color || "#8A6ABB";
                return (
                  <div key={nId} className="px-2 mt-3">
                    <div className="flex items-center gap-1.5 px-2 mb-1">
                      <Bot size={9} style={{ color: npcColor }} />
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: npcColor, fontWeight: 600 }}>{npcName}</div>
                    </div>
                    {npcChs.map(ch => {
                      const unread = getUnread(ch.id);
                      const isActive = activeChannelId === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => { setActiveChannelId(ch.id); setActiveNpcId(nId); setShowChannelsMobile(false); }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] transition-colors hover:bg-[#FFFFFF08]"
                          style={{
                            color: isActive ? "#FFFFFF" : "#7A8AAA",
                            background: isActive ? `${npcColor}18` : "transparent",
                            borderLeft: isActive ? `2px solid ${npcColor}` : "2px solid transparent",
                          }}
                        >
                          <Lock size={11} style={{ color: isActive ? npcColor : "#3A4A6A" }} />
                          <span className="flex-1 text-left truncate">{ch.label}</span>
                          {unread > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: npcColor, color: "#000" }}>{unread}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}

            {/* DM Oversight — view all conversations */}
            {isDM && (
              <div className="px-2 mt-3">
                <button
                  onClick={() => { setShowOversight(true); setOversightChannelId(null); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] transition-colors hover:bg-[#FFFFFF08]"
                  style={{ color: dmNameColor, background: `${dmNameColor}08`, border: `1px solid ${dmNameColor}18`, borderRadius: 2 }}
                >
                  <Eye size={12} style={{ color: dmNameColor }} />
                  <span className="flex-1 text-left">All Conversations</span>
                  <Crown size={9} style={{ color: dmNameColor }} />
                </button>
              </div>
            )}

            {/* NPC Accounts section (DM only) */}
            {isDM && (
              <div className="px-2 mt-3">
                <button
                  onClick={() => setShowNpcManager(p => !p)}
                  className="flex items-center gap-1 w-full px-2 mb-1"
                >
                  <div className="text-[9px] uppercase tracking-widest flex-1 text-left" style={{ color: "#4A5A7A", fontWeight: 600 }}>NPC Accounts</div>
                  <Bot size={10} style={{ color: "#4A5A7A" }} />
                  {showNpcManager ? <ChevronDown size={10} style={{ color: "#4A5A7A" }} /> : <ChevronUp size={10} style={{ color: "#4A5A7A" }} />}
                </button>
                {showNpcManager && (
                  <div className="mt-1">
                    {/* Existing NPCs */}
                    {npcAccounts.map(npc => (
                      <div key={npc.id} className="flex items-center gap-1.5 px-2 py-1 group hover:bg-[#FFFFFF06] transition-colors">
                        <div className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-[9px] font-bold" style={{ background: `${npc.color}22`, color: npc.color }}>
                          {npc.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 text-[11px] truncate" style={{ color: npc.color }}>{npc.name}</span>
                        <button
                          onClick={() => deleteNpc(npc.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#FFFFFF10] rounded transition-all"
                          title={`Delete ${npc.name}`}
                        >
                          <X size={10} style={S_RED} />
                        </button>
                      </div>
                    ))}
                    {npcAccounts.length === 0 && (
                      <div className="text-[10px] px-2 py-1" style={S_DIM}>No NPC accounts yet</div>
                    )}
                    {/* Add new NPC */}
                    <div className="mt-1.5 px-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={npcDraftName}
                          onChange={(e) => setNpcDraftName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addNpc(); }}
                          placeholder="NPC name..."
                          maxLength={24}
                          className="flex-1 bg-[#0A0A28] px-2 py-1 text-[10px] outline-none min-w-0"
                          style={{ color: "#C0D0F0", border: `1px solid ${accent}22`, borderRadius: 2 }}
                        />
                        <button
                          onClick={addNpc}
                          disabled={!npcDraftName.trim()}
                          className="p-1 transition-colors shrink-0"
                          style={{ color: npcDraftName.trim() ? "#4ADE80" : "#2A3A5A" }}
                          title="Create NPC"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      {/* Color swatches */}
                      <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
                        {NPC_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setNpcDraftColor(c)}
                            className="w-3.5 h-3.5 rounded-sm transition-all"
                            style={{
                              background: c,
                              outline: npcDraftColor === c ? `2px solid ${c}` : "1px solid #FFFFFF15",
                              outlineOffset: npcDraftColor === c ? 1 : 0,
                              opacity: npcDraftColor === c ? 1 : 0.6,
                            }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>


        </div>

        {/* ── Center: Chat Area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ background: "rgba(8,8,32,0.9)", borderBottom: `1px solid ${accent}22` }}>
            <div className="flex items-center gap-2">
              <button className="md:hidden mr-1" onClick={() => setShowChannelsMobile(true)}>
                <MessageSquare size={16} style={{ color: accent }} />
              </button>
              {activeChannel.type === "main" ? (
                <Hash size={16} style={{ color: accent }} />
              ) : (
                <Lock size={14} style={{ color: accent }} />
              )}
              <span className="text-[14px] font-semibold" style={S_TEXT}>
                {activeChannel.type === "main" ? "General Chat" : activeChannel.label}
              </span>
              {activeChannel.npcId && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm" style={{ background: `${npcAccounts.find(n => n.id === activeChannel.npcId)?.color || "#8A6ABB"}22`, color: npcAccounts.find(n => n.id === activeChannel.npcId)?.color || "#8A6ABB", border: `1px solid ${npcAccounts.find(n => n.id === activeChannel.npcId)?.color || "#8A6ABB"}44`, fontWeight: 600 }}>
                  via {activeChannel.npcName}
                </span>
              )}
              {activeChannel.type === "dm" && !activeChannel.npcId && (() => {
                const otherPId = activeChannel.participants?.find(p => p !== currentUserId) || "";
                return otherPId === "dm" ? <Crown size={11} style={{ color: dmNameColor }} /> : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px]" style={{ color: "#4A5A7A" }}>
                {activeChannel.type === "main" ? `${allPlayers.length} members` : "Private conversation"}
              </div>
              <button
                onClick={() => { setShowSearch(s => !s); if (showSearch) { setSearchQuery(""); } }}
                className="p-1 hover:bg-[#FFFFFF08] transition-colors rounded"
                title="Search messages"
              >
                <Search size={13} style={{ color: showSearch ? accent : "#4A5A7A" }} />
              </button>
              <button
                onClick={() => setShowSettings(s => !s)}
                className="p-1 hover:bg-[#FFFFFF08] transition-colors rounded"
                title="Chat Settings"
              >
                <Settings size={13} style={{ color: showSettings ? accent : "#4A5A7A" }} />
              </button>
            </div>
          </div>

          {/* ── Search Bar ── */}
          {showSearch && (
            <div className="shrink-0 px-4 py-2 flex items-center gap-2" style={{ background: "rgba(8,8,32,0.9)", borderBottom: `1px solid ${accent}15` }}>
              <Search size={12} style={{ color: "#4A5A7A" }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    setSearchResultIdx(prev => (prev + 1) % searchResults.length);
                  }
                  if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); }
                }}
                placeholder="Search messages…"
                className="flex-1 bg-[#0A0A28] px-3 py-1.5 text-[12px] outline-none"
                style={{ color: "#C0D0F0", border: `1px solid ${accent}22`, borderRadius: 2 }}
              />
              {searchQuery && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: searchResults.length > 0 ? "#7A8AAA" : "#9A4A4A" }}>
                    {searchResults.length > 0 ? `${searchResultIdx + 1}/${searchResults.length}` : "0 results"}
                  </span>
                  {searchResults.length > 1 && (
                    <div style={DISPLAY_CONTENTS}>
                      <button
                        onClick={() => setSearchResultIdx(prev => (prev - 1 + searchResults.length) % searchResults.length)}
                        className="p-0.5 hover:bg-[#FFFFFF08] rounded"
                        style={{ color: "#5A6A8A", transform: "rotate(180deg)" }}
                      >
                        <ChevronDown size={12} />
                      </button>
                      <button
                        onClick={() => setSearchResultIdx(prev => (prev + 1) % searchResults.length)}
                        className="p-0.5 hover:bg-[#FFFFFF08] rounded"
                        style={S_MUTED}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="p-0.5 hover:bg-[#FFFFFF08] rounded">
                <X size={12} style={S_MUTED} />
              </button>
            </div>
          )}

          {/* ── Settings Panel ── */}
          {showSettings && (
            <div className="shrink-0 px-4 py-3" style={{ background: "rgba(8,8,32,0.95)", borderBottom: `1px solid ${accent}22` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Settings size={13} style={{ color: accent }} />
                  <span className="text-[12px] font-semibold" style={S_TEXT}>Chat Settings</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!confirm("Reset all chat settings to their defaults?")) return;
                      setBgOpacity(0.45);
                      setUse24h(false);
                      setCompactMode(false);
                      setFontSize(13);
                      setShowTimestamps(true);
                      setNotifSound(true);
                      setGroupThreshold(5);
                      setImgThumbnails(false);
                      setMaxVisibleMsgs(200);
                      setShowLinkPreviews(true);
                      setNameColor("");
                      setChatColor("");
                      setDmNameColor("#FFD700");
                      setShowNameColorPicker(false);
                      setShowChatColorPicker(false);
                      setShowDmNameColorPicker(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] transition-colors hover:bg-[#FFFFFF08] rounded"
                    style={{ color: "#7A8AAA", border: `1px solid ${accent}22` }}
                    title="Reset all settings to defaults"
                  >
                    <RotateCcw size={10} />
                    Reset Defaults
                  </button>
                  <button onClick={() => setShowSettings(false)} className="p-0.5 hover:bg-[#FFFFFF08] rounded">
                    <X size={12} style={S_MUTED} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                {/* Background opacity — custom slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={S_SUBTLE}>Background Opacity</span>
                    <span className="text-[10px] font-mono" style={{ color: "#4A5A7A" }}>{Math.round(bgOpacity * 100)}%</span>
                  </div>
                  <CustomSlider value={bgOpacity} min={0} max={0.9} step={0.05} accent={accent} onChange={setBgOpacity} />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px]" style={S_DIM}>More skyline</span>
                    <span className="text-[9px]" style={S_DIM}>More overlay</span>
                  </div>
                </div>
                {/* Font size — custom slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={S_SUBTLE}>Message Font Size</span>
                    <span className="text-[10px] font-mono" style={{ color: "#4A5A7A" }}>{fontSize}px</span>
                  </div>
                  <CustomSlider value={fontSize} min={10} max={18} step={1} accent={accent} onChange={setFontSize} />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px]" style={S_DIM}>Smaller</span>
                    <span className="text-[9px]" style={S_DIM}>Larger</span>
                  </div>
                </div>
                {/* Toggle: 24h time */}
                <SettingToggle label="24-hour Time Format" description="Show timestamps as 14:30 instead of 2:30 PM" checked={use24h} onChange={setUse24h} accent={accent} />
                {/* Toggle: Compact mode */}
                <SettingToggle label="Compact Mode" description="Reduce spacing and hide avatars for a denser chat view" checked={compactMode} onChange={setCompactMode} accent={accent} />
                {/* Toggle: Show timestamps */}
                <SettingToggle label="Show Timestamps" description="Display time next to each message" checked={showTimestamps} onChange={setShowTimestamps} accent={accent} />
                {/* Toggle: Notification sound */}
                <SettingToggle label="Notification Sound" description="Play a chime when new messages arrive from others" checked={notifSound} onChange={setNotifSound} accent={accent} />
                {/* Toggle: Image thumbnails */}
                <SettingToggle label="Image Thumbnails" description="Show shared images as small thumbnails — click to expand" checked={imgThumbnails} onChange={setImgThumbnails} accent={accent} />
                {/* Message grouping threshold ��� custom slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={S_SUBTLE}>Message Grouping</span>
                    <span className="text-[10px] font-mono" style={{ color: "#4A5A7A" }}>{groupThreshold} min</span>
                  </div>
                  <CustomSlider value={groupThreshold} min={1} max={15} step={1} accent={accent} onChange={setGroupThreshold} />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px]" style={S_DIM}>Frequent headers</span>
                    <span className="text-[9px]" style={S_DIM}>Fewer headers</span>
                  </div>
                </div>
                {/* Max visible messages — custom slider */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px]" style={S_SUBTLE}>Max Visible Messages</span>
                    <span className="text-[10px] font-mono" style={{ color: "#4A5A7A" }}>{maxVisibleMsgs}</span>
                  </div>
                  <CustomSlider value={maxVisibleMsgs} min={50} max={500} step={25} accent={accent} onChange={setMaxVisibleMsgs} />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px]" style={S_DIM}>Fewer (faster)</span>
                    <span className="text-[9px]" style={S_DIM}>More (slower)</span>
                  </div>
                </div>
                {/* Toggle: Link previews */}
                <SettingToggle label="Link Thumbnails" description="Show preview cards with title, description, and image for shared links" checked={showLinkPreviews} onChange={setShowLinkPreviews} accent={accent} />
                {/* Name color */}
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => { setShowNameColorPicker(s => !s); setShowChatColorPicker(false); setShowDmNameColorPicker(false); }}
                      className="mt-0.5 shrink-0 w-8 h-4 rounded transition-colors hover:brightness-110"
                      style={{
                        background: nameColor || accent,
                        border: `1px solid ${nameColor ? nameColor + "88" : accent + "66"}`,
                      }}
                    />
                    <div>
                      <div className="text-[11px]" style={S_SUBTLE}>Name Color</div>
                      <div className="text-[9px]" style={S_DIM}>Color your display name in chat · {nameColor || "default (theme)"}</div>
                    </div>
                  </div>
                  {showNameColorPicker && (
                    <div className="absolute top-6 left-0 z-50">
                      <ColorWheelPicker
                        currentColor={nameColor || accent}
                        accent={accent}
                        onSelect={(c) => setNameColor(c)}
                        onClose={() => setShowNameColorPicker(false)}
                      />
                    </div>
                  )}
                </div>
                {/* Chat color */}
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => { setShowChatColorPicker(s => !s); setShowNameColorPicker(false); setShowDmNameColorPicker(false); }}
                      className="mt-0.5 shrink-0 w-8 h-4 rounded transition-colors hover:brightness-110"
                      style={{
                        background: chatColor || "#B0C0E0",
                        border: `1px solid ${chatColor ? chatColor + "88" : "#B0C0E066"}`,
                      }}
                    />
                    <div>
                      <div className="text-[11px]" style={S_SUBTLE}>Chat Color</div>
                      <div className="text-[9px]" style={S_DIM}>Color your message text · {chatColor || "default (#B0C0E0)"}</div>
                    </div>
                  </div>
                  {showChatColorPicker && (
                    <div className="absolute top-6 left-0 z-50">
                      <ColorWheelPicker
                        currentColor={chatColor || "#B0C0E0"}
                        accent={accent}
                        onSelect={(c) => setChatColor(c)}
                        onClose={() => setShowChatColorPicker(false)}
                      />
                    </div>
                  )}
                </div>
                {/* DM Name Color */}
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => { setShowDmNameColorPicker(s => !s); setShowNameColorPicker(false); setShowChatColorPicker(false); }}
                      className="mt-0.5 shrink-0 w-8 h-4 rounded transition-colors hover:brightness-110"
                      style={{
                        background: dmNameColor,
                        border: `1px solid ${dmNameColor}88`,
                      }}
                    />
                    <div>
                      <div className="text-[11px]" style={S_SUBTLE}>DM Name Color</div>
                      <div className="text-[9px]" style={S_DIM}>{"Color the DM's name, badge & crown icon · "}{dmNameColor}</div>
                    </div>
                  </div>
                  {showDmNameColorPicker && (
                    <div className="absolute top-6 left-0 z-50">
                      <ColorWheelPicker
                        currentColor={dmNameColor}
                        accent={accent}
                        onSelect={(c) => setDmNameColor(c || "#FFD700")}
                        onClose={() => setShowDmNameColorPicker(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "rgba(4,4,16,0.5)" }} onClick={() => { if (reactionPickerMsgId) setReactionPickerMsgId(null); }}>
            {channelMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare size={36} style={{ color: "#1A2A4A" }} className="mb-3" />
                <div className="text-[14px] mb-1" style={S_DIM}>
                  {activeChannel.type === "main" ? "Welcome to General Chat!" : `Start a conversation with ${activeChannel.label}`}
                </div>
                <div className="text-[11px]" style={{ color: "#2A3A5A" }}>
                  {activeChannel.type === "main" ? "Say hello to the party!" : "Messages here are private between you two."}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                {/* Load more button */}
                {hiddenCount > 0 && (
                  <div className="flex justify-center mb-2">
                    <button
                      onClick={() => setShowAllMessages(true)}
                      className="text-[10px] px-3 py-1.5 hover:bg-[#FFFFFF08] transition-colors"
                      style={{ color: accent, border: `1px solid ${accent}33`, borderRadius: 3 }}
                    >
                      ↑ Load {hiddenCount} older message{hiddenCount !== 1 ? "s" : ""}
                    </button>
                  </div>
                )}
                {groupedMessages.map(group => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px" style={{ background: `${accent}15` }} />
                      <span className="text-[9px] px-2 py-0.5 shrink-0" style={{ color: "#4A5A7A", background: "rgba(8,8,32,0.8)", border: `1px solid ${accent}15` }}>
                        {group.date}
                      </span>
                      <div className="flex-1 h-px" style={{ background: `${accent}15` }} />
                    </div>
                    {group.msgs.map((msg, mi) => {
                      const isMsgFromNpc = msg.senderId.startsWith("npc-");
                      const isMe = msg.senderId === currentUserId || (isDM && isMsgFromNpc);
                      const isMsgFromDM = msg.senderId === "dm";
                      const canModify = isMe || isDM;
                      const showHeader = mi === 0 || group.msgs[mi - 1].senderId !== msg.senderId || msg.timestamp - group.msgs[mi - 1].timestamp > groupThreshold * 60000;
                      const displayName = nicknames[msg.senderId] || msg.senderName;
                      const isEditing = editingMsgId === msg.id;
                      const msgImage = msg.imageId ? imageStore[msg.imageId] : null;
                      const imageExpired = msg.imageId && !msgImage;
                      const isSearchHit = searchQuery && searchResults.includes(msg.id);
                      const isCurrentSearchHit = searchResults[searchResultIdx] === msg.id;
                      const msgUrls = extractUrls(msg.text);
                      const msgNameColor = msg.nameColor || (isMsgFromDM ? dmNameColor : isMe ? accent : "#C0D0F0");
                      const msgChatColor = msg.chatColor || "#B0C0E0";
                      return (
                        <div key={msg.id} id={`msg-${msg.id}`} className={`group flex gap-2 ${compactMode ? "py-px" : "py-0.5"} px-2 hover:bg-[#FFFFFF04] transition-colors ${showHeader && !compactMode ? "mt-2" : showHeader ? "mt-0.5" : ""}`} style={isCurrentSearchHit ? { background: `${accent}18`, outline: `1px solid ${accent}44` } : isSearchHit ? { background: `${accent}0A` } : undefined}>
                          {/* Avatar */}
                          {showHeader && !compactMode ? (
                            profilePics[msg.senderId] ? (
                              <img src={profilePics[msg.senderId]!} alt="" className="w-8 h-8 rounded shrink-0 object-cover mt-0.5" draggable={false} />
                            ) : (
                            <div className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[12px] font-bold mt-0.5" style={{ background: `${isMsgFromNpc ? (msg.nameColor || "#8A6ABB") : isMsgFromDM ? dmNameColor : accent}22`, color: isMsgFromNpc ? (msg.nameColor || "#8A6ABB") : isMsgFromDM ? dmNameColor : accent }}>
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            )
                          ) : !compactMode ? (
                            <div className="w-8 shrink-0" />
                          ) : null}
                          <div className="flex-1 min-w-0">
                            {showHeader && (
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[12px] font-semibold" style={{ color: msgNameColor }}>
                                  {displayName}
                                </span>
                                {isMsgFromDM && <Crown size={10} style={{ color: dmNameColor }} />}
                                {isMsgFromDM && <span className="text-[9px] px-1 py-0" style={{ color: dmNameColor, background: "#1A1A0A", border: "1px solid #3A3A1A" }}>DM</span>}
                                {isMsgFromNpc && <Bot size={10} style={{ color: msg.nameColor || "#8A6ABB" }} />}
                                {isMsgFromNpc && <span className="text-[9px] px-1 py-0" style={{ color: msg.nameColor || "#8A6ABB", background: "#0A0A1A", border: `1px solid ${msg.nameColor || "#8A6ABB"}33` }}>NPC</span>}
                                {showTimestamps && <span className="text-[9px]" style={S_DIM}>{formatTime(msg.timestamp, use24h)}</span>}
                                {msg.edited && <span className="text-[8px] italic" style={S_DIM}>(edited)</span>}
                              </div>
                            )}
                            {/* Message body or edit mode */}
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 my-1">
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                                  className="flex-1 bg-[#0A0A28] px-3 py-1.5 text-[12px] outline-none"
                                  style={{ color: "#C0D0F0", border: `1px solid ${accent}44` }}
                                />
                                <button onClick={saveEdit} className="px-1.5 py-1 hover:bg-[#FFFFFF08] transition-colors" title="Save"><Check size={13} style={{ color: "#4ADE80" }} /></button>
                                <button onClick={cancelEdit} className="px-1.5 py-1 hover:bg-[#FFFFFF08] transition-colors" title="Cancel"><X size={13} style={S_RED} /></button>
                              </div>
                            ) : (
                              <div style={DISPLAY_CONTENTS}>
                                {msg.text && (
                                  <div className="leading-relaxed break-words" style={{ fontSize: fontSize }}>
                                    <RenderTextWithLinks text={msg.text} color={msgChatColor} fontSize={fontSize} />
                                    {!showHeader && msg.edited && <span className="text-[8px] italic ml-1.5" style={S_DIM}>(edited)</span>}
                                  </div>
                                )}
                                {/* Link previews */}
                                {showLinkPreviews && msgUrls.length > 0 && msgUrls.slice(0, 3).map(url => (
                                  <LinkPreviewCard key={url} url={url} accent={accent} visible={showLinkPreviews} />
                                ))}
                                {/* Image */}
                                {msgImage && (() => {
                                  const isExpanded = expandedImages.has(msg.id);
                                  const showFull = !imgThumbnails || isExpanded;
                                  return (
                                    <div className="mt-1.5 mb-1 relative inline-block max-w-[380px]">
                                      <img
                                        src={msgImage.data}
                                        alt="shared image"
                                        className="max-w-full rounded transition-all"
                                        style={{
                                          maxHeight: showFull ? 300 : 80,
                                          border: `1px solid ${accent}22`,
                                          cursor: "pointer",
                                          objectFit: showFull ? "contain" : "cover",
                                          width: showFull ? undefined : 120,
                                        }}
                                        onClick={() => {
                                          if (imgThumbnails && !isExpanded) {
                                            setExpandedImages(prev => new Set(prev).add(msg.id));
                                          } else {
                                            setLightboxSrc(msgImage.data);
                                            setLightboxZoomed(false);
                                          }
                                        }}
                                        title={imgThumbnails && !isExpanded ? "Click to expand" : "Click to view full size"}
                                      />
                                      <div className="text-[8px] mt-0.5 flex items-center gap-1" style={{ color: "#3A5A7A" }}>
                                        <Image size={8} /> {getImageTimeLeft(msgImage.timestamp)}
                                        {imgThumbnails && isExpanded && (
                                          <button
                                            className="ml-1 underline"
                                            style={{ color: "#3A5A7A" }}
                                            onClick={() => setExpandedImages(prev => { const n = new Set(prev); n.delete(msg.id); return n; })}
                                          >
                                            collapse
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {imageExpired && (
                                  <div className="mt-1 flex items-center gap-1.5 text-[11px] py-1 px-2 inline-block" style={{ color: "#5A4A3A", background: "#1A1408", border: "1px solid #2A2010" }}>
                                    <Image size={11} style={{ color: "#5A4A3A" }} />
                                    Image expired (3-day limit)
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Reactions display */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {Object.entries(msg.reactions).map(([rId, userIds]) => {
                                  const rDef = allReactions.find(r => r.id === rId);
                                  if (!rDef || userIds.length === 0) return null;
                                  const iReacted = userIds.includes(currentUserId);
                                  return (
                                    <button
                                      key={rId}
                                      onClick={() => toggleReaction(msg.id, rId)}
                                      className="flex items-center gap-1 px-1.5 py-0.5 transition-colors hover:brightness-125"
                                      style={{
                                        background: iReacted ? `${accent}22` : "rgba(255,255,255,0.04)",
                                        border: `1px solid ${iReacted ? accent + "55" : "#FFFFFF10"}`,
                                        borderRadius: 3,
                                      }}
                                      title={`${rDef.label} — ${userIds.map(uid => { const p = allPlayers.find(pp => pp.id === uid); return nicknames[uid] || p?.name || uid; }).join(", ")}`}
                                    >
                                      {renderReactionDisplay(rDef, 14)}
                                      <span className="text-[10px]" style={{ color: iReacted ? accent : "#6A7A9A" }}>{userIds.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {/* Action buttons (hover) */}
                          <div className="shrink-0 self-start flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-1 relative">
                            {!showHeader && showTimestamps && (
                              <span className="text-[8px] mr-1" style={S_DIM}>
                                {formatTime(msg.timestamp, use24h)}
                              </span>
                            )}
                            {/* Reaction button */}
                            {!isEditing && (
                              <button
                                onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                                className="p-1 hover:bg-[#FFFFFF08] transition-colors rounded"
                                title="Add reaction"
                              >
                                <SmilePlus size={11} style={{ color: "#5A7A9A" }} />
                              </button>
                            )}
                            {canModify && !isEditing && (
                              <div style={DISPLAY_CONTENTS}>
                                {isMe && (
                                  <button onClick={() => startEdit(msg)} className="p-1 hover:bg-[#FFFFFF08] transition-colors rounded" title="Edit message">
                                    <Pencil size={11} style={{ color: "#5A7A9A" }} />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => handleDeleteClick(msg.id, e.shiftKey)}
                                  className="p-1 hover:bg-[#FFFFFF08] transition-colors rounded"
                                  title={isDM && !isMe ? "Delete (DM) · Shift+Click to skip confirm" : "Delete · Shift+Click to skip confirm"}
                                >
                                  <Trash2 size={11} style={{ color: "#9A4A4A" }} />
                                </button>
                              </div>
                            )}
                            {/* Reaction picker popup */}
                            {reactionPickerMsgId === msg.id && (
                              <div
                                className="absolute right-0 top-7 z-30"
                                style={{
                                  background: "rgba(12,12,40,0.97)",
                                  border: `1px solid ${accent}33`,
                                  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
                                  borderRadius: 4,
                                  width: 280,
                                }}
                              >
                                {/* Emoji section */}
                                <div className="px-2 pt-2 pb-1">
                                  <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "#4A5A7A", fontWeight: 600 }}>Emoji</div>
                                  <div className="flex flex-wrap gap-0.5">
                                    {allReactions.filter(r => r.type === "emoji").map(r => (
                                      <button
                                        key={r.id}
                                        onClick={() => toggleReaction(msg.id, r.id)}
                                        className="w-8 h-8 flex items-center justify-center hover:bg-[#FFFFFF10] transition-colors rounded"
                                        title={r.label}
                                      >
                                        {renderReactionDisplay(r, 18)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Sticker section */}
                                <div className="px-2 pt-1 pb-2" style={{ borderTop: `1px solid ${accent}15` }}>
                                  <div className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "#4A5A7A", fontWeight: 600 }}>Stickers</div>
                                  <div className="flex flex-wrap gap-1">
                                    {allReactions.filter(r => r.type === "sticker").map(r => (
                                      <button
                                        key={r.id}
                                        onClick={() => toggleReaction(msg.id, r.id)}
                                        className="w-10 h-10 flex items-center justify-center hover:bg-[#FFFFFF10] transition-colors rounded p-1"
                                        title={r.label}
                                        style={{ border: "1px solid #FFFFFF08" }}
                                      >
                                        {renderReactionDisplay(r, 28)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Close */}
                                <button
                                  onClick={() => setReactionPickerMsgId(null)}
                                  className="w-full text-[9px] py-1.5 hover:bg-[#FFFFFF08] transition-colors text-center"
                                  style={{ color: "#4A5A7A", borderTop: `1px solid ${accent}11` }}
                                >
                                  Close
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Message input */}
          <div className="shrink-0 px-4 py-3" style={{ background: "rgba(8,8,32,0.9)", borderTop: `1px solid ${accent}22` }}>
            {/* NPC identity picker (DM only) */}
            {isDM && npcAccounts.length > 0 && (
              <div className="relative mb-2">
                <button
                  onClick={() => setShowNpcPicker(p => !p)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] transition-colors hover:bg-[#FFFFFF08] w-full"
                  style={{
                    color: activeNpc ? activeNpc.color : dmNameColor,
                    background: activeNpc ? `${activeNpc.color}12` : `${dmNameColor}12`,
                    border: `1px solid ${activeNpc ? activeNpc.color : dmNameColor}33`,
                    borderRadius: 2,
                  }}
                >
                  {activeNpc ? <Bot size={11} /> : <Crown size={11} />}
                  <span className="flex-1 text-left truncate">Sending as: <strong>{activeNpc ? activeNpc.name : "Dungeon Master"}</strong></span>
                  {showNpcPicker ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                </button>
                {showNpcPicker && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 py-1 z-30" style={{ background: "#0C0C2C", border: `1px solid ${accent}33`, boxShadow: "0 -4px 16px rgba(0,0,0,0.5)" }}>
                    <button
                      onClick={() => { setActiveNpcId(null); setShowNpcPicker(false); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-[#FFFFFF08]"
                      style={{ color: !activeNpc ? "#FFFFFF" : "#8A9ABB", background: !activeNpc ? `${dmNameColor}18` : "transparent" }}
                    >
                      <Crown size={11} style={{ color: dmNameColor }} />
                      <span>Dungeon Master</span>
                      {!activeNpc && <Check size={10} style={{ color: dmNameColor }} />}
                    </button>
                    <div className="h-px mx-2 my-0.5" style={{ background: `${accent}15` }} />
                    {npcAccounts.map(npc => (
                      <button
                        key={npc.id}
                        onClick={() => { setActiveNpcId(npc.id); setShowNpcPicker(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-[#FFFFFF08]"
                        style={{ color: activeNpcId === npc.id ? "#FFFFFF" : "#8A9ABB", background: activeNpcId === npc.id ? `${npc.color}18` : "transparent" }}
                      >
                        <Bot size={11} style={{ color: npc.color }} />
                        <span>{npc.name}</span>
                        <span className="text-[9px] px-1" style={{ color: npc.color, background: `${npc.color}15`, border: `1px solid ${npc.color}33` }}>NPC</span>
                        {activeNpcId === npc.id && <Check size={10} style={{ color: npc.color }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Pending image preview */}
            {pendingImage && (
              <div className="flex items-start gap-2 mb-2 px-1 py-1.5" style={{ background: "#0A0A20", border: `1px solid ${accent}22` }}>
                <img src={pendingImage.data} alt="preview" className="rounded" style={{ maxWidth: 80, maxHeight: 60, objectFit: "cover", border: `1px solid ${accent}22` }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px]" style={S_SUBTLE}>Image attached</div>
                  <div className="text-[9px] flex items-center gap-1 mt-0.5" style={{ color: "#5A4A3A" }}>
                    <Image size={8} /> Will expire in 3 days
                  </div>
                </div>
                <button onClick={removePendingImage} className="p-1 hover:bg-[#FFFFFF08] rounded shrink-0" title="Remove image">
                  <X size={12} style={S_RED} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* Image upload */}
              <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-2.5 hover:bg-[#FFFFFF08] transition-colors shrink-0"
                style={{ color: "#5A6A8A", border: `1px solid ${accent}15`, borderRadius: 2 }}
                title="Attach image (expires after 3 days)"
              >
                <Image size={15} />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendFull(); } }}
                placeholder={activeNpc ? `Message as ${activeNpc.name}...` : activeChannel.type === "main" ? "Message #general-chat..." : `Message ${activeChannel.label}...`}
                className="flex-1 bg-[#0A0A28] px-4 py-2.5 text-[13px] outline-none"
                style={{ color: "#C0D0F0", border: `1px solid ${accent}22`, borderRadius: 2 }}
              />
              <button
                onClick={handleSendFull}
                disabled={!draft.trim() && !pendingImage}
                className="px-3 py-2.5 transition-colors"
                style={{
                  background: (draft.trim() || pendingImage) ? accent : "#1A1A3B",
                  color: (draft.trim() || pendingImage) ? "#000" : "#3A4A6A",
                  border: `1px solid ${(draft.trim() || pendingImage) ? accent : "#2A2A4B"}`,
                  cursor: (draft.trim() || pendingImage) ? "pointer" : "default",
                  borderRadius: 2,
                }}
              >
                <Send size={14} />
              </button>
            </div>
            {/* 3-day image notice */}
            <div className="text-[9px] mt-1.5 flex items-center gap-1" style={{ color: "#2A3A5A" }}>
              <Image size={8} /> Attached images are shared through Supabase-backed community storage.
            </div>
          </div>
        </div>

        {/* ── Right: Active Players ── */}
        <div
          className="shrink-0 hidden lg:flex flex-col"
          style={{
            width: 200,
            background: "rgba(8,8,32,0.92)",
            borderLeft: `1px solid ${accent}33`,
          }}
        >
          <div className="px-3 py-3" style={{ borderBottom: `1px solid ${accent}22` }}>
            <div className="flex items-center gap-2">
              <Users size={13} style={{ color: accent }} />
              <span className="text-[12px] font-semibold" style={S_SUBTLE}>Players — {allPlayers.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {/* DM first, then other players */}
            {allPlayers
              .sort((a, b) => {
                if (a.id === "dm") return -1;
                if (b.id === "dm") return 1;
                const aIsNpc = a.id.startsWith("npc-");
                const bIsNpc = b.id.startsWith("npc-");
                if (aIsNpc && !bIsNpc) return -1;
                if (!aIsNpc && bIsNpc) return 1;
                return a.name.localeCompare(b.name);
              })
              .map(player => {
                const pIsDM = player.id === "dm";
                const pIsNpc = player.id.startsWith("npc-");
                const npcData = pIsNpc ? npcAccounts.find(n => n.id === player.id) : null;
                const isCurrentUser = player.id === currentUserId;
                const displayName = nicknames[player.id] || player.name;
                const hasNick = !!nicknames[player.id];
                const pColor = pIsNpc && npcData ? npcData.color : pIsDM ? dmNameColor : accent;
                return (
                  <button
                    key={player.id}
                    onClick={() => {
                      if (player.id !== currentUserId && !pIsNpc) {
                        const dmId = getDmChannelId(currentUserId, player.id);
                        setHiddenDmChannels(prev => prev.filter(id => id !== dmId));
                        setActiveChannelId(dmId);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-[#FFFFFF06]"
                    style={{ cursor: player.id === currentUserId || pIsNpc ? "default" : "pointer" }}
                  >
                    {/* Status dot */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: isCurrentUser ? "#4ADE80" : pIsNpc ? `${pColor}88` : "#3A4A6A" }} />
                    {/* Avatar */}
                    {profilePics[player.id] ? (
                      <img src={profilePics[player.id]!} alt="" className="w-6 h-6 rounded shrink-0 object-cover" draggable={false} />
                    ) : (
                      <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: `${pColor}22`, color: pColor }}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] truncate" style={{ color: pIsDM ? dmNameColor : pIsNpc ? pColor : isCurrentUser ? "#FFFFFF" : "#8A9ABB" }}>
                          {displayName}
                        </span>
                        {pIsDM && <Crown size={9} style={{ color: dmNameColor }} />}
                        {pIsNpc && <Bot size={9} style={{ color: pColor }} />}
                      </div>
                      {pIsNpc && (
                        <div className="text-[8px]" style={{ color: `${pColor}88` }}>NPC</div>
                      )}
                      {hasNick && !pIsNpc && (
                        <div className="text-[9px] truncate" style={S_DIM}>{player.name}</div>
                      )}
                      {isCurrentUser && (
                        <div className="text-[8px]" style={{ color: "#2A5A3A" }}>you</div>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── DM Oversight Modal ── */}
      {showOversight && isDM && (() => {
        // Discover all unique channel IDs from messages
        const allChannelIds = Array.from(new Set(messages.map(m => m.channelId)));
        const mainMsgCount = messages.filter(m => m.channelId === "main").length;

        // Build conversation entries from all DM channels
        const dmConversations: { channelId: string; p1: string; p2: string; p1Name: string; p2Name: string; msgCount: number; lastMsg: number }[] = [];
        for (const chId of allChannelIds) {
          if (chId === "main") continue;
          if (!chId.startsWith("dm-")) continue;
          const chMsgs = messages.filter(m => m.channelId === chId);
          if (chMsgs.length === 0) continue;
          // Extract participant IDs from channel ID (dm-id1-id2, but IDs can contain hyphens)
          // Better: get unique senderIds from messages in this channel
          const senders = Array.from(new Set(chMsgs.map(m => m.senderId)));
          const p1 = senders[0] || "unknown";
          const p2 = senders[1] || senders[0] || "unknown";
          const getName = (id: string) => {
            if (nicknames[id]) return nicknames[id];
            const player = allPlayers.find(p => p.id === id);
            return player?.name || id;
          };
          dmConversations.push({
            channelId: chId,
            p1, p2,
            p1Name: getName(p1),
            p2Name: getName(p2),
            msgCount: chMsgs.length,
            lastMsg: Math.max(...chMsgs.map(m => m.timestamp)),
          });
        }
        dmConversations.sort((a, b) => b.lastMsg - a.lastMsg);

        // Messages for selected oversight channel
        const oversightMsgs = oversightChannelId ? messages.filter(m => m.channelId === oversightChannelId) : [];

        return (
          <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => setShowOversight(false)}>
            <div
              className="w-full max-w-3xl mx-4 flex flex-col"
              style={{
                background: "#0A0A2A",
                border: `1px solid ${accent}33`,
                boxShadow: "0 12px 48px rgba(0,0,0,0.7)",
                maxHeight: "85vh",
                borderRadius: 4,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-5 py-3 shrink-0" style={{ borderBottom: `1px solid ${accent}22`, background: "rgba(8,8,40,0.95)" }}>
                <Eye size={16} style={{ color: dmNameColor }} />
                <span className="text-[15px] font-semibold flex-1" style={{ color: dmNameColor }}>DM Oversight — All Conversations</span>
                <Crown size={12} style={{ color: dmNameColor }} />
                <button onClick={() => setShowOversight(false)} className="p-1 hover:bg-[#FFFFFF10] rounded transition-colors" title="Close">
                  <X size={16} style={S_SUBTLE} />
                </button>
              </div>

              <div className="flex flex-1 min-h-0">
                {/* Left: Channel list */}
                <div className="w-56 shrink-0 overflow-y-auto py-2" style={{ borderRight: `1px solid ${accent}15`, background: "rgba(6,6,28,0.6)" }}>
                  {/* Main channel */}
                  <button
                    onClick={() => setOversightChannelId("main")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] transition-colors hover:bg-[#FFFFFF08]"
                    style={{
                      color: oversightChannelId === "main" ? "#FFFFFF" : "#7A8AAA",
                      background: oversightChannelId === "main" ? `${accent}18` : "transparent",
                      borderLeft: oversightChannelId === "main" ? `2px solid ${accent}` : "2px solid transparent",
                    }}
                  >
                    <Hash size={12} style={{ color: oversightChannelId === "main" ? accent : "#4A5A7A" }} />
                    <span className="flex-1 text-left truncate">General Chat</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${accent}15`, color: "#6A7A9A" }}>{mainMsgCount}</span>
                  </button>

                  {dmConversations.length > 0 && (
                    <div className="text-[9px] uppercase tracking-widest px-4 mt-3 mb-1" style={{ color: "#4A5A7A", fontWeight: 600 }}>
                      Direct Messages ({dmConversations.length})
                    </div>
                  )}

                  {dmConversations.map(conv => {
                    const isActive = oversightChannelId === conv.channelId;
                    const p1IsDM = conv.p1 === "dm";
                    const p2IsDM = conv.p2 === "dm";
                    const p1IsNpc = conv.p1.startsWith("npc-");
                    const p2IsNpc = conv.p2.startsWith("npc-");
                    return (
                      <button
                        key={conv.channelId}
                        onClick={() => setOversightChannelId(conv.channelId)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] transition-colors hover:bg-[#FFFFFF08]"
                        style={{
                          color: isActive ? "#FFFFFF" : "#7A8AAA",
                          background: isActive ? `${accent}18` : "transparent",
                          borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
                        }}
                      >
                        <Lock size={10} style={{ color: isActive ? accent : "#3A4A6A" }} />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1 truncate">
                            <span className="truncate">{conv.p1Name}</span>
                            {p1IsDM && <Crown size={8} style={{ color: dmNameColor }} />}
                            {p1IsNpc && <Bot size={8} style={{ color: npcAccounts.find(n => n.id === conv.p1)?.color || "#8A6ABB" }} />}
                            <span style={S_DIM}>↔</span>
                            <span className="truncate">{conv.p2Name}</span>
                            {p2IsDM && <Crown size={8} style={{ color: dmNameColor }} />}
                            {p2IsNpc && <Bot size={8} style={{ color: npcAccounts.find(n => n.id === conv.p2)?.color || "#8A6ABB" }} />}
                          </div>
                          <div className="text-[9px] mt-0.5" style={S_DIM}>
                            {conv.msgCount} msg{conv.msgCount !== 1 ? "s" : ""} · {new Date(conv.lastMsg).toLocaleDateString()}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {dmConversations.length === 0 && (
                    <div className="text-[10px] px-4 py-3" style={S_DIM}>No direct message conversations found</div>
                  )}
                </div>

                {/* Right: Message viewer */}
                <div className="flex-1 flex flex-col min-w-0">
                  {oversightChannelId ? (
                    <div className="flex-1 overflow-y-auto px-4 py-3" style={{ background: "rgba(8,8,30,0.4)" }}>
                      {oversightMsgs.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-[12px]" style={S_DIM}>No messages in this conversation</div>
                      ) : (
                        oversightMsgs.map(msg => {
                          const isMsgFromDM = msg.senderId === "dm";
                          const isMsgFromNpc = msg.senderId.startsWith("npc-");
                          const npcData = isMsgFromNpc ? npcAccounts.find(n => n.id === msg.senderId) : null;
                          const displayName = nicknames[msg.senderId] || msg.senderName;
                          const nameCol = msg.nameColor || (isMsgFromDM ? dmNameColor : isMsgFromNpc && npcData ? npcData.color : "#C0D0F0");
                          const chatCol = msg.chatColor || "#B0C0E0";
                          const msgImage = msg.imageId ? imageStore[msg.imageId] : null;
                          return (
                            <div key={msg.id} className="flex gap-2 py-1 hover:bg-[#FFFFFF04] transition-colors px-1">
                              <div className="w-7 h-7 rounded shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5" style={{ background: `${nameCol}22`, color: nameCol }}>
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[11px] font-semibold" style={{ color: nameCol }}>{displayName}</span>
                                  {isMsgFromDM && <Crown size={9} style={{ color: dmNameColor }} />}
                                  {isMsgFromDM && <span className="text-[8px] px-1" style={{ color: dmNameColor, background: "#1A1A0A", border: "1px solid #3A3A1A" }}>DM</span>}
                                  {isMsgFromNpc && <Bot size={9} style={{ color: nameCol }} />}
                                  {isMsgFromNpc && <span className="text-[8px] px-1" style={{ color: nameCol, background: "#0A0A1A", border: `1px solid ${nameCol}33` }}>NPC</span>}
                                  <span className="text-[9px]" style={S_DIM}>{formatTime(msg.timestamp)} · {new Date(msg.timestamp).toLocaleDateString()}</span>
                                  {msg.edited && <span className="text-[8px] italic" style={S_DIM}>(edited)</span>}
                                </div>
                                {msg.text && <div className="text-[12px] break-words" style={{ color: chatCol }}>{msg.text}</div>}
                                {msgImage && (
                                  <img
                                    src={msgImage.data}
                                    alt="shared"
                                    className="mt-1 rounded max-w-full cursor-pointer"
                                    style={{ maxHeight: 200, border: `1px solid ${accent}15`, objectFit: "contain" }}
                                    onClick={() => { setLightboxSrc(msgImage.data); setLightboxZoomed(false); }}
                                  />
                                )}
                                {msg.imageId && !msgImage && (
                                  <div className="mt-1 text-[10px] flex items-center gap-1" style={{ color: "#5A4A3A" }}>
                                    <Image size={10} /> Image expired
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4" style={S_DIM}>
                      <Eye size={32} style={{ color: `${dmNameColor}44` }} />
                      <div className="text-[13px] text-center" style={S_MUTED}>Select a conversation to view</div>
                      <div className="text-[10px] text-center max-w-xs" style={S_DIM}>
                        As the Dungeon Master, you can view all messages exchanged between players, including private DM conversations.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* ── Image Lightbox ── */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)", cursor: "default" }}
          onClick={() => { setLightboxSrc(null); setLightboxZoomed(false); }}
        >
          <img
            src={lightboxSrc}
            alt="full size preview"
            onClick={(e) => { e.stopPropagation(); setLightboxZoomed(z => !z); }}
            style={{
              maxWidth: lightboxZoomed ? "none" : "90vw",
              maxHeight: lightboxZoomed ? "none" : "90vh",
              width: lightboxZoomed ? "auto" : undefined,
              height: lightboxZoomed ? "auto" : undefined,
              transform: lightboxZoomed ? "scale(2)" : "scale(1)",
              transition: "transform 0.25s ease",
              cursor: lightboxZoomed ? "zoom-out" : "zoom-in",
              objectFit: "contain",
              borderRadius: 4,
              boxShadow: "0 0 60px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setDeleteConfirmId(null)}>
          <div
            className="p-5 max-w-sm w-full mx-4"
            style={{ background: "#0C0C2C", border: `1px solid ${accent}33`, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} style={S_RED} />
              <span className="text-[14px] font-semibold" style={S_RED}>Delete Message</span>
            </div>
            <div className="text-[12px] mb-1" style={{ color: "#B0C0E0" }}>
              Are you sure you want to delete this message? This action cannot be undone.
            </div>
            <div className="text-[10px] mb-4" style={{ color: "#4A5A7A" }}>
              Tip: Hold Shift + click delete to skip this dialog.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-1.5 text-[12px] hover:bg-[#FFFFFF08] transition-colors"
                style={{ color: "#7A8AAA", border: `1px solid ${accent}22` }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-1.5 text-[12px] transition-colors hover:brightness-110"
                style={{ background: "#6A2A2A", color: "#FFAAAA", border: "1px solid #8A3A3A" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}