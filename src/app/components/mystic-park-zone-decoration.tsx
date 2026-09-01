import React, { useId } from "react";
import type { BusinessSectorDecorationTheme } from "@/lib/business-map-model";

interface MysticParkZoneDecorationProps {
  theme?: BusinessSectorDecorationTheme;
  subdued?: boolean;
}

function BlossomTree({ x, y, scale = 1, color = "#F5A2C4" }: { x: number; y: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="9" rx="8" ry="3" fill="#07120D" opacity="0.42" />
      <path d="M -1 8 L -0.5 -7 M 0 -2 L -6 -8 M 0 -4 L 6 -10" stroke="#6C463B" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="-6" cy="-9" r="6.5" fill={color} />
      <circle cx="1" cy="-12" r="8" fill={color} />
      <circle cx="7" cy="-8" r="6" fill="#FFD0DF" />
      <circle cx="-1" cy="-8" r="6" fill="#E87EAC" opacity="0.75" />
      <circle cx="-3" cy="-15" r="2" fill="#FFE8F0" opacity="0.8" />
    </g>
  );
}

function PineTree({ x, y, scale = 1, color = "#244F3B" }: { x: number; y: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-1.4" y="1" width="2.8" height="10" fill="#4B372F" />
      <path d="M 0 -15 L -8 -2 L -4 -2 L -10 6 L 10 6 L 4 -2 L 8 -2 Z" fill={color} />
      <path d="M 0 -14 L -1 -1 L -8 5 L -4 -2 Z" fill="#79A583" opacity="0.28" />
    </g>
  );
}

function DreamHouse({ x, y, color, roof, scale = 1 }: { x: number; y: number; color: string; roof: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-8" y="-7" width="16" height="14" fill={color} stroke="#F8E9C8" strokeWidth="0.8" />
      <path d="M -10 -7 L 0 -14 L 10 -7 Z" fill={roof} stroke="#FFE6B3" strokeWidth="0.7" />
      <rect x="-5.5" y="-3.5" width="4" height="4" fill="#FFE9A3" opacity="0.85" />
      <rect x="1.5" y="-3.5" width="4" height="4" fill="#BDEBFF" opacity="0.85" />
      <rect x="-2" y="1" width="4" height="6" fill="#40345D" />
      <path d="M -8 -6 H 8" stroke="#FFFFFF" strokeWidth="2.2" strokeDasharray="4 3" opacity="0.7" />
    </g>
  );
}

function GiantMushroom({ x, y, scale, cap, glowId }: { x: number; y: number; scale: number; cap: string; glowId: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="11" rx="9" ry="3" fill={`url(#${glowId})`} opacity="0.6" />
      <path d="M -3 10 C -4 2 -2 -3 0 -9 C 3 -3 4 3 3 10 Z" fill="#D9D2C7" />
      <path d="M -3 6 C -1 3 1 2 3 4" fill="none" stroke="#756C78" strokeWidth="1" opacity="0.6" />
      <path d="M -12 -5 C -10 -16 10 -16 12 -5 C 6 0 -6 0 -12 -5 Z" fill={cap} stroke="#D7B8FF" strokeWidth="0.8" />
      <circle cx="-5" cy="-8" r="1.4" fill="#F4E8FF" opacity="0.8" />
      <circle cx="2" cy="-11" r="1.2" fill="#F4E8FF" opacity="0.7" />
      <circle cx="6" cy="-7" r="1" fill="#F4E8FF" opacity="0.7" />
      <path d="M -9 -4 Q 0 3 9 -4" fill="none" stroke="#B485F4" strokeWidth="1.5" opacity="0.85" />
    </g>
  );
}

function EnchantedGardens() {
  return (
    <g>
      {[
        { x: 15, y: 30, s: 0.76 }, { x: 35, y: 23, s: 0.62 }, { x: 58, y: 28, s: 0.82 },
        { x: 83, y: 31, s: 0.68 }, { x: 23, y: 60, s: 0.78 }, { x: 48, y: 56, s: 0.66 },
        { x: 76, y: 63, s: 0.82 }, { x: 38, y: 82, s: 0.62 }, { x: 66, y: 84, s: 0.7 },
      ].map((tree, index) => <BlossomTree key={index} x={tree.x} y={tree.y} scale={tree.s} />)}
    </g>
  );
}

function MagicMountain({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <path d="M 10 77 L 24 58 L 31 61 L 50 13 L 68 51 L 76 45 L 91 77 Z" fill={`url(#${ids.mountain})`} stroke="#BBD8EA" strokeWidth="1.2" />
      <path d="M 31 60 L 50 13 L 68 52 L 58 44 L 52 50 L 46 39 L 40 50 Z" fill="#E8F4F8" opacity="0.92" />
      <path d="M 50 13 L 52 50 L 68 52 L 60 64 L 45 72 L 31 60 Z" fill="#5B7590" opacity="0.28" />
      <ellipse cx="50" cy="70" rx="13" ry="10" fill="#02050A" stroke="#7DA9C2" strokeWidth="1.3" />
    </g>
  );
}

function DreamLand() {
  return (
    <g>
      <DreamHouse x={17} y={31} color="#8FC9E8" roof="#EA7AAE" scale={0.82} />
      <DreamHouse x={41} y={25} color="#E9A66E" roof="#8E72D2" scale={0.9} />
      <DreamHouse x={69} y={31} color="#7FC7A3" roof="#E87B91" scale={0.82} />
      <DreamHouse x={29} y={61} color="#CB9AE2" roof="#E8C668" scale={0.88} />
      <DreamHouse x={58} y={62} color="#E98A9E" roof="#65A7C8" scale={0.96} />
      <DreamHouse x={84} y={59} color="#8CCB9B" roof="#B483D8" scale={0.76} />
    </g>
  );
}

function WorldTree({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <path d="M 43 83 C 38 65 44 55 41 40 C 35 49 29 52 20 54 M 54 84 C 61 65 55 53 61 38 C 69 45 75 46 84 45 M 49 67 C 47 48 51 37 50 22" fill="none" stroke="#57422B" strokeWidth="9" strokeLinecap="round" />
      <path d="M 46 82 C 39 86 33 88 25 91 M 51 82 C 57 86 66 88 76 91" fill="none" stroke="#6A5032" strokeWidth="4" strokeLinecap="round" />
      <g fill={`url(#${ids.treeCanopy})`} stroke="#8EBB78" strokeWidth="0.8">
        <circle cx="30" cy="37" r="17" /><circle cx="49" cy="25" r="22" /><circle cx="70" cy="36" r="18" /><circle cx="49" cy="44" r="20" />
      </g>
      <g fill="#D2E49B" opacity="0.7"><circle cx="30" cy="29" r="2" /><circle cx="52" cy="15" r="2.5" /><circle cx="69" cy="31" r="2" /><circle cx="47" cy="39" r="1.8" /></g>
    </g>
  );
}

function Stormlands({ ids }: { ids: Record<string, string> }) {
  return (
    <g fill={`url(#${ids.fog})`} opacity="0.7">
      <ellipse cx="22" cy="28" rx="34" ry="12"><animate attributeName="cx" values="15;32;15" dur="14s" repeatCount="indefinite" /></ellipse>
      <ellipse cx="76" cy="43" rx="38" ry="14"><animate attributeName="cx" values="84;65;84" dur="17s" repeatCount="indefinite" /></ellipse>
      <ellipse cx="27" cy="65" rx="39" ry="13"><animate attributeName="cx" values="18;39;18" dur="16s" repeatCount="indefinite" /></ellipse>
      <ellipse cx="74" cy="82" rx="36" ry="12"><animate attributeName="cx" values="82;62;82" dur="19s" repeatCount="indefinite" /></ellipse>
    </g>
  );
}

function MushroomForest({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <GiantMushroom x={20} y={54} scale={0.82} cap="#874FC1" glowId={ids.mushroomGlow} />
      <GiantMushroom x={48} y={42} scale={1.25} cap="#AF5DC8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={78} y={58} scale={0.92} cap="#5A68B8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={33} y={76} scale={0.52} cap="#6B4EA8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={66} y={78} scale={0.48} cap="#C466AA" glowId={ids.mushroomGlow} />
    </g>
  );
}

function WhisperingWoods() {
  const trees = [
    { x: 8, y: 33, s: 0.82 }, { x: 20, y: 27, s: 1 }, { x: 33, y: 36, s: 0.76 },
    { x: 46, y: 26, s: 1.08 }, { x: 60, y: 34, s: 0.86 }, { x: 74, y: 25, s: 1.1 },
    { x: 88, y: 35, s: 0.84 }, { x: 15, y: 66, s: 0.92 }, { x: 30, y: 73, s: 0.78 },
    { x: 48, y: 65, s: 1.05 }, { x: 66, y: 72, s: 0.82 }, { x: 84, y: 65, s: 1 },
  ];
  return (
    <g>
      {trees.map((tree, index) => <PineTree key={index} x={tree.x} y={tree.y} scale={tree.s} color={index % 2 ? "#18382D" : "#214638"} />)}
    </g>
  );
}

export function MysticParkZoneDecoration({ theme, subdued = false }: MysticParkZoneDecorationProps) {
  const rawId = useId().replace(/:/g, "");
  if (!theme) return null;
  const ids = {
    mountain: `${rawId}-mountain`,
    treeCanopy: `${rawId}-tree-canopy`,
    fog: `${rawId}-fog`,
    mushroomGlow: `${rawId}-mushroom-glow`,
  };
  const scene = theme === "enchanted-gardens" ? <EnchantedGardens />
    : theme === "magic-mountain" ? <MagicMountain ids={ids} />
      : theme === "dream-land" ? <DreamLand />
        : theme === "world-tree" ? <WorldTree ids={ids} />
          : theme === "stormlands" ? <Stormlands ids={ids} />
            : theme === "mushroom-forest" ? <MushroomForest ids={ids} />
              : theme === "whispering-woods" ? <WhisperingWoods />
                : null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ opacity: subdued ? 0.42 : 0.9 }}>
      <defs>
        <linearGradient id={ids.mountain} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7793AA" /><stop offset="0.5" stopColor="#40586F" /><stop offset="1" stopColor="#1E2E3C" /></linearGradient>
        <radialGradient id={ids.treeCanopy}><stop offset="0" stopColor="#84B46C" /><stop offset="0.65" stopColor="#467843" /><stop offset="1" stopColor="#1E4A31" /></radialGradient>
        <radialGradient id={ids.fog}><stop offset="0" stopColor="#D8E3E7" stopOpacity="0.75" /><stop offset="1" stopColor="#AFC1C8" stopOpacity="0" /></radialGradient>
        <radialGradient id={ids.mushroomGlow}><stop offset="0" stopColor="#D6A6FF" stopOpacity="0.8" /><stop offset="1" stopColor="#8B4EC6" stopOpacity="0" /></radialGradient>
      </defs>
      {scene}
      <rect x="0" y="0" width="100" height="100" fill="#020509" opacity={subdued ? 0.24 : 0.06} />
    </svg>
  );
}
