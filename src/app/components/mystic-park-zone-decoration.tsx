import React, { useId } from "react";
import type { BusinessSectorDecorationTheme } from "@/lib/business-map-model";

interface MysticParkZoneDecorationProps {
  theme?: BusinessSectorDecorationTheme;
  subdued?: boolean;
}

function BlossomTree({ x, y, scale = 1, color = "#F5A2C4", variant = 0, delay = 0 }: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
  variant?: number;
  delay?: number;
}) {
  const crownWidth = variant % 2 === 0 ? 7.5 : 6.2;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g>
        <animateTransform attributeName="transform" type="rotate" values="-1.2 0 9;1.4 0 9;-1.2 0 9" dur={`${5.4 + variant * 0.45}s`} begin={`${delay}s`} repeatCount="indefinite" />
        <ellipse cx="0" cy="9" rx="7.5" ry="2.3" fill="#07120D" opacity="0.34" />
        <path d="M -1 8 Q 1 0 -0.5 -8 M 0 -2 L -7 -9 M 0 -4 L 7 -11 M -1 1 L 5 -4" stroke="#70483D" strokeWidth="2.8" strokeLinecap="round" />
        <ellipse cx="-6" cy="-10" rx={crownWidth} ry="6.2" fill={color} />
        <ellipse cx="1" cy="-14" rx={crownWidth + 1} ry="7.2" fill={color} />
        <ellipse cx="8" cy="-9" rx={crownWidth - 0.8} ry="5.8" fill={variant % 3 === 0 ? "#FFD0DF" : "#F7B2CF"} />
        <ellipse cx="-1" cy="-8" rx="6.5" ry="5.2" fill="#E87EAC" opacity="0.72" />
        <g fill="#FFE8F0" opacity="0.85">
          <circle cx="-7" cy="-13" r="1.25" /><circle cx="2" cy="-17" r="1.4" /><circle cx="8" cy="-11" r="1.1" />
        </g>
      </g>
    </g>
  );
}

function PineTree({ x, y, scale = 1, color = "#244F3B", variant = 0, delay = 0 }: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
  variant?: number;
  delay?: number;
}) {
  const cedar = variant % 3 === 2;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g>
        <animateTransform attributeName="transform" type="rotate" values="-0.8 0 10;1 0 10;-0.8 0 10" dur={`${6.5 + variant * 0.55}s`} begin={`${delay}s`} repeatCount="indefinite" />
        <rect x="-1.5" y="0" width="3" height="11" rx="0.8" fill="#4B372F" />
        {cedar ? (
          <>
            <path d="M 0 -17 C -7 -13 -4 -9 -10 -5 C -5 -4 -7 1 -12 5 C -5 6 5 6 12 5 C 7 1 5 -4 10 -5 C 4 -9 7 -13 0 -17 Z" fill={color} />
            <path d="M 0 -16 C -2 -9 -2 -2 -9 4 C -3 2 1 -5 2 -13 Z" fill="#83A98D" opacity="0.25" />
          </>
        ) : (
          <>
            <path d="M 0 -18 L -7 -7 H -4 L -10 1 H -6 L -12 7 H 12 L 6 1 H 10 L 4 -7 H 7 Z" fill={color} />
            <path d="M 0 -17 L -1 -5 L -8 5 L -5 0 L -4 -6 Z" fill="#83A98D" opacity="0.25" />
            <path d="M -7 1 Q 0 4 7 1 M -5 -7 Q 0 -4 5 -7" fill="none" stroke="#A3BDA8" strokeWidth="0.65" opacity="0.24" />
          </>
        )}
      </g>
    </g>
  );
}

function DreamHouse({ x, y, color, roof, scale = 1, variant = 0, delay = 0 }: {
  x: number;
  y: number;
  color: string;
  roof: string;
  scale?: number;
  variant?: number;
  delay?: number;
}) {
  const tall = variant % 3 === 1;
  const roundRoof = variant % 3 === 2;
  const top = tall ? -11 : -7;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {variant % 2 === 1 && <rect x="4" y={top - 8} width="3" height="8" fill="#70506D" stroke="#FFE6B3" strokeWidth="0.6" />}
      <rect x="-8" y={top} width="16" height={7 - top} rx={roundRoof ? 2.5 : 0.8} fill={color} stroke="#F8E9C8" strokeWidth="0.8" />
      {roundRoof
        ? <path d={`M -10 ${top} Q 0 ${top - 13} 10 ${top} Z`} fill={roof} stroke="#FFE6B3" strokeWidth="0.8" />
        : <path d={`M -10 ${top} L 0 ${top - 8} L 10 ${top} Z`} fill={roof} stroke="#FFE6B3" strokeWidth="0.8" />}
      <rect x="-5.5" y={top + 3.5} width="4" height="4" rx="0.7" fill="#FFE9A3">
        <animate attributeName="opacity" values="0.55;1;0.7;1;0.55" dur={`${4.2 + variant * 0.35}s`} begin={`${delay}s`} repeatCount="indefinite" />
      </rect>
      <rect x="1.5" y={top + 3.5} width="4" height="4" rx="0.7" fill="#BDEBFF" opacity="0.9" />
      <rect x="-2" y="0" width="4" height="7" rx="1" fill="#40345D" />
      <circle cx="0.8" cy="3.5" r="0.45" fill="#FFE9A3" />
      <path d={`M -8 ${top + 1} H 8`} stroke="#FFFFFF" strokeWidth="2.1" strokeDasharray={roundRoof ? "2 2" : "4 3"} opacity="0.65" />
    </g>
  );
}

function GardenEntrance() {
  return (
    <g transform="translate(50 85)">
      <rect x="-11" y="-9" width="22" height="15" rx="2" fill="#E7B5C9" stroke="#FFE7EF" strokeWidth="0.9" />
      <path d="M -14 -9 L 0 -17 L 14 -9 Z" fill="#874F78" stroke="#FFD8E8" strokeWidth="0.9" />
      <rect x="-8" y="-6" width="4" height="12" fill="#F6D5DF" />
      <rect x="4" y="-6" width="4" height="12" fill="#F6D5DF" />
      <path d="M -4 6 V -1 A 4 4 0 0 1 4 -1 V 6 Z" fill="#332836" stroke="#F9D8A5" strokeWidth="0.8" />
      <circle cx="-9" cy="-5" r="1.3" fill="#FFE39A">
        <animate attributeName="opacity" values="0.45;1;0.45" dur="3.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="9" cy="-5" r="1.3" fill="#FFE39A">
        <animate attributeName="opacity" values="1;0.45;1" dur="3.8s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function DreamPizzeria() {
  return (
    <g transform="translate(50 57)">
      <rect x="-14" y="-8" width="28" height="17" rx="1.5" fill="#D96E62" stroke="#FFE5BD" strokeWidth="0.9" />
      <path d="M -16 -8 L -11 -15 H 11 L 16 -8 Z" fill="#4E7D63" stroke="#FFE5BD" strokeWidth="0.9" />
      <path d="M -14 -7 H 14 V -2 H -14 Z" fill="#F6E0B8" />
      <path d="M -14 -7 H 14" stroke="#B84845" strokeWidth="4" strokeDasharray="5 5" />
      <rect x="-10" y="1" width="7" height="6" rx="1" fill="#BDEBFF" opacity="0.9" />
      <rect x="4" y="-1" width="6" height="10" rx="1" fill="#49394C" />
      <circle cx="0" cy="-14" r="5" fill="#F5D17A" stroke="#FFF0C9" strokeWidth="0.8">
        <animate attributeName="opacity" values="0.72;1;0.72" dur="4s" repeatCount="indefinite" />
      </circle>
      <path d="M -2.5 -16.5 L 3 -13 L -3 -11 Z" fill="#C84E4E" />
      <circle cx="0" cy="-14" r="0.7" fill="#6A9C55" />
    </g>
  );
}

function GiantMushroom({ x, y, scale, cap, glowId, stemId, variant = 0, delay = 0 }: {
  x: number;
  y: number;
  scale: number;
  cap: string;
  glowId: string;
  stemId: string;
  variant?: number;
  delay?: number;
}) {
  const capPath = variant % 3 === 1
    ? "M -14 -5 C -13 -14 -7 -18 0 -18 C 7 -18 13 -14 14 -5 C 8 0 -8 0 -14 -5 Z"
    : variant % 3 === 2
      ? "M -11 -5 C -10 -15 -5 -18 0 -18 C 5 -18 10 -15 11 -5 C 6 1 -6 1 -11 -5 Z"
      : "M -12 -5 C -11 -15 -6 -17 0 -17 C 6 -17 11 -15 12 -5 C 6 0 -6 0 -12 -5 Z";
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="11" rx="11" ry="4" fill={`url(#${glowId})`} opacity="0.65">
        <animate attributeName="opacity" values="0.35;0.78;0.35" dur={`${3.8 + variant * 0.7}s`} begin={`${delay}s`} repeatCount="indefinite" />
      </ellipse>
      <g>
        <animateTransform attributeName="transform" type="rotate" values="-1.5 0 10;1.5 0 10;-1.5 0 10" dur={`${5 + variant * 0.6}s`} begin={`${delay}s`} repeatCount="indefinite" />
        <path d="M -3.5 10 C -5 2 -2.5 -3 0 -10 C 3 -3 5 3 3.5 10 Z" fill={`url(#${stemId})`} stroke="#756C78" strokeWidth="0.7" />
        <path d="M -2.5 7 Q 0 4 3 6 M -2 -1 Q 0 -3 2.5 -1" fill="none" stroke="#817589" strokeWidth="0.8" opacity="0.55" />
        <path d={capPath} fill={cap} stroke="#D7B8FF" strokeWidth="0.9" />
        <path d="M -9 -4 Q 0 3 9 -4" fill="none" stroke="#E1C6FF" strokeWidth="1.2" opacity="0.65" />
        <g fill="#F4E8FF" opacity="0.82">
          <circle cx="-5" cy="-8" r="1.4" /><circle cx="2" cy="-11" r="1.2" /><circle cx="6" cy="-7" r="1" />
        </g>
      </g>
    </g>
  );
}

function EnchantedGardens() {
  const trees = [
    { x: 14, y: 31, s: 0.72, c: "#F39ABB", v: 0 }, { x: 34, y: 24, s: 0.6, c: "#FFD0DF", v: 1 },
    { x: 57, y: 29, s: 0.8, c: "#E986B2", v: 2 }, { x: 82, y: 32, s: 0.66, c: "#F7B2CF", v: 1 },
    { x: 22, y: 61, s: 0.76, c: "#F5A2C4", v: 2 }, { x: 48, y: 56, s: 0.64, c: "#FFD0DF", v: 0 },
    { x: 77, y: 64, s: 0.8, c: "#EB8AB5", v: 1 }, { x: 25, y: 84, s: 0.58, c: "#F7B2CF", v: 2 },
    { x: 76, y: 85, s: 0.62, c: "#F39ABB", v: 0 },
  ];
  return (
    <g>
      {trees.map((tree, index) => (
        <BlossomTree key={index} x={tree.x} y={tree.y} scale={tree.s} color={tree.c} variant={tree.v} delay={index * -0.55} />
      ))}
      <g fill="#FFD8E8" opacity="0.82">
        {[{ x: 9, y: 21 }, { x: 28, y: 44 }, { x: 53, y: 18 }, { x: 71, y: 48 }, { x: 91, y: 26 }, { x: 58, y: 73 }].map((petal, index) => (
          <ellipse key={index} cx={petal.x} cy={petal.y} rx="1.2" ry="0.7" transform={`rotate(${index * 22} ${petal.x} ${petal.y})`}>
            <animate attributeName="cy" values={`${petal.y};${petal.y + 14};${petal.y}`} dur={`${5 + index * 0.65}s`} begin={`${index * -0.8}s`} repeatCount="indefinite" />
            <animate attributeName="cx" values={`${petal.x};${petal.x + (index % 2 ? -4 : 4)};${petal.x}`} dur={`${6 + index * 0.5}s`} begin={`${index * -0.7}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      </g>
      <GardenEntrance />
    </g>
  );
}

function MagicMountain({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <path d="M 7 82 L 22 62 L 31 66 L 50 10 L 67 53 L 76 43 L 94 82 Z" fill={`url(#${ids.mountain})`} stroke="#BBD8EA" strokeWidth="1.2" />
      <path d="M 31 65 L 50 10 L 67 53 L 59 46 L 53 52 L 47 37 L 40 51 Z" fill="#EDF7FA" opacity="0.94">
        <animate attributeName="opacity" values="0.82;1;0.82" dur="6s" repeatCount="indefinite" />
      </path>
      <path d="M 50 10 L 53 52 L 67 53 L 61 66 L 51 78 L 43 69 L 31 65 Z" fill="#66829B" opacity="0.3" />
      <path d="M 22 62 L 31 66 L 39 53 M 76 43 L 69 61 L 61 68 M 37 75 L 43 62 M 70 72 L 78 57" fill="none" stroke="#B0C7D5" strokeWidth="1.2" opacity="0.48" />
      <path d="M 37 42 L 43 30 L 48 37" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.2">
        <animate attributeName="opacity" values="0.08;0.72;0.08" dur="4.8s" repeatCount="indefinite" />
      </path>
      <path d="M 18 80 Q 50 75 84 80" fill="none" stroke="#8DA6B6" strokeWidth="1.2" opacity="0.38">
        <animate attributeName="stroke-dashoffset" values="0;18" dur="9s" repeatCount="indefinite" />
      </path>
    </g>
  );
}

function DreamLand() {
  return (
    <g>
      <DreamHouse x={15} y={30} color="#8FC9E8" roof="#EA7AAE" scale={0.74} variant={0} />
      <DreamHouse x={42} y={27} color="#E9A66E" roof="#8E72D2" scale={0.8} variant={1} delay={-1.2} />
      <DreamHouse x={75} y={31} color="#7FC7A3" roof="#E87B91" scale={0.74} variant={2} delay={-2.4} />
      <DreamHouse x={19} y={75} color="#CB9AE2" roof="#E8C668" scale={0.78} variant={2} delay={-3.2} />
      <DreamHouse x={80} y={75} color="#8CCB9B" roof="#B483D8" scale={0.72} variant={1} delay={-4} />
      <DreamPizzeria />
    </g>
  );
}

function WorldTree({ ids }: { ids: Record<string, string> }) {
  return (
    <g transform="translate(50 52) scale(0.76) translate(-50 -52)">
      <path d="M 39 87 C 43 72 41 60 45 48 C 40 53 34 57 27 60 L 24 54 C 35 48 38 40 42 32 L 49 38 L 52 20 L 58 37 L 65 29 C 66 40 69 48 80 52 L 77 59 C 68 56 62 52 58 48 C 62 62 57 74 62 87 Z" fill={`url(#${ids.bark})`} stroke="#8B6740" strokeWidth="1.2" />
      <path d="M 43 85 C 36 87 29 91 19 93 M 48 86 C 42 92 36 94 29 96 M 57 85 C 65 88 73 92 83 94 M 54 87 C 59 93 65 95 71 97" fill="none" stroke="#785737" strokeWidth="4" strokeLinecap="round" />
      <path d="M 47 81 C 50 64 46 54 52 40 M 51 76 C 55 62 53 52 57 44" fill="none" stroke="#B48B55" strokeWidth="1.3" opacity="0.6" />
      <g fill={`url(#${ids.treeCanopy})`} stroke="#9BC786" strokeWidth="0.8">
        <animateTransform attributeName="transform" type="rotate" values="-1 50 52;1.2 50 52;-1 50 52" dur="8s" repeatCount="indefinite" />
        <circle cx="27" cy="35" r="16" /><circle cx="40" cy="22" r="18" /><circle cx="55" cy="18" r="20" />
        <circle cx="72" cy="33" r="18" /><circle cx="58" cy="39" r="20" /><circle cx="39" cy="42" r="19" />
      </g>
      <g fill={`url(#${ids.treeCanopyDeep})`} opacity="0.76">
        <circle cx="32" cy="39" r="10" /><circle cx="54" cy="29" r="12" /><circle cx="68" cy="38" r="9" />
      </g>
      <g fill="#D8EAA4" opacity="0.82">
        {[{ x: 28, y: 26 }, { x: 45, y: 13 }, { x: 60, y: 12 }, { x: 73, y: 29 }, { x: 48, y: 38 }].map((leaf, index) => (
          <ellipse key={index} cx={leaf.x} cy={leaf.y} rx="2" ry="1.1" transform={`rotate(${index * 31} ${leaf.x} ${leaf.y})`}>
            <animate attributeName="opacity" values="0.35;1;0.35" dur={`${3.5 + index * 0.6}s`} begin={`${index * -0.7}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      </g>
      <g fill="#A8CF79" opacity="0.78">
        {[{ x: 25, y: 48 }, { x: 74, y: 48 }, { x: 33, y: 58 }].map((leaf, index) => (
          <ellipse key={index} cx={leaf.x} cy={leaf.y} rx="1.8" ry="1">
            <animate attributeName="cy" values={`${leaf.y};${leaf.y + 13};${leaf.y}`} dur={`${5.5 + index}s`} begin={`${index * -1.4}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur={`${5.5 + index}s`} begin={`${index * -1.4}s`} repeatCount="indefinite" />
          </ellipse>
        ))}
      </g>
    </g>
  );
}

function Stormlands({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <g fill={`url(#${ids.cliff})`} stroke="#82929C" strokeWidth="0.8" opacity="0.8">
        <path d="M 0 96 L 0 75 L 8 69 L 12 53 L 17 68 L 24 61 L 30 78 L 35 84 L 35 96 Z" />
        <path d="M 67 96 L 67 84 L 73 75 L 78 80 L 84 58 L 89 72 L 94 65 L 100 78 L 100 96 Z" />
        <path d="M 39 96 L 42 83 L 48 76 L 52 84 L 57 72 L 62 86 L 65 96 Z" opacity="0.65" />
      </g>
      <g filter={`url(#${ids.fogBlur})`}>
        <g fill={`url(#${ids.fog})`} opacity="0.42">
          <ellipse cx="20" cy="20" rx="44" ry="13"><animate attributeName="cx" values="5;37;5" dur="18s" repeatCount="indefinite" /></ellipse>
          <ellipse cx="78" cy="36" rx="46" ry="16"><animate attributeName="cx" values="94;61;94" dur="22s" repeatCount="indefinite" /></ellipse>
        </g>
        <g fill="#DCE8EA" opacity="0.36">
          <path d="M -22 55 C -6 41 8 45 18 53 C 30 62 39 45 52 48 C 63 50 69 61 83 53 C 95 46 109 49 122 60 V 73 H -22 Z">
            <animateTransform attributeName="transform" type="translate" values="-10 0;9 0;-10 0" dur="20s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0.58;0.28" dur="8s" repeatCount="indefinite" />
          </path>
          <path d="M -20 79 C -5 66 10 68 22 76 C 36 85 46 68 61 71 C 73 74 81 85 96 76 C 107 70 116 72 123 79 V 96 H -20 Z">
            <animateTransform attributeName="transform" type="translate" values="8 0;-8 0;8 0" dur="24s" repeatCount="indefinite" />
          </path>
        </g>
        <g fill="#F0F5F4" opacity="0.24">
          <ellipse cx="30" cy="48" rx="24" ry="7"><animate attributeName="cx" values="17;45;17" dur="16s" repeatCount="indefinite" /></ellipse>
          <ellipse cx="72" cy="69" rx="29" ry="8"><animate attributeName="cx" values="84;58;84" dur="19s" repeatCount="indefinite" /></ellipse>
        </g>
      </g>
    </g>
  );
}

function MushroomForest({ ids }: { ids: Record<string, string> }) {
  return (
    <g>
      <GiantMushroom x={17} y={58} scale={0.76} cap="#7848B5" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={0} />
      <GiantMushroom x={46} y={45} scale={1.22} cap="#B05FCB" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={2} delay={-1.5} />
      <GiantMushroom x={78} y={57} scale={0.92} cap="#596FC6" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={1} delay={-3} />
      <GiantMushroom x={31} y={79} scale={0.54} cap="#6B4EA8" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={1} delay={-2.2} />
      <GiantMushroom x={63} y={81} scale={0.5} cap="#C35EAA" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={0} delay={-4} />
      <GiantMushroom x={88} y={82} scale={0.38} cap="#9B55C0" glowId={ids.mushroomGlow} stemId={ids.mushroomStem} variant={2} delay={-0.8} />
      <g fill="#DFC3FF" opacity="0.75">
        {[{ x: 11, y: 39 }, { x: 33, y: 29 }, { x: 65, y: 34 }, { x: 88, y: 44 }].map((spore, index) => (
          <circle key={index} cx={spore.x} cy={spore.y} r={0.8 + index * 0.12}>
            <animate attributeName="cy" values={`${spore.y + 8};${spore.y - 8};${spore.y + 8}`} dur={`${4.5 + index * 0.8}s`} begin={`${index * -1.1}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.9;0" dur={`${4.5 + index * 0.8}s`} begin={`${index * -1.1}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    </g>
  );
}

function WhisperingWoods() {
  const trees = [
    { x: 7, y: 33, s: 0.78, c: "#214638", v: 0 }, { x: 19, y: 27, s: 1, c: "#173A2E", v: 2 },
    { x: 32, y: 38, s: 0.7, c: "#315944", v: 1 }, { x: 45, y: 26, s: 1.08, c: "#18382D", v: 0 },
    { x: 59, y: 35, s: 0.82, c: "#294F3D", v: 2 }, { x: 73, y: 26, s: 1.06, c: "#16362B", v: 1 },
    { x: 88, y: 36, s: 0.8, c: "#2B523F", v: 2 }, { x: 14, y: 67, s: 0.88, c: "#18382D", v: 1 },
    { x: 29, y: 74, s: 0.72, c: "#315944", v: 2 }, { x: 47, y: 66, s: 1.02, c: "#173A2E", v: 0 },
    { x: 66, y: 73, s: 0.78, c: "#294F3D", v: 1 }, { x: 84, y: 66, s: 0.96, c: "#16362B", v: 2 },
  ];
  return (
    <g>
      {trees.map((tree, index) => (
        <PineTree key={index} x={tree.x} y={tree.y} scale={tree.s} color={tree.c} variant={tree.v} delay={index * -0.6} />
      ))}
    </g>
  );
}

export function MysticParkZoneDecoration({ theme, subdued = false }: MysticParkZoneDecorationProps) {
  const rawId = useId().replace(/:/g, "");
  if (!theme) return null;
  const ids = {
    mountain: `${rawId}-mountain`,
    bark: `${rawId}-bark`,
    treeCanopy: `${rawId}-tree-canopy`,
    treeCanopyDeep: `${rawId}-tree-canopy-deep`,
    cliff: `${rawId}-cliff`,
    fog: `${rawId}-fog`,
    fogBlur: `${rawId}-fog-blur`,
    mushroomGlow: `${rawId}-mushroom-glow`,
    mushroomStem: `${rawId}-mushroom-stem`,
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
        <linearGradient id={ids.bark} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4D3825" /><stop offset="0.48" stopColor="#8B6740" /><stop offset="1" stopColor="#38291D" /></linearGradient>
        <radialGradient id={ids.treeCanopy}><stop offset="0" stopColor="#84B46C" /><stop offset="0.65" stopColor="#467843" /><stop offset="1" stopColor="#1E4A31" /></radialGradient>
        <radialGradient id={ids.treeCanopyDeep}><stop offset="0" stopColor="#5F914F" /><stop offset="1" stopColor="#173D29" /></radialGradient>
        <linearGradient id={ids.cliff} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#53636D" /><stop offset="1" stopColor="#202A31" /></linearGradient>
        <radialGradient id={ids.fog}><stop offset="0" stopColor="#D8E3E7" stopOpacity="0.75" /><stop offset="1" stopColor="#AFC1C8" stopOpacity="0" /></radialGradient>
        <filter id={ids.fogBlur} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <radialGradient id={ids.mushroomGlow}><stop offset="0" stopColor="#D6A6FF" stopOpacity="0.8" /><stop offset="1" stopColor="#8B4EC6" stopOpacity="0" /></radialGradient>
        <linearGradient id={ids.mushroomStem} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8D8492" /><stop offset="0.5" stopColor="#EEE8DF" /><stop offset="1" stopColor="#A69BA8" /></linearGradient>
      </defs>
      {scene}
      <rect x="0" y="0" width="100" height="100" fill="#020509" opacity={subdued ? 0.24 : 0.06} />
    </svg>
  );
}
