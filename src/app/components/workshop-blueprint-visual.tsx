import React, { useId, useMemo, useState } from "react";
import {
  Check,
  CircleDollarSign,
  Cpu,
  LockKeyhole,
  Package,
  Search,
  ShoppingCart,
  Warehouse,
  X,
} from "lucide-react";
import type { PlayerTheme } from "./player-theme";
import {
  calculateWorkshopQuote,
  isWorkshopComponentCompatible,
  type WorkshopBlueprint,
  type WorkshopBuild,
  type WorkshopComponent,
  type WorkshopSlotDefinition,
  type WorkshopStorage,
} from "@/lib/workshop-model";

type PartFilter = "all" | "owned" | "orderable";
type BlueprintKind = "robot" | "firearm" | "generic";

interface SlotPosition {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

interface WorkshopBlueprintVisualProps {
  blueprint: WorkshopBlueprint;
  build: WorkshopBuild;
  components: WorkshopComponent[];
  storage: WorkshopStorage;
  quote: ReturnType<typeof calculateWorkshopQuote>;
  canEdit: boolean;
  selectedSlotId: string;
  onSelectSlot: (slotId: string) => void;
  onAssign: (slotId: string, componentId: string) => void;
  theme: PlayerTheme;
}

const ROBOT_POSITIONS: Record<string, SlotPosition> = {
  "robot-head": { x: 60, y: 9, targetX: 60, targetY: 15 },
  "robot-ai": { x: 47, y: 16, targetX: 56, targetY: 19 },
  "robot-core": { x: 73, y: 25, targetX: 62, targetY: 31 },
  "robot-chest": { x: 47, y: 30, targetX: 56, targetY: 31 },
  "robot-left-arm": { x: 34, y: 41, targetX: 48, targetY: 38 },
  "robot-right-arm": { x: 86, y: 41, targetX: 72, targetY: 38 },
  "robot-left-leg": { x: 43, y: 67, targetX: 54, targetY: 56 },
  "robot-right-leg": { x: 77, y: 67, targetX: 66, targetY: 56 },
  "robot-back": { x: 84, y: 18, targetX: 67, targetY: 28 },
  "robot-shoulder-left": { x: 39, y: 25, targetX: 50, targetY: 28 },
  "robot-shoulder-right": { x: 81, y: 31, targetX: 70, targetY: 29 },
  "robot-aux-chest": { x: 60, y: 42, targetX: 60, targetY: 37 },
  "robot-hip-left": { x: 43, y: 54, targetX: 54, targetY: 48 },
  "robot-hip-right": { x: 77, y: 54, targetX: 66, targetY: 48 },
  "robot-plating": { x: 60, y: 63, targetX: 60, targetY: 52 },
};

const FIREARM_POSITIONS: Record<string, SlotPosition> = {
  "gun-frame": { x: 52, y: 34, targetX: 55, targetY: 41 },
  "gun-ammo": { x: 52, y: 64, targetX: 54, targetY: 52 },
  "gun-barrel": { x: 74, y: 27, targetX: 73, targetY: 39 },
  "gun-stock": { x: 24, y: 55, targetX: 36, targetY: 43 },
  "gun-sight": { x: 56, y: 21, targetX: 58, targetY: 34 },
  "gun-muzzle": { x: 94, y: 38, targetX: 87, targetY: 40 },
  "gun-underbarrel": { x: 73, y: 58, targetX: 69, targetY: 45 },
  "gun-side": { x: 35, y: 28, targetX: 46, targetY: 40 },
};

const GROUP_COLORS = ["#72D7FF", "#A998FF", "#F1D47A", "#76D6A4", "#FF9A8C", "#E6A7FF"];

function blueprintKind(blueprint: WorkshopBlueprint): BlueprintKind {
  const identity = `${blueprint.id} ${blueprint.name} ${blueprint.category} ${blueprint.outputType}`.toLowerCase();
  if (identity.includes("robot") || identity.includes("construct") || identity.includes("android")) return "robot";
  if (identity.includes("firearm") || identity.includes("gun") || identity.includes("weapon")) return "firearm";
  return "generic";
}

function groupColor(group: string) {
  let hash = 0;
  for (let index = 0; index < group.length; index += 1) hash = ((hash << 5) - hash + group.charCodeAt(index)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

function genericPosition(index: number, total: number): SlotPosition {
  const count = Math.max(total, 1);
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: 60 + Math.cos(angle) * 43,
    y: 38 + Math.sin(angle) * 29,
    targetX: 60 + Math.cos(angle) * 23,
    targetY: 38 + Math.sin(angle) * 15,
  };
}

function slotPosition(kind: BlueprintKind, slot: WorkshopSlotDefinition, index: number, total: number) {
  if (kind === "robot" && ROBOT_POSITIONS[slot.id]) return ROBOT_POSITIONS[slot.id];
  if (kind === "firearm" && FIREARM_POSITIONS[slot.id]) return FIREARM_POSITIONS[slot.id];
  return genericPosition(index, total);
}

function componentInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function RobotSchematic({ prefix, powered }: { prefix: string; powered: boolean }) {
  return <g>
    <ellipse cx="60" cy="70" rx="25" ry="2.5" fill="#070B18" stroke="#456178" strokeWidth="0.35" opacity="0.85" />
    <path d="M49 28 L52 23 L68 23 L71 28 L68 48 L64 53 L56 53 L52 48 Z" fill={`url(#${prefix}-metal)`} stroke={`url(#${prefix}-edge)`} strokeWidth="0.75" />
    <path d="M54 14 L57 11 H63 L66 14 V22 L63 25 H57 L54 22 Z" fill={`url(#${prefix}-metal)`} stroke="#72D7FF" strokeWidth="0.7" />
    <path d="M56 18 H64" stroke="#A9EEFF" strokeWidth="0.85" opacity="0.8" />
    <circle cx="58" cy="18" r="0.75" fill="#D6FAFF" />
    <circle cx="62" cy="18" r="0.75" fill="#D6FAFF" />
    <path d="M51 28 L46 30 L41 47 L46 49 L52 36" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.65" />
    <path d="M69 28 L74 30 L79 47 L74 49 L68 36" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.65" />
    <path d="M55 52 L51 66 L57 68 L60 53" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.65" />
    <path d="M65 52 L69 66 L63 68 L60 53" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.65" />
    <path d="M52 29 H68 M53 45 H67 M60 24 V53" fill="none" stroke="#7E9DB4" strokeWidth="0.35" opacity="0.65" />
    <circle cx="60" cy="34" r="5.4" fill="#080E20" stroke="#72D7FF" strokeWidth="0.7" />
    <circle cx="60" cy="34" r="3.1" fill={powered ? `url(#${prefix}-core)` : "#18253A"} stroke="#B7F3FF" strokeWidth="0.35">
      {powered && <animate attributeName="opacity" values="0.68;1;0.68" dur="2.8s" repeatCount="indefinite" />}
    </circle>
    <path d="M56 40 H64 M57 43 H63" stroke="#A998FF" strokeWidth="0.45" opacity="0.75" />
    <path d="M43 50 L47 49 M77 50 L73 49 M51 68 H57 M63 68 H69" stroke="#A9EEFF" strokeWidth="0.8" />
    <g opacity="0.22">
      <path d="M33 21 H45 M75 21 H87 M27 58 H39 M81 58 H93" stroke="#72D7FF" strokeWidth="0.3" />
      <circle cx="60" cy="38" r="31" fill="none" stroke="#72D7FF" strokeWidth="0.28" strokeDasharray="1 2.2">
        <animateTransform attributeName="transform" type="rotate" from="0 60 38" to="360 60 38" dur="48s" repeatCount="indefinite" />
      </circle>
    </g>
  </g>;
}

function FirearmSchematic({ prefix, powered }: { prefix: string; powered: boolean }) {
  return <g>
    <ellipse cx="59" cy="65" rx="42" ry="2.5" fill="#070B18" stroke="#456178" strokeWidth="0.35" opacity="0.85" />
    <path d="M21 46 L35 38 L47 39 L46 48 L34 53 L19 53 Z" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.75" />
    <path d="M42 36 H66 L72 41 L65 49 H43 L39 45 Z" fill={`url(#${prefix}-metal)`} stroke={`url(#${prefix}-edge)`} strokeWidth="0.8" />
    <path d="M64 37 H91 V43 H65 Z" fill={`url(#${prefix}-barrel)`} stroke="#7596AE" strokeWidth="0.65" />
    <path d="M91 36 H98 V44 H91 Z" fill="#16263A" stroke="#72D7FF" strokeWidth="0.65" />
    <path d="M48 48 L57 48 L59 61 L52 63 L47 54 Z" fill={`url(#${prefix}-limb)`} stroke="#63819A" strokeWidth="0.7" />
    <path d="M59 49 L67 49 L64 59 L56 59 Z" fill="#111D2E" stroke="#A998FF" strokeWidth="0.6" />
    <path d="M49 36 L52 31 H61 L64 36" fill="#121F31" stroke="#F1D47A" strokeWidth="0.6" />
    <path d="M68 44 H79" stroke="#76D6A4" strokeWidth="0.7" strokeDasharray="1.1 0.8" />
    <circle cx="52" cy="45" r="3.6" fill="none" stroke="#829EB3" strokeWidth="0.55" />
    <path d="M44 42 H66 M48 39 H62" stroke="#91AEC2" strokeWidth="0.35" opacity="0.7" />
    {powered && <path d="M98 40 H108" stroke={`url(#${prefix}-beam)`} strokeWidth="1.1" opacity="0.8">
      <animate attributeName="opacity" values="0.25;0.8;0.25" dur="3.4s" repeatCount="indefinite" />
    </path>}
    <path d="M17 27 H32 M88 26 H103 M14 61 H31 M86 61 H104" stroke="#72D7FF" strokeWidth="0.3" opacity="0.22" />
  </g>;
}

function GenericSchematic({ prefix, powered, slotCount }: { prefix: string; powered: boolean; slotCount: number }) {
  const modules = Array.from({ length: Math.min(18, Math.max(6, slotCount)) }, (_, index) => {
    const angle = -Math.PI / 2 + (index / Math.min(18, Math.max(6, slotCount))) * Math.PI * 2;
    return { x: 60 + Math.cos(angle) * 18, y: 38 + Math.sin(angle) * 12 };
  });
  return <g>
    <ellipse cx="60" cy="68" rx="31" ry="2.5" fill="#070B18" stroke="#456178" strokeWidth="0.35" opacity="0.85" />
    <path d="M60 16 L81 27 L81 49 L60 60 L39 49 L39 27 Z" fill={`url(#${prefix}-metal)`} stroke={`url(#${prefix}-edge)`} strokeWidth="0.9" />
    <path d="M60 22 L75 30 L75 46 L60 54 L45 46 L45 30 Z" fill="#0A1224" stroke="#587A94" strokeWidth="0.5" />
    {modules.map((module, index) => <g key={index}>
      <line x1="60" y1="38" x2={module.x} y2={module.y} stroke="#47677F" strokeWidth="0.35" />
      <rect x={module.x - 1.7} y={module.y - 1.7} width="3.4" height="3.4" fill="#12253A" stroke="#72D7FF" strokeWidth="0.35" transform={`rotate(45 ${module.x} ${module.y})`} />
    </g>)}
    <circle cx="60" cy="38" r="7" fill={powered ? `url(#${prefix}-core)` : "#17263B"} stroke="#A9EEFF" strokeWidth="0.7">
      {powered && <animate attributeName="r" values="6.3;7.2;6.3" dur="3.2s" repeatCount="indefinite" />}
    </circle>
    <circle cx="60" cy="38" r="27" fill="none" stroke="#A998FF" strokeWidth="0.32" strokeDasharray="1.2 2" opacity="0.35">
      <animateTransform attributeName="transform" type="rotate" from="360 60 38" to="0 60 38" dur="44s" repeatCount="indefinite" />
    </circle>
  </g>;
}

export function WorkshopBlueprintVisual({ blueprint, build, components, storage, quote, canEdit, selectedSlotId, onSelectSlot, onAssign, theme }: WorkshopBlueprintVisualProps) {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [partQuery, setPartQuery] = useState("");
  const [partFilter, setPartFilter] = useState<PartFilter>("all");
  const kind = blueprintKind(blueprint);
  const selectedSlot = blueprint.slots.find((slot) => slot.id === selectedSlotId) || blueprint.slots[0] || null;
  const assignments = useMemo(() => new Map(build.assignments.map((entry) => [entry.slotId, entry.componentId])), [build.assignments]);
  const componentsById = useMemo(() => new Map(components.map((component) => [component.id, component])), [components]);
  const selectedComponentId = selectedSlot ? assignments.get(selectedSlot.id) || "" : "";
  const selectedComponent = selectedComponentId ? componentsById.get(selectedComponentId) || null : null;
  const compatibleComponents = useMemo(() => {
    if (!selectedSlot) return [];
    const query = partQuery.trim().toLowerCase();
    return components.filter((component) => {
      if (!isWorkshopComponentCompatible(selectedSlot, component)) return false;
      const owned = storage.quantities[component.id] || 0;
      if (partFilter === "owned" && owned <= 0) return false;
      if (partFilter === "orderable" && !component.orderable) return false;
      return !query || `${component.name} ${component.category} ${component.description} ${component.tags.join(" ")}`.toLowerCase().includes(query);
    });
  }, [components, partFilter, partQuery, selectedSlot, storage.quantities]);
  const selectedManifest = selectedSlot ? quote.manifest.find((entry) => entry.slotId === selectedSlot.id) : null;
  const installedCount = blueprint.slots.filter((slot) => assignments.has(slot.id)).length;

  return <div className="mt-3 space-y-2.5">
    <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_245px]">
      <div className="relative h-[260px] overflow-hidden border sm:h-[430px]" style={{ background: "#050914", borderColor: theme.panelBorder }}>
        <div className="pointer-events-none absolute left-3 top-2 z-10">
          <div className="text-[8px] uppercase tracking-[0.18em]" style={{ color: theme.labelColor }}>Assembly projection</div>
          <div className="mt-0.5 text-[11px] font-bold" style={{ color: theme.accentColor }}>{blueprint.name}</div>
        </div>
        <div className="pointer-events-none absolute right-3 top-2 z-10 text-right">
          <div className="text-[8px] uppercase tracking-[0.14em]" style={{ color: theme.labelColor }}>Systems installed</div>
          <div className="text-[12px] font-bold text-[#A9EEFF]">{installedCount}/{blueprint.slots.length}</div>
        </div>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 120 76" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${blueprint.name} interactive assembly schematic`}>
          <defs>
            <linearGradient id={`${prefix}-backdrop`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0B1730" /><stop offset="55%" stopColor="#070D1C" /><stop offset="100%" stopColor="#03060D" /></linearGradient>
            <linearGradient id={`${prefix}-metal`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#263E52" /><stop offset="45%" stopColor="#101C2C" /><stop offset="100%" stopColor="#070C16" /></linearGradient>
            <linearGradient id={`${prefix}-limb`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1B3044" /><stop offset="100%" stopColor="#09111F" /></linearGradient>
            <linearGradient id={`${prefix}-barrel`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#304C61" /><stop offset="50%" stopColor="#132235" /><stop offset="100%" stopColor="#080F1B" /></linearGradient>
            <linearGradient id={`${prefix}-edge`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#BDEFFF" /><stop offset="55%" stopColor="#5CAFD4" /><stop offset="100%" stopColor="#7A6BB4" /></linearGradient>
            <radialGradient id={`${prefix}-core`}><stop offset="0%" stopColor="#E5FCFF" /><stop offset="28%" stopColor="#69D8FF" /><stop offset="72%" stopColor="#2756A5" /><stop offset="100%" stopColor="#11193E" /></radialGradient>
            <linearGradient id={`${prefix}-beam`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#E5FCFF" /><stop offset="55%" stopColor="#72D7FF" /><stop offset="100%" stopColor="#72D7FF" stopOpacity="0" /></linearGradient>
            <pattern id={`${prefix}-grid`} width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#41607B" strokeWidth="0.18" opacity="0.28" /></pattern>
            <filter id={`${prefix}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <rect width="120" height="76" fill={`url(#${prefix}-backdrop)`} />
          <rect width="120" height="76" fill={`url(#${prefix}-grid)`} />
          <path d="M0 63 Q31 55 60 61 T120 60 V76 H0 Z" fill="#0A1630" opacity="0.3" />
          <rect x="0" y="-12" width="120" height="9" fill="#72D7FF" opacity="0.025">
            <animate attributeName="y" values="-12;88" dur="9s" repeatCount="indefinite" />
          </rect>
          {kind === "robot" ? <RobotSchematic prefix={prefix} powered={assignments.has("robot-core")} /> : kind === "firearm" ? <FirearmSchematic prefix={prefix} powered={installedCount >= 3} /> : <GenericSchematic prefix={prefix} powered={installedCount > 0} slotCount={blueprint.slots.length} />}
          {blueprint.slots.map((slot, index) => {
            const position = slotPosition(kind, slot, index, blueprint.slots.length);
            const assignedComponent = componentsById.get(assignments.get(slot.id) || "");
            const selected = slot.id === selectedSlot?.id;
            const color = groupColor(slot.group);
            const labelX = position.x > 83 ? position.x - 4 : position.x + 4;
            const labelAnchor = position.x > 83 ? "end" : "start";
            return <g
              key={slot.id}
              role="button"
              tabIndex={0}
              aria-label={`${slot.label}, ${assignedComponent ? assignedComponent.name : "empty"}`}
              style={{ cursor: "pointer", outline: "none" }}
              onClick={() => onSelectSlot(slot.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectSlot(slot.id); } }}
            >
              <title>{slot.label}: {assignedComponent?.name || (slot.required ? "required component missing" : "empty optional slot")}</title>
              <path d={`M${position.targetX} ${position.targetY} L${position.x} ${position.y}`} fill="none" stroke="transparent" strokeWidth="7" pointerEvents="stroke" />
              <path d={`M${position.targetX} ${position.targetY} L${position.x} ${position.y}`} fill="none" stroke={selected ? "#FFFFFF" : color} strokeWidth={selected ? 0.75 : 0.38} strokeDasharray={assignedComponent ? "none" : "1.1 0.85"} opacity={selected ? 0.95 : 0.62} />
              {selected && <circle cx={position.x} cy={position.y} r="4.7" fill="none" stroke="#FFFFFF" strokeWidth="0.45" strokeDasharray="1.1 0.8" filter={`url(#${prefix}-glow)`}>
                <animateTransform attributeName="transform" type="rotate" from={`0 ${position.x} ${position.y}`} to={`360 ${position.x} ${position.y}`} dur="6s" repeatCount="indefinite" />
              </circle>}
              <circle cx={position.x} cy={position.y} r="3.25" fill={assignedComponent ? "#132E3C" : "#090F1D"} stroke={selected ? "#FFFFFF" : color} strokeWidth={selected ? 0.8 : 0.55} />
              <text x={position.x} y={position.y + 0.95} textAnchor="middle" fill={assignedComponent ? "#DDFBFF" : color} fontSize="2.8" fontWeight="800">{index + 1}</text>
              {selected && <g pointerEvents="none">
                <rect x={labelAnchor === "end" ? labelX - Math.min(28, slot.label.length * 1.45) : labelX - 1} y={position.y - 3.2} width={Math.min(30, slot.label.length * 1.45) + 2} height="6.4" fill="#07101EEE" stroke={color} strokeWidth="0.3" />
                <text x={labelX} y={position.y + 0.8} textAnchor={labelAnchor} fill="#E5F6FF" fontSize="2.7" fontWeight="700">{slot.label.slice(0, 20)}</text>
              </g>}
            </g>;
          })}
          <path d="M4 4 H15 M4 4 V15 M105 4 H116 M116 4 V15 M4 61 V72 H15 M105 72 H116 V61" fill="none" stroke="#72D7FF" strokeWidth="0.38" opacity="0.48" />
        </svg>
      </div>

      <aside className="flex h-[350px] min-h-0 flex-col border p-2.5 sm:h-[430px]" style={{ background: theme.inputBg, borderColor: theme.dividerColor }}>
        <div className="shrink-0 border-b pb-2" style={{ borderColor: theme.dividerColor }}>
          <div className="text-[8px] uppercase tracking-[0.16em]" style={{ color: theme.labelColor }}>Selected module bay</div>
          <div className="mt-1 flex items-start justify-between gap-2">
            <div><div className="text-[11px] font-bold">{selectedSlot?.label || "No slots"}{selectedSlot?.required && <span className="ml-1 text-[#FF8998]">*</span>}</div><div className="mt-0.5 text-[8px]" style={{ color: groupColor(selectedSlot?.group || "") }}>{selectedSlot?.group || "GENERAL"}</div></div>
            <Cpu size={17} style={{ color: theme.accentColor }} />
          </div>
          {selectedSlot?.description && <p className="mt-2 text-[9px] leading-relaxed" style={{ color: theme.labelColor }}>{selectedSlot.description}</p>}
          {selectedSlot && (selectedSlot.acceptedCategories.length > 0 || selectedSlot.acceptedTags.length > 0) && <div className="mt-2 flex flex-wrap gap-1">
            {[...selectedSlot.acceptedCategories, ...selectedSlot.acceptedTags].map((value) => <span key={value} className="px-1.5 py-0.5 text-[7px] uppercase" style={{ background: theme.tagBg, color: theme.tagText }}>{value}</span>)}
          </div>}
        </div>

        <div className="shrink-0 border-b py-2" style={{ borderColor: theme.dividerColor }}>
          <div className="text-[8px] uppercase tracking-[0.14em]" style={{ color: theme.labelColor }}>Installed component</div>
          {selectedComponent ? <div className="mt-1.5">
            <div className="flex items-start gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center border text-[10px] font-bold" style={{ borderColor: groupColor(selectedSlot?.group || ""), color: groupColor(selectedSlot?.group || "") }}>{componentInitials(selectedComponent.name)}</div><div className="min-w-0"><div className="text-[9px] font-bold leading-tight">{selectedComponent.name}</div><div className="mt-1 text-[7px] uppercase" style={{ color: selectedManifest?.source === "owned" ? "#76D6A4" : "#F1D47A" }}>{selectedManifest?.source === "owned" ? "Using owned part" : selectedManifest ? `${selectedManifest.pricePaid.toLocaleString()} CR order` : "Pending quote"}</div></div></div>
            {selectedComponent.effects.slice(0, 3).map((effect) => <div key={effect.id} className="mt-1.5 text-[8px] leading-relaxed" style={{ color: theme.labelColor }}><span style={{ color: theme.textColor }}>{effect.label}:</span> {effect.text || `${effect.mode} ${effect.value} ${effect.key}`}</div>)}
          </div> : <div className="mt-1.5 text-[9px]" style={{ color: selectedSlot?.required ? "#FF9B87" : theme.labelColor }}>{selectedSlot?.required ? "A component is required here." : "This optional bay is empty."}</div>}
        </div>

        <div className="min-h-0 flex-1 pt-2">
          <div className="mb-1.5 text-[8px] uppercase tracking-[0.14em]" style={{ color: theme.labelColor }}>Assembly index</div>
          <div className="h-full space-y-1 overflow-y-auto pr-1">{blueprint.slots.map((slot, index) => {
            const assigned = assignments.has(slot.id);
            const selected = slot.id === selectedSlot?.id;
            return <button key={slot.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left" style={{ background: selected ? theme.cardBg : "transparent", borderLeft: `2px solid ${selected ? groupColor(slot.group) : "transparent"}` }} onClick={() => onSelectSlot(slot.id)}>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center border text-[7px] font-bold" style={{ borderColor: groupColor(slot.group), color: assigned ? "#DDFBFF" : groupColor(slot.group), background: assigned ? "#153344" : "transparent" }}>{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[8px]">{slot.label}</span>
              {assigned ? <Check size={10} className="shrink-0 text-[#76D6A4]" /> : slot.required ? <span className="text-[9px] text-[#FF8998]">*</span> : null}
            </button>;
          })}</div>
        </div>
      </aside>
    </div>

    <section className="border" style={{ background: theme.inputBg, borderColor: theme.dividerColor }}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.dividerColor }}>
        <div className="mr-auto"><div className="flex items-center gap-1.5 text-[10px] font-bold"><Package size={13} style={{ color: theme.accentColor }} /> Parts Bay</div><div className="text-[7px] uppercase tracking-[0.1em]" style={{ color: theme.labelColor }}>{selectedSlot ? `Compatible with ${selectedSlot.label}` : "Select a module bay"}</div></div>
        <label className="flex min-w-[170px] flex-1 items-center gap-1.5 border px-2 py-1 sm:max-w-[270px]" style={{ borderColor: theme.dividerColor, background: theme.panelBg }}><Search size={11} style={{ color: theme.labelColor }} /><input className="min-w-0 flex-1 bg-transparent text-[9px] outline-none" style={{ color: theme.textColor }} value={partQuery} onChange={(event) => setPartQuery(event.target.value)} placeholder="Search compatible parts" /></label>
        <div className="flex items-center border" style={{ borderColor: theme.dividerColor }}>{(["all", "owned", "orderable"] as PartFilter[]).map((filter) => <button key={filter} type="button" className="px-2 py-1 text-[8px] uppercase" style={{ background: partFilter === filter ? theme.cardBg : "transparent", color: partFilter === filter ? theme.accentColor : theme.labelColor }} onClick={() => setPartFilter(filter)}>{filter}</button>)}</div>
      </div>
      <div className="flex min-h-[132px] gap-2 overflow-x-auto p-2.5">
        {selectedSlot && <button type="button" disabled={!canEdit} onClick={() => onAssign(selectedSlot.id, "")} className="flex w-[150px] shrink-0 flex-col items-center justify-center border border-dashed p-2 text-center disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: selectedComponent ? theme.dividerColor : groupColor(selectedSlot.group), background: selectedComponent ? "transparent" : theme.cardBg }}>
          <X size={17} style={{ color: selectedComponent ? theme.labelColor : groupColor(selectedSlot.group) }} /><span className="mt-1.5 text-[9px] font-bold">Leave Empty</span><span className="mt-1 text-[7px]" style={{ color: selectedSlot.required ? "#FF9B87" : theme.labelColor }}>{selectedSlot.required ? "Required slot" : "Optional slot"}</span>
        </button>}
        {compatibleComponents.map((component) => {
          const owned = storage.quantities[component.id] || 0;
          const installed = component.id === selectedComponentId;
          const unavailable = owned <= 0 && !component.orderable && !installed;
          return <button key={component.id} type="button" disabled={!canEdit || unavailable} onClick={() => selectedSlot && onAssign(selectedSlot.id, component.id)} className="flex w-[210px] shrink-0 flex-col border p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-45" style={{ borderColor: installed ? groupColor(selectedSlot?.group || "") : theme.dividerColor, background: installed ? theme.cardBg : theme.panelBg, boxShadow: installed ? `inset 0 0 0 1px ${groupColor(selectedSlot?.group || "")}55` : "none" }}>
            <span className="flex w-full items-start gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center border text-[9px] font-bold" style={{ borderColor: installed ? groupColor(selectedSlot?.group || "") : theme.dividerColor, color: installed ? groupColor(selectedSlot?.group || "") : theme.labelColor }}>{componentInitials(component.name)}</span><span className="min-w-0 flex-1"><span className="block text-[9px] font-bold leading-tight">{component.name}</span><span className="mt-1 block text-[7px] uppercase" style={{ color: theme.labelColor }}>{component.category}</span></span>{installed && <Check size={12} className="shrink-0 text-[#76D6A4]" />}</span>
            <span className="mt-2 line-clamp-2 text-[7px] leading-relaxed" style={{ color: theme.labelColor }}>{component.description || component.effects[0]?.text || "Modular Workshop component"}</span>
            <span className="mt-auto flex w-full items-center justify-between gap-2 pt-2 text-[8px] font-bold">
              <span className="inline-flex items-center gap-1" style={{ color: owned > 0 ? "#76D6A4" : component.orderable ? "#F1D47A" : "#FF9B87" }}>{owned > 0 ? <><Warehouse size={10} /> {owned} owned</> : component.orderable ? <><ShoppingCart size={10} /> {component.price.toLocaleString()} CR</> : <><LockKeyhole size={10} /> Storage only</>}</span>
              {installed && <span style={{ color: theme.accentColor }}>INSTALLED</span>}
            </span>
          </button>;
        })}
        {selectedSlot && compatibleComponents.length === 0 && <div className="flex min-w-[240px] flex-1 items-center justify-center border border-dashed px-5 text-center text-[9px]" style={{ borderColor: theme.dividerColor, color: theme.labelColor }}>No compatible parts match this search and filter.</div>}
        {!selectedSlot && <div className="flex min-w-[240px] flex-1 items-center justify-center text-[9px]" style={{ color: theme.labelColor }}>Select a numbered module bay on the schematic to browse its components.</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[7px] uppercase tracking-[0.08em]" style={{ borderColor: theme.dividerColor, color: theme.labelColor }}>
        <span className="inline-flex items-center gap-1"><Warehouse size={9} /> Owned parts are used first</span>
        <span className="inline-flex items-center gap-1"><CircleDollarSign size={9} /> Orderable parts are charged when the DM completes construction</span>
      </div>
    </section>
  </div>;
}
