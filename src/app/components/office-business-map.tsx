import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Factory,
  Grid3X3,
  Map,
  Maximize2,
  Move,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { retro } from "./retro-styles";
import { S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT } from "./shared-styles";

const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;
const CATEGORY_OPTIONS = ["Unassigned", "Office", "Operations", "Industrial", "Commercial", "Research", "Security", "Storage", "Utility"] as const;
export type BusinessSlotCategory = typeof CATEGORY_OPTIONS[number];

export interface OfficeBusinessSlot {
  id: string;
  name: string;
  category: BusinessSlotCategory;
  x: number;
  y: number;
  width: number;
  height: number;
  filled: boolean;
  occupant: string;
  linkedFacilityId: string;
  notes: string;
}

export interface OfficeBusinessSector {
  id: string;
  name: string;
  description: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  slots: OfficeBusinessSlot[];
}

export interface OfficeBusinessMapState {
  version: 1;
  name: string;
  sectors: OfficeBusinessSector[];
}

type Rect = Pick<OfficeBusinessSector, "x" | "y" | "width" | "height">;
type PointerOperation = {
  layer: "sector" | "slot";
  kind: "move" | "resize";
  id: string;
  sectorId?: string;
  startClientX: number;
  startClientY: number;
  startRect: Rect;
};

const CATEGORY_COLORS: Record<BusinessSlotCategory, string> = {
  Unassigned: "#6B7280",
  Office: "#79B8FF",
  Operations: "#54C7A0",
  Industrial: "#D7A24A",
  Commercial: "#C084FC",
  Research: "#5CC8D7",
  Security: "#F47A91",
  Storage: "#9AA8C7",
  Utility: "#E18A5B",
};

const DEFAULT_SLOT = (id: string, name: string, category: BusinessSlotCategory, x: number, y: number): OfficeBusinessSlot => ({
  id,
  name,
  category,
  x,
  y,
  width: 3,
  height: 2,
  filled: false,
  occupant: "",
  linkedFacilityId: "",
  notes: "",
});

export function createDefaultOfficeBusinessMap(): OfficeBusinessMapState {
  return {
    version: 1,
    name: "Wasp Office Business Layout",
    sectors: [
      { id: "sector-front", name: "Front Office", description: "Reception, intake, and public-facing business.", color: "#79B8FF", x: 0, y: 0, width: 4, height: 3, slots: [DEFAULT_SLOT("slot-reception", "Reception Slot", "Office", 0, 0), DEFAULT_SLOT("slot-client", "Client Service Slot", "Commercial", 4, 0)] },
      { id: "sector-operations", name: "Operations", description: "Planning, dispatch, and active business coordination.", color: "#54C7A0", x: 4, y: 0, width: 5, height: 4, slots: [DEFAULT_SLOT("slot-command", "Command Slot", "Operations", 0, 0), DEFAULT_SLOT("slot-team", "Team Slot", "Office", 4, 0)] },
      { id: "sector-industrial", name: "Industrial Wing", description: "Production, fabrication, and heavy business functions.", color: "#D7A24A", x: 9, y: 0, width: 3, height: 5, slots: [DEFAULT_SLOT("slot-workshop", "Workshop Slot", "Industrial", 0, 0), DEFAULT_SLOT("slot-utility", "Utility Slot", "Utility", 4, 0)] },
      { id: "sector-storage", name: "Storage", description: "Inventory, supplies, and secured holdings.", color: "#9AA8C7", x: 0, y: 3, width: 4, height: 3, slots: [DEFAULT_SLOT("slot-stock", "Stock Slot", "Storage", 0, 0), DEFAULT_SLOT("slot-secure", "Secure Slot", "Security", 4, 0)] },
      { id: "sector-open", name: "Open Floor", description: "Flexible space ready for new business functions.", color: "#C084FC", x: 4, y: 4, width: 5, height: 4, slots: [DEFAULT_SLOT("slot-flex-a", "Flexible Slot A", "Unassigned", 0, 0), DEFAULT_SLOT("slot-flex-b", "Flexible Slot B", "Unassigned", 4, 0)] },
      { id: "sector-support", name: "Support", description: "Utilities, staff support, and back-office services.", color: "#E18A5B", x: 9, y: 5, width: 3, height: 3, slots: [DEFAULT_SLOT("slot-support", "Support Slot", "Utility", 0, 0), DEFAULT_SLOT("slot-security", "Security Slot", "Security", 4, 0)] },
    ],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(raw: Partial<Rect>, fallback: Rect): Rect {
  const width = clamp(Math.round(Number(raw.width) || fallback.width), 1, GRID_WIDTH);
  const height = clamp(Math.round(Number(raw.height) || fallback.height), 1, GRID_HEIGHT);
  return {
    width,
    height,
    x: clamp(Math.round(Number(raw.x) || 0), 0, GRID_WIDTH - width),
    y: clamp(Math.round(Number(raw.y) || 0), 0, GRID_HEIGHT - height),
  };
}

function normalizeSlot(raw: Partial<OfficeBusinessSlot>, index: number): OfficeBusinessSlot {
  const fallback = DEFAULT_SLOT(`slot-${index + 1}`, `Business Slot ${index + 1}`, "Unassigned", (index * 3) % 9, Math.floor(index / 3) * 2);
  const rect = normalizeRect(raw, fallback);
  const category = CATEGORY_OPTIONS.includes(raw.category as BusinessSlotCategory) ? raw.category as BusinessSlotCategory : "Unassigned";
  return {
    ...fallback,
    ...rect,
    id: typeof raw.id === "string" && raw.id ? raw.id : fallback.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : fallback.name,
    category,
    filled: Boolean(raw.filled),
    occupant: typeof raw.occupant === "string" ? raw.occupant : "",
    linkedFacilityId: typeof raw.linkedFacilityId === "string" ? raw.linkedFacilityId : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

export function normalizeOfficeBusinessMap(raw: unknown): OfficeBusinessMapState {
  const fallback = createDefaultOfficeBusinessMap();
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Partial<OfficeBusinessMapState>;
  const sectors = Array.isArray(candidate.sectors)
    ? candidate.sectors.slice(0, 40).map((rawSector, index) => {
        const source = rawSector && typeof rawSector === "object" ? rawSector as Partial<OfficeBusinessSector> : {};
        const fallbackSector = fallback.sectors[index % fallback.sectors.length];
        const rect = normalizeRect(source, fallbackSector);
        return {
          ...rect,
          id: typeof source.id === "string" && source.id ? source.id : `sector-${index + 1}`,
          name: typeof source.name === "string" && source.name.trim() ? source.name : `Sector ${index + 1}`,
          description: typeof source.description === "string" ? source.description : "",
          color: typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color) ? source.color : fallbackSector.color,
          slots: Array.isArray(source.slots) ? source.slots.slice(0, 80).map(normalizeSlot) : [],
        };
      })
    : fallback.sectors;
  return {
    version: 1,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : fallback.name,
    sectors,
  };
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function OfficeBusinessMap({
  value,
  onChange,
  isDM,
  facilities,
}: {
  value: OfficeBusinessMapState;
  onChange: (next: OfficeBusinessMapState) => void;
  isDM: boolean;
  facilities: Array<{ id: string; name: string }>;
}) {
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(value.sectors[0]?.id || null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [operation, setOperation] = useState<PointerOperation | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const draggedRef = useRef(false);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const activeSector = value.sectors.find((sector) => sector.id === activeSectorId) || null;
  const selectedSector = value.sectors.find((sector) => sector.id === selectedSectorId) || null;
  const selectedSlot = activeSector?.slots.find((slot) => slot.id === selectedSlotId) || null;

  useEffect(() => {
    if (!operation) return;
    const handlePointerMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const dx = Math.round(((event.clientX - operation.startClientX) / Math.max(1, bounds.width)) * GRID_WIDTH);
      const dy = Math.round(((event.clientY - operation.startClientY) / Math.max(1, bounds.height)) * GRID_HEIGHT);
      if (dx !== 0 || dy !== 0) draggedRef.current = true;
      const nextRect = operation.kind === "move"
        ? normalizeRect({ ...operation.startRect, x: operation.startRect.x + dx, y: operation.startRect.y + dy }, operation.startRect)
        : normalizeRect({ ...operation.startRect, width: operation.startRect.width + dx, height: operation.startRect.height + dy }, operation.startRect);
      const current = valueRef.current;
      const next = operation.layer === "sector"
        ? { ...current, sectors: current.sectors.map((sector) => sector.id === operation.id ? { ...sector, ...nextRect } : sector) }
        : { ...current, sectors: current.sectors.map((sector) => sector.id === operation.sectorId ? { ...sector, slots: sector.slots.map((slot) => slot.id === operation.id ? { ...slot, ...nextRect } : slot) } : sector) };
      valueRef.current = next;
      onChangeRef.current(next);
    };
    const handlePointerUp = () => setOperation(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [operation]);

  const updateSector = (sectorId: string, updates: Partial<OfficeBusinessSector>) => {
    onChange({ ...value, sectors: value.sectors.map((sector) => sector.id === sectorId ? { ...sector, ...updates } : sector) });
  };

  const updateSlot = (sectorId: string, slotId: string, updates: Partial<OfficeBusinessSlot>) => {
    onChange({ ...value, sectors: value.sectors.map((sector) => sector.id === sectorId ? { ...sector, slots: sector.slots.map((slot) => slot.id === slotId ? { ...slot, ...updates } : slot) } : sector) });
  };

  const startPointerOperation = (event: React.PointerEvent, layer: "sector" | "slot", kind: "move" | "resize", id: string, rect: Rect, sectorId?: string) => {
    if (!isDM || !editMode) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
    setOperation({ layer, kind, id, sectorId, startClientX: event.clientX, startClientY: event.clientY, startRect: rect });
  };

  const addSector = () => {
    const id = newId("sector");
    onChange({ ...value, sectors: [...value.sectors, { id, name: `Sector ${value.sectors.length + 1}`, description: "", color: "#79B8FF", x: 0, y: 0, width: 3, height: 3, slots: [] }] });
    setSelectedSectorId(id);
    setEditMode(true);
  };

  const deleteSector = (sectorId: string) => {
    if (!window.confirm("Delete this sector and every slot inside it?")) return;
    const sectors = value.sectors.filter((sector) => sector.id !== sectorId);
    onChange({ ...value, sectors });
    setSelectedSectorId(sectors[0]?.id || null);
    if (activeSectorId === sectorId) setActiveSectorId(null);
  };

  const addSlot = (sector: OfficeBusinessSector) => {
    const id = newId("slot");
    const slot = DEFAULT_SLOT(id, `Business Slot ${sector.slots.length + 1}`, "Unassigned", 0, 0);
    updateSector(sector.id, { slots: [...sector.slots, slot] });
    setSelectedSlotId(id);
    setEditMode(true);
  };

  const deleteSlot = (sectorId: string, slotId: string) => {
    if (!window.confirm("Delete this business slot?")) return;
    const sector = value.sectors.find((entry) => entry.id === sectorId);
    if (!sector) return;
    updateSector(sectorId, { slots: sector.slots.filter((slot) => slot.id !== slotId) });
    setSelectedSlotId(null);
  };

  const occupiedCount = useMemo(
    () => value.sectors.reduce((count, sector) => count + sector.slots.filter((slot) => slot.filled).length, 0),
    [value.sectors],
  );
  const slotCount = useMemo(() => value.sectors.reduce((count, sector) => count + sector.slots.length, 0), [value.sectors]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1A1A2B] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-bold" style={S_TEXT}>
            {activeSector && <button type="button" onClick={() => { setActiveSectorId(null); setSelectedSlotId(null); }} className="p-1" title="Back to business map" style={S_MUTED}><ArrowLeft size={14} /></button>}
            <Map size={16} style={{ color: activeSector?.color || "#79B8FF" }} />
            {activeSector ? activeSector.name : value.name}
          </div>
          <div className="mt-1 text-[9px]" style={S_DIM}>
            {activeSector ? activeSector.description || "Sector interior and business slots." : `${value.sectors.length} sectors | ${occupiedCount}/${slotCount} slots filled`}
          </div>
        </div>
        {isDM && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditMode((current) => !current)} className={`${editMode ? retro.sunken : retro.raised} flex items-center gap-2 px-3 py-2 text-[10px]`} style={{ color: editMode ? "#FFD56A" : "#9AA8C7", background: editMode ? "#2B210E" : "#0B0B14" }}>
              {editMode ? <Check size={12} /> : <Pencil size={12} />} {editMode ? "Finish Editing" : "Edit Layout"}
            </button>
            <button type="button" onClick={() => activeSector ? addSlot(activeSector) : addSector()} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_GREEN}>
              <Plus size={12} /> {activeSector ? "Add Slot" : "Add Sector"}
            </button>
          </div>
        )}
      </div>

      {!activeSector ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <MapCanvas ref={canvasRef} label="General business sector map">
            {value.sectors.map((sector) => {
              const selected = selectedSectorId === sector.id;
              const filled = sector.slots.filter((slot) => slot.filled).length;
              return (
                <button
                  type="button"
                  key={sector.id}
                  onPointerDown={(event) => startPointerOperation(event, "sector", "move", sector.id, sector)}
                  onClick={() => {
                    if (draggedRef.current) { draggedRef.current = false; return; }
                    setSelectedSectorId(sector.id);
                    if (!editMode) setActiveSectorId(sector.id);
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(sector), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : sector.color, background: `${sector.color}2B`, boxShadow: selected ? `inset 0 0 0 1px ${sector.color}, 0 0 10px ${sector.color}55` : "none", cursor: editMode ? "move" : "pointer" }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="truncate text-[10px] font-bold">{sector.name}</div>
                    <div className="mt-1 truncate text-[8px]" style={{ color: `${sector.color}` }}>{sector.width}x{sector.height} sector</div>
                    <div className="mt-auto text-[8px]" style={S_DIM}>{filled}/{sector.slots.length} slots</div>
                  </div>
                  {editMode && <ResizeHandle onPointerDown={(event) => startPointerOperation(event, "sector", "resize", sector.id, sector)} />}
                </button>
              );
            })}
          </MapCanvas>
          <aside className="min-h-0 border border-[#1A1A2B] bg-[#050508] p-3">
            {selectedSector ? (
              <SectorInspector sector={selectedSector} isDM={isDM} editMode={editMode} onUpdate={(updates) => updateSector(selectedSector.id, updates)} onOpen={() => setActiveSectorId(selectedSector.id)} onDelete={() => deleteSector(selectedSector.id)} />
            ) : (
              <EmptyInspector icon={Building2} text="Select a sector to inspect it." />
            )}
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <MapCanvas ref={canvasRef} label={`${activeSector.name} business slots`}>
            {activeSector.slots.map((slot) => {
              const selected = selectedSlotId === slot.id;
              const color = CATEGORY_COLORS[slot.category];
              return (
                <button
                  type="button"
                  key={slot.id}
                  onPointerDown={(event) => startPointerOperation(event, "slot", "move", slot.id, slot, activeSector.id)}
                  onClick={() => {
                    if (draggedRef.current) { draggedRef.current = false; return; }
                    setSelectedSlotId(slot.id);
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(slot), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : color, background: slot.filled ? `${color}42` : `${color}16`, boxShadow: selected ? `inset 0 0 0 1px ${color}, 0 0 10px ${color}55` : "none", cursor: editMode ? "move" : "pointer" }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="truncate text-[9px] font-bold">{slot.name}</div>
                    <div className="mt-1 truncate text-[7px]" style={{ color }}>{slot.category.toUpperCase()}</div>
                    <div className="mt-auto truncate text-[8px]" style={slot.filled ? S_TEXT : S_DIM}>{slot.filled ? slot.occupant || "FILLED" : "EMPTY"}</div>
                  </div>
                  {editMode && <ResizeHandle onPointerDown={(event) => startPointerOperation(event, "slot", "resize", slot.id, slot, activeSector.id)} />}
                </button>
              );
            })}
            {activeSector.slots.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-[10px] pointer-events-none" style={S_DIM}>No slots in this sector.</div>}
          </MapCanvas>
          <aside className="min-h-0 border border-[#1A1A2B] bg-[#050508] p-3">
            {selectedSlot ? (
              <SlotInspector
                slot={selectedSlot}
                facilities={facilities}
                isDM={isDM}
                editMode={editMode}
                onUpdate={(updates) => updateSlot(activeSector.id, selectedSlot.id, updates)}
                onDelete={() => deleteSlot(activeSector.id, selectedSlot.id)}
              />
            ) : (
              <EmptyInspector icon={Grid3X3} text="Select a slot to inspect or assign it." />
            )}
          </aside>
        </div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-[#1A1A2B] pt-3 text-[8px]" style={S_DIM}>
        {CATEGORY_OPTIONS.map((category) => <span key={category} className="flex items-center gap-1"><span className="h-2 w-2" style={{ background: CATEGORY_COLORS[category] }} />{category}</span>)}
      </div>
    </div>
  );
}

const MapCanvas = React.forwardRef<HTMLDivElement, { label: string; children: React.ReactNode }>(({ label, children }, ref) => (
  <div
    ref={ref}
    role="group"
    aria-label={label}
    className="relative w-full touch-none overflow-hidden border border-[#242B49] bg-[#030306]"
    style={{ aspectRatio: `${GRID_WIDTH} / ${GRID_HEIGHT}`, minHeight: 360, backgroundImage: "linear-gradient(#151522 1px, transparent 1px), linear-gradient(90deg, #151522 1px, transparent 1px)", backgroundSize: `${100 / GRID_WIDTH}% ${100 / GRID_HEIGHT}%` }}
  >
    {children}
  </div>
));
MapCanvas.displayName = "MapCanvas";

function rectStyle(rect: Rect): React.CSSProperties {
  return {
    left: `${(rect.x / GRID_WIDTH) * 100}%`,
    top: `${(rect.y / GRID_HEIGHT) * 100}%`,
    width: `${(rect.width / GRID_WIDTH) * 100}%`,
    height: `${(rect.height / GRID_HEIGHT) * 100}%`,
  };
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (event: React.PointerEvent) => void }) {
  return <span onPointerDown={onPointerDown} className="absolute bottom-0 right-0 flex h-5 w-5 cursor-se-resize items-center justify-center bg-black/60" title="Resize"><Maximize2 size={9} /></span>;
}

function SectorInspector({ sector, isDM, editMode, onUpdate, onOpen, onDelete }: { sector: OfficeBusinessSector; isDM: boolean; editMode: boolean; onUpdate: (updates: Partial<OfficeBusinessSector>) => void; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-[#1A1A2B] pb-2"><Building2 size={13} style={{ color: sector.color }} /><span className="truncate text-[11px] font-bold" style={S_TEXT}>{sector.name}</span></div>
      {isDM && editMode ? (
        <div className="space-y-3">
          <Field label="Sector Name"><input value={sector.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 50) })} className="w-full border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT} /></Field>
          <Field label="Description"><textarea value={sector.description} onChange={(event) => onUpdate({ description: event.target.value.slice(0, 500) })} rows={4} className="w-full resize-none border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT} /></Field>
          <Field label="Sector Color"><input type="color" value={sector.color} onChange={(event) => onUpdate({ color: event.target.value })} className="h-9 w-full cursor-pointer border border-[#25253B] bg-[#08080D] p-1" /></Field>
          <RectInputs rect={sector} onUpdate={onUpdate} />
        </div>
      ) : (
        <div className="text-[10px] leading-5" style={S_MUTED}>{sector.description || "No sector description."}</div>
      )}
      <div className="grid grid-cols-2 gap-2 text-[9px]"><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{sector.slots.length} slots</div><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{sector.slots.filter((slot) => slot.filled).length} filled</div></div>
      <button type="button" onClick={onOpen} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[10px]`} style={S_TEXT}><Map size={12} /> Open Sector</button>
      {isDM && editMode && <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Sector</button>}
    </div>
  );
}

function SlotInspector({ slot, facilities, isDM, editMode, onUpdate, onDelete }: { slot: OfficeBusinessSlot; facilities: Array<{ id: string; name: string }>; isDM: boolean; editMode: boolean; onUpdate: (updates: Partial<OfficeBusinessSlot>) => void; onDelete: () => void }) {
  const color = CATEGORY_COLORS[slot.category];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-[#1A1A2B] pb-2"><Factory size={13} style={{ color }} /><span className="truncate text-[11px] font-bold" style={S_TEXT}>{slot.name}</span></div>
      {isDM && editMode ? (
        <div className="space-y-3">
          <Field label="Slot Name"><input value={slot.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 50) })} className="w-full border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT} /></Field>
          <Field label="Type"><select value={slot.category} onChange={(event) => onUpdate({ category: event.target.value as BusinessSlotCategory })} className="w-full border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT}>{CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
          <label className="flex items-center justify-between gap-3 border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px]" style={S_TEXT}><span>{slot.filled ? "Filled" : "Empty"}</span><input type="checkbox" checked={slot.filled} onChange={(event) => onUpdate({ filled: event.target.checked, occupant: event.target.checked ? slot.occupant : "", linkedFacilityId: event.target.checked ? slot.linkedFacilityId : "" })} /></label>
          {slot.filled && (
            <div className="space-y-3">
              <Field label="Link Existing Facility"><select value={slot.linkedFacilityId} onChange={(event) => { const facility = facilities.find((entry) => entry.id === event.target.value); onUpdate({ linkedFacilityId: event.target.value, occupant: facility?.name || slot.occupant }); }} className="w-full border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT}><option value="">Custom assignment</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></Field>
              <Field label="Filled With"><input value={slot.occupant} onChange={(event) => onUpdate({ occupant: event.target.value.slice(0, 80), linkedFacilityId: "" })} placeholder="Business, room, facility, team..." className="w-full border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT} /></Field>
            </div>
          )}
          <Field label="Notes"><textarea value={slot.notes} onChange={(event) => onUpdate({ notes: event.target.value.slice(0, 1000) })} rows={4} className="w-full resize-none border border-[#25253B] bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={S_TEXT} /></Field>
          <RectInputs rect={slot} onUpdate={onUpdate} />
          <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Slot</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[9px]"><span style={S_DIM}>TYPE</span><span style={{ color }}>{slot.category}</span></div>
          <div className="border p-3" style={{ borderColor: color, background: `${color}16` }}><div className="text-[8px]" style={S_DIM}>ASSIGNMENT</div><div className="mt-1 text-[11px]" style={slot.filled ? S_TEXT : S_MUTED}>{slot.filled ? slot.occupant || "Filled" : "Empty"}</div></div>
          {slot.notes && <div className="whitespace-pre-wrap text-[10px] leading-5" style={S_MUTED}>{slot.notes}</div>}
        </div>
      )}
    </div>
  );
}

function RectInputs({ rect, onUpdate }: { rect: Rect; onUpdate: (updates: Partial<Rect>) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[8px]" style={S_DIM}><Move size={9} /> GRID POSITION &amp; SIZE</div>
      <div className="grid grid-cols-4 gap-1">
        {(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="text-[7px] uppercase" style={S_DIM}>{key}<input type="number" min={key === "x" || key === "y" ? 0 : 1} max={key === "x" || key === "width" ? GRID_WIDTH : GRID_HEIGHT} value={rect[key]} onChange={(event) => onUpdate(normalizeRect({ ...rect, [key]: Number(event.target.value) }, rect))} className="mt-1 w-full border border-[#25253B] bg-[#08080D] px-1 py-1.5 text-[9px] outline-none" style={S_TEXT} /></label>)}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[8px]" style={S_DIM}>{label.toUpperCase()}<div className="mt-1">{children}</div></label>;
}

function EmptyInspector({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; text: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center"><Icon size={22} style={S_DIM} /><div className="text-[10px]" style={S_DIM}>{text}</div></div>;
}

export default OfficeBusinessMap;
