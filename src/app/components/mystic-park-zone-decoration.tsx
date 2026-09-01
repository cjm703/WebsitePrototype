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

function WhimsyTree({ x, y, scale = 1, color = "#D783D7" }: { x: number; y: number; scale?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M -1 10 C -4 2 3 -2 0 -10" fill="none" stroke="#63507A" strokeWidth="3" strokeLinecap="round" />
      <circle cx="-1" cy="-12" r="7" fill={color} />
      <circle cx="4" cy="-9" r="5" fill="#F3B36A" opacity="0.9" />
      <circle cx="-6" cy="-8" r="4" fill="#78C9B4" opacity="0.9" />
    </g>
  );
}

function Shop({ x, y, color, roof, scale = 1 }: { x: number; y: number; color: string; roof: string; scale?: number }) {
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

function EnchantedGardens({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <ellipse cx="50" cy="54" rx="47" ry="42" fill={`url(#${ids.greenGround})`} opacity="0.65" />
      <path d="M 51 104 C 43 86 63 75 49 61 C 36 48 43 34 56 18" fill="none" stroke="#193B48" strokeWidth="11" opacity="0.8" />
      <path d="M 51 104 C 43 86 63 75 49 61 C 36 48 43 34 56 18" fill="none" stroke="#66C6DF" strokeWidth="6" opacity="0.86" />
      <path d="M 19 80 Q 34 66 43 70 M 62 52 Q 76 42 88 45" fill="none" stroke="#D7C99C" strokeWidth="3" strokeLinecap="round" />
      {[{ x: 17, y: 31, s: 0.78 }, { x: 31, y: 23, s: 0.62 }, { x: 76, y: 28, s: 0.78 }, { x: 87, y: 53, s: 0.62 }, { x: 23, y: 63, s: 0.68 }, { x: 76, y: 75, s: 0.72 }].map((tree, index) => <BlossomTree key={index} x={tree.x} y={tree.y} scale={tree.s} />)}
      <g transform="translate(51 78) rotate(-12)">
        <path d="M -5 0 Q 0 5 5 0 L 3 5 Q 0 8 -3 5 Z" fill="#C8794A" stroke="#FFE0A3" strokeWidth="0.7" />
        <line x1="0" y1="0" x2="0" y2="-6" stroke="#EFE1BF" strokeWidth="0.8" />
      </g>
      <path d="M 33 92 Q 50 86 68 92" fill="none" stroke="#E9B1C8" strokeWidth="2" strokeDasharray="2 2" opacity="0.8" />
      <g fill="#FFD7E8" opacity="0.9">
        {[15, 29, 39, 67, 78, 88].map((x, index) => <circle key={x} cx={x} cy={18 + (index % 3) * 10} r="1.2"><animate attributeName="cy" values={`${18 + (index % 3) * 10};${28 + (index % 3) * 10};${18 + (index % 3) * 10}`} dur={`${4 + index * 0.35}s`} repeatCount="indefinite" /></circle>)}
      </g>
    </g>
  );
}

function MagicMountain({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <ellipse cx="50" cy="73" rx="42" ry="22" fill="#071017" opacity="0.65" />
      <path d="M 10 77 L 24 58 L 31 61 L 50 13 L 68 51 L 76 45 L 91 77 Z" fill={`url(#${ids.mountain})`} stroke="#BBD8EA" strokeWidth="1.2" />
      <path d="M 31 60 L 50 13 L 68 52 L 58 44 L 52 50 L 46 39 L 40 50 Z" fill="#E8F4F8" opacity="0.92" />
      <path d="M 50 13 L 52 50 L 68 52 L 60 64 L 45 72 L 31 60 Z" fill="#5B7590" opacity="0.28" />
      <ellipse cx="50" cy="70" rx="13" ry="10" fill="#02050A" stroke="#7DA9C2" strokeWidth="1.3" />
      <ellipse cx="50" cy="70" rx="7" ry="5" fill={`url(#${ids.fairyGlow})`} opacity="0.9" />
      <path d="M 11 82 C 24 66 32 88 44 78 C 57 67 67 84 89 66" fill="none" stroke="#23313F" strokeWidth="4.4" />
      <path d="M 11 82 C 24 66 32 88 44 78 C 57 67 67 84 89 66" fill="none" stroke="#B88BE8" strokeWidth="1.6" strokeDasharray="3 2" />
      {[{ x: 19, y: 72, s: 0.42 }, { x: 79, y: 66, s: 0.48 }, { x: 28, y: 83, s: 0.36 }, { x: 73, y: 82, s: 0.4 }].map((tree, index) => <PineTree key={index} x={tree.x} y={tree.y} scale={tree.s} color="#385D58" />)}
      <circle cx="50" cy="68" r="2" fill="#FFF4B5"><animate attributeName="opacity" values="0.35;1;0.35" dur="2.8s" repeatCount="indefinite" /></circle>
    </g>
  );
}

function DreamLand() {
  return (
    <g>
      <path d="M 3 80 Q 25 60 48 76 T 97 70 V 100 H 3 Z" fill="#563D70" opacity="0.7" />
      <Shop x={18} y={66} color="#8FC9E8" roof="#EA7AAE" scale={0.75} />
      <Shop x={40} y={58} color="#E9A66E" roof="#8E72D2" scale={0.8} />
      <Shop x={64} y={64} color="#7FC7A3" roof="#E87B91" scale={0.72} />
      <Shop x={84} y={56} color="#CB9AE2" roof="#E8C668" scale={0.65} />
      <WhimsyTree x={10} y={33} scale={0.7} color="#E37DC4" />
      <WhimsyTree x={30} y={30} scale={0.55} color="#79C9B8" />
      <WhimsyTree x={72} y={29} scale={0.65} color="#F0A86D" />
      <WhimsyTree x={92} y={37} scale={0.55} color="#D68CE6" />
      <path d="M 5 86 C 20 76 32 90 47 78 S 75 73 96 84" fill="none" stroke="#332D58" strokeWidth="4" />
      <path d="M 5 86 C 20 76 32 90 47 78 S 75 73 96 84" fill="none" stroke="#E8B85F" strokeWidth="1.3" strokeDasharray="2 2" />
      <g fill="#FFE98C" fontSize="7" fontWeight="700">
        <text x="25" y="45">{"\u266a"}</text><text x="53" y="30">{"\u266b"}</text><text x="80" y="45">{"\u266a"}</text>
      </g>
    </g>
  );
}

function WorldTree({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <ellipse cx="50" cy="82" rx="43" ry="14" fill="#0B1B13" opacity="0.7" />
      <path d="M 43 83 C 38 65 44 55 41 40 C 35 49 29 52 20 54 M 54 84 C 61 65 55 53 61 38 C 69 45 75 46 84 45 M 49 67 C 47 48 51 37 50 22" fill="none" stroke="#57422B" strokeWidth="9" strokeLinecap="round" />
      <path d="M 46 82 C 39 86 33 88 25 91 M 51 82 C 57 86 66 88 76 91" fill="none" stroke="#6A5032" strokeWidth="4" strokeLinecap="round" />
      <g fill={`url(#${ids.treeCanopy})`} stroke="#8EBB78" strokeWidth="0.8">
        <circle cx="30" cy="37" r="17" /><circle cx="49" cy="25" r="22" /><circle cx="70" cy="36" r="18" /><circle cx="49" cy="44" r="20" />
      </g>
      <g fill="#D2E49B" opacity="0.7"><circle cx="30" cy="29" r="2" /><circle cx="52" cy="15" r="2.5" /><circle cx="69" cy="31" r="2" /><circle cx="47" cy="39" r="1.8" /></g>
      <path d="M 9 77 C 17 55 31 68 39 58 C 47 48 60 56 66 65 C 72 74 82 59 92 72" fill="none" stroke="#382B25" strokeWidth="4.5" />
      <path d="M 9 77 C 17 55 31 68 39 58 C 47 48 60 56 66 65 C 72 74 82 59 92 72" fill="none" stroke="#C99455" strokeWidth="1.6" strokeDasharray="4 2" />
      <path d="M 38 70 Q 50 60 61 70" fill="none" stroke="#0B1210" strokeWidth="3" opacity="0.75" />
    </g>
  );
}

function Stormlands({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <path d="M 2 84 L 13 44 L 25 57 L 37 22 L 49 54 L 62 28 L 72 58 L 87 36 L 98 83 Z" fill={`url(#${ids.cliff})`} stroke="#98A5B4" strokeWidth="1" />
      <path d="M 6 78 L 18 61 L 27 68 L 39 49 L 51 65 L 63 50 L 75 67 L 91 55" fill="none" stroke="#C1B49A" strokeWidth="3" strokeLinecap="round" />
      <path d="M 3 79 C 18 58 26 83 41 57 S 66 77 96 48" fill="none" stroke="#202A38" strokeWidth="4" />
      <path d="M 3 79 C 18 58 26 83 41 57 S 66 77 96 48" fill="none" stroke="#70A8CA" strokeWidth="1.4" strokeDasharray="4 2" />
      <path d="M 56 8 L 48 30 L 59 27 L 51 46" fill="none" stroke="#D7E8FF" strokeWidth="2" opacity="0.65"><animate attributeName="opacity" values="0.12;0.8;0.15;0.15" dur="5.5s" repeatCount="indefinite" /></path>
      <g fill={`url(#${ids.fog})`} opacity="0.55">
        <ellipse cx="23" cy="72" rx="26" ry="8"><animate attributeName="cx" values="18;34;18" dur="12s" repeatCount="indefinite" /></ellipse>
        <ellipse cx="70" cy="57" rx="31" ry="9"><animate attributeName="cx" values="77;58;77" dur="15s" repeatCount="indefinite" /></ellipse>
      </g>
    </g>
  );
}

function MushroomForest({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <ellipse cx="50" cy="76" rx="47" ry="22" fill="#171029" opacity="0.86" />
      <path d="M 3 87 C 19 72 31 86 44 70 S 72 74 97 57" fill="none" stroke="#2B1B42" strokeWidth="4" />
      <path d="M 3 87 C 19 72 31 86 44 70 S 72 74 97 57" fill="none" stroke="#BA75E8" strokeWidth="1.4" strokeDasharray="3 2" opacity="0.8" />
      <GiantMushroom x={20} y={54} scale={0.82} cap="#874FC1" glowId={ids.mushroomGlow} />
      <GiantMushroom x={48} y={42} scale={1.25} cap="#AF5DC8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={78} y={58} scale={0.92} cap="#5A68B8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={33} y={76} scale={0.52} cap="#6B4EA8" glowId={ids.mushroomGlow} />
      <GiantMushroom x={66} y={78} scale={0.48} cap="#C466AA" glowId={ids.mushroomGlow} />
      <g fill="#CFA8FF"><circle cx="11" cy="69" r="1"><animate attributeName="opacity" values="0.2;1;0.2" dur="3s" repeatCount="indefinite" /></circle><circle cx="88" cy="40" r="1.2"><animate attributeName="opacity" values="1;0.2;1" dur="4s" repeatCount="indefinite" /></circle></g>
    </g>
  );
}

function WhisperingWoods({ ids }: { ids: Record<string, string> }) {
  const trees = [{ x: 8, y: 45, s: 0.85 }, { x: 19, y: 38, s: 1.05 }, { x: 31, y: 51, s: 0.8 }, { x: 42, y: 35, s: 1.15 }, { x: 57, y: 43, s: 0.95 }, { x: 70, y: 34, s: 1.2 }, { x: 84, y: 46, s: 0.9 }, { x: 95, y: 38, s: 1.05 }];
  return (
    <g>
      <rect x="0" y="0" width="100" height="100" fill={`url(#${ids.woods})`} opacity="0.55" />
      {trees.map((tree, index) => <PineTree key={index} x={tree.x} y={tree.y} scale={tree.s} color={index % 2 ? "#18382D" : "#214638"} />)}
      <path d="M 3 86 L 24 66 L 38 80 L 52 55 L 67 75 L 82 46 L 97 69" fill="none" stroke="#3C3026" strokeWidth="5" strokeLinejoin="round" />
      <path d="M 3 86 L 24 66 L 38 80 L 52 55 L 67 75 L 82 46 L 97 69" fill="none" stroke="#B38350" strokeWidth="1.5" strokeDasharray="4 2" />
      {[{ x: 24, y: 66 }, { x: 52, y: 55 }, { x: 82, y: 46 }].map((light, index) => <circle key={index} cx={light.x} cy={light.y} r="2.2" fill="#FFD36E"><animate attributeName="opacity" values="0.35;1;0.35" dur={`${2.4 + index}s`} repeatCount="indefinite" /></circle>)}
      <g transform="translate(50 87)"><rect x="-19" y="-5" width="38" height="7" fill="#342C25" stroke="#D6A24A" strokeWidth="0.8" /><path d="M -18 -4 H 18" stroke="#F0C25A" strokeWidth="3" strokeDasharray="5 4" /><rect x="-16" y="2" width="2" height="6" fill="#6D5338" /><rect x="14" y="2" width="2" height="6" fill="#6D5338" /></g>
      <g fill={`url(#${ids.fog})`} opacity="0.48"><ellipse cx="30" cy="74" rx="31" ry="9"><animate attributeName="cx" values="25;39;25" dur="14s" repeatCount="indefinite" /></ellipse><ellipse cx="76" cy="84" rx="35" ry="10"><animate attributeName="cx" values="83;66;83" dur="18s" repeatCount="indefinite" /></ellipse></g>
    </g>
  );
}

export function MysticParkZoneDecoration({ theme, subdued = false }: MysticParkZoneDecorationProps) {
  const rawId = useId().replace(/:/g, "");
  if (!theme) return null;
  const ids = {
    greenGround: `${rawId}-green-ground`,
    mountain: `${rawId}-mountain`,
    fairyGlow: `${rawId}-fairy-glow`,
    treeCanopy: `${rawId}-tree-canopy`,
    cliff: `${rawId}-cliff`,
    fog: `${rawId}-fog`,
    mushroomGlow: `${rawId}-mushroom-glow`,
    woods: `${rawId}-woods`,
  };
  const scene = theme === "enchanted-gardens" ? <EnchantedGardens ids={ids} />
    : theme === "magic-mountain" ? <MagicMountain ids={ids} />
      : theme === "dream-land" ? <DreamLand />
        : theme === "world-tree" ? <WorldTree ids={ids} />
          : theme === "stormlands" ? <Stormlands ids={ids} />
            : theme === "mushroom-forest" ? <MushroomForest ids={ids} />
              : theme === "whispering-woods" ? <WhisperingWoods ids={ids} />
                : null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ opacity: subdued ? 0.42 : 0.9 }}>
      <defs>
        <radialGradient id={ids.greenGround}><stop offset="0" stopColor="#376A4D" /><stop offset="1" stopColor="#102A1D" /></radialGradient>
        <linearGradient id={ids.mountain} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7793AA" /><stop offset="0.5" stopColor="#40586F" /><stop offset="1" stopColor="#1E2E3C" /></linearGradient>
        <radialGradient id={ids.fairyGlow}><stop offset="0" stopColor="#FFF6B0" /><stop offset="0.35" stopColor="#CFA8FF" stopOpacity="0.8" /><stop offset="1" stopColor="#7652A7" stopOpacity="0" /></radialGradient>
        <radialGradient id={ids.treeCanopy}><stop offset="0" stopColor="#84B46C" /><stop offset="0.65" stopColor="#467843" /><stop offset="1" stopColor="#1E4A31" /></radialGradient>
        <linearGradient id={ids.cliff} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#697685" /><stop offset="1" stopColor="#242D37" /></linearGradient>
        <radialGradient id={ids.fog}><stop offset="0" stopColor="#D8E3E7" stopOpacity="0.75" /><stop offset="1" stopColor="#AFC1C8" stopOpacity="0" /></radialGradient>
        <radialGradient id={ids.mushroomGlow}><stop offset="0" stopColor="#D6A6FF" stopOpacity="0.8" /><stop offset="1" stopColor="#8B4EC6" stopOpacity="0" /></radialGradient>
        <linearGradient id={ids.woods} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07120E" /><stop offset="1" stopColor="#183529" /></linearGradient>
      </defs>
      {scene}
      <rect x="0" y="0" width="100" height="100" fill="#020509" opacity={subdued ? 0.24 : 0.06} />
    </svg>
  );
}
