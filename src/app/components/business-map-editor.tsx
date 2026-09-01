import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignStartVertical,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  Check,
  Copy,
  Eye,
  EyeOff,
  Factory,
  Grid3X3,
  Hand,
  Hammer,
  ImageOff,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LocateFixed,
  Lock,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Package,
  Pencil,
  Pentagon,
  Plus,
  Redo2,
  Route,
  Save,
  Settings2,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  BUSINESS_MAP_LAYER_DEFAULTS,
  FACILITY_ADDITION_CATEGORIES,
  FACILITY_SLOT_ROLES,
  MAX_BUSINESS_MAP_GRID_HEIGHT,
  MAX_BUSINESS_MAP_GRID_WIDTH,
  MIN_BUSINESS_MAP_GRID_HEIGHT,
  MIN_BUSINESS_MAP_GRID_WIDTH,
  facilityAdditionCategoryColor,
  facilitySlotRoleColor,
  canPlayerEditBusinessMap,
  cloneOfficeBusinessMap,
  createBusinessMapId,
  createDefaultBusinessSlot,
  createFacilityAddition,
  installFacilityAddition,
  isFacilityAdditionCompatible,
  isBusinessSectorUnlocked,
  normalizeBusinessMapRect,
  removeFacilityAddition,
  resizeOfficeBusinessMapGrid,
  type BusinessMapBackground,
  type BusinessMapLayer,
  type BusinessMapPoint,
  type BusinessMapRect,
  type BusinessMapShape,
  type BusinessMapShapeKind,
  type FacilityAddition,
  type FacilityAdditionCategory,
  type FacilitySlotRole,
  type OfficeBusinessExpansion,
  type OfficeBusinessMapState,
  type OfficeBusinessSector,
  type OfficeBusinessSlot,
} from "@/lib/business-map-model";
import { FACILITY_STAT_KEYS, FACILITY_STAT_META } from "@/lib/facility-depth-model";
import { deleteBusinessMapImage, uploadBusinessMapImage } from "@/lib/business-map-storage";
import type { FacilityAdditionAction } from "@/lib/office-state-api";
import { MysticParkZoneDecoration } from "./mystic-park-zone-decoration";
import { retro } from "./retro-styles";
import { S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT } from "./shared-styles";

type EditorTool = "select" | "hand" | BusinessMapShapeKind;
type InspectorMode = "selection" | "settings";

type RectOperation = {
  type: "rect";
  layer: "sector" | "slot" | "expansion";
  kind: "move" | "resize";
  id: string;
  sectorId?: string;
  startClientX: number;
  startClientY: number;
  startRect: BusinessMapRect;
};

type PointOperation = {
  type: "point";
  shapeId: string;
  pointIndex: number;
  sectorId: string | null;
};

type PanOperation = {
  type: "pan";
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
};

type PointerOperation = RectOperation | PointOperation | PanOperation;

export interface BusinessMapPlayerOption {
  id: string;
  name: string;
}

export interface OfficeBusinessMapProps {
  value: OfficeBusinessMapState;
  onChange: (next: OfficeBusinessMapState) => void;
  isDM: boolean;
  facilities: Array<{ id: string; name: string }>;
  additions?: FacilityAddition[];
  onAdditionsChange?: (next: FacilityAddition[]) => void;
  additionUsage?: Record<string, number>;
  mapKey?: string;
  currentPlayerId?: string;
  players?: BusinessMapPlayerOption[];
  onPlayerAction?: (action: FacilityAdditionAction) => Promise<void>;
  canManageAdditions?: boolean;
  onAdditionPreviewChange?: (addition: FacilityAddition | null) => void;
  onExpansionAction?: (expansionId: string, action: "fund" | "complete") => Promise<void>;
  canFundExpansions?: boolean;
  personalFundBalance?: number;
  operationsPanel?: React.ReactNode;
  onSave?: () => Promise<boolean>;
  saveState?: "idle" | "saving" | "saved" | "error";
}

const TOOL_META: Array<{ id: EditorTool; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "hand", label: "Pan", icon: Hand },
  { id: "wall", label: "Wall", icon: Minus },
  { id: "pathway", label: "Pathway", icon: Route },
  { id: "area", label: "Area", icon: Pentagon },
  { id: "label", label: "Label", icon: Type },
];

const SURFACE_BORDER = "#242B49";
const CONTROL_BG = "#08080D";
const CONTROL_BORDER = "#25253B";

function layerForShape(kind: BusinessMapShapeKind) {
  return kind === "area" ? "areas" : kind === "pathway" ? "pathways" : kind === "label" ? "labels" : "walls";
}

function shapeDefaults(kind: BusinessMapShapeKind, points: BusinessMapPoint[], index: number): BusinessMapShape {
  return {
    id: createBusinessMapId(kind),
    kind,
    layerId: layerForShape(kind),
    name: `${kind[0].toUpperCase()}${kind.slice(1)} ${index + 1}`,
    points,
    color: kind === "wall" ? "#E5ECFF" : kind === "pathway" ? "#D7A24A" : "#79B8FF",
    fillColor: "#79B8FF",
    opacity: kind === "area" ? 0.25 : 0.9,
    strokeWidth: kind === "wall" ? 0.18 : 0.35,
    label: kind === "label" ? "Label" : "",
    curved: false,
    visible: true,
    locked: false,
  };
}

function organicShapeProfile(id: string) {
  const alternate = id.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % 2 === 0;
  return alternate
    ? {
        borderRadius: "34% 22% 30% 20% / 24% 32% 22% 30%",
        horizontal: [0.34, 0.22, 0.3, 0.2],
        vertical: [0.24, 0.32, 0.22, 0.3],
      }
    : {
        borderRadius: "22% 34% 20% 30% / 32% 22% 30% 24%",
        horizontal: [0.22, 0.34, 0.2, 0.3],
        vertical: [0.32, 0.22, 0.3, 0.24],
      };
}

function shapePath(shape: Pick<BusinessMapShape, "id" | "points" | "curved">) {
  const points = shape.points;
  if (points.length === 0) return "";
  if (shape.id === "park-ring" && points.length >= 2) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radiusX = (maxX - minX) / 2;
    const radiusY = (maxY - minY) / 2;
    return `M ${minX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${maxX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${minX} ${centerY} Z`;
  }
  if (shape.id.startsWith("perimeter-") && points.length >= 2) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const sectorId = shape.id.slice("perimeter-".length);
    const profile = organicShapeProfile(sectorId);
    const [topLeftX, topRightX, bottomRightX, bottomLeftX] = profile.horizontal.map((ratio) => ratio * width);
    const [topLeftY, topRightY, bottomRightY, bottomLeftY] = profile.vertical.map((ratio) => ratio * height);
    return [
      `M ${minX + topLeftX} ${minY}`,
      `H ${maxX - topRightX}`,
      `A ${topRightX} ${topRightY} 0 0 1 ${maxX} ${minY + topRightY}`,
      `V ${maxY - bottomRightY}`,
      `A ${bottomRightX} ${bottomRightY} 0 0 1 ${maxX - bottomRightX} ${maxY}`,
      `H ${minX + bottomLeftX}`,
      `A ${bottomLeftX} ${bottomLeftY} 0 0 1 ${minX} ${maxY - bottomLeftY}`,
      `V ${minY + topLeftY}`,
      `A ${topLeftX} ${topLeftY} 0 0 1 ${minX + topLeftX} ${minY}`,
      "Z",
    ].join(" ");
  }
  if (!shape.curved || points.length < 3) {
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  }
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (index === points.length - 1) {
      path += ` L ${point.x} ${point.y}`;
    } else {
      const next = points[index + 1];
      path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
    }
  }
  return path;
}

function shapeBounds(shape: BusinessMapShape) {
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function moveShape(shape: BusinessMapShape, dx: number, dy: number, grid: OfficeBusinessMapState["grid"]) {
  return {
    ...shape,
    points: shape.points.map((point) => ({
      x: Math.max(0, Math.min(grid.width, point.x + dx)),
      y: Math.max(0, Math.min(grid.height, point.y + dy)),
    })),
  };
}

function surfaceFor(map: OfficeBusinessMapState, sectorId: string | null) {
  return sectorId ? map.sectors.find((sector) => sector.id === sectorId) || null : map;
}

function withSurface(
  map: OfficeBusinessMapState,
  sectorId: string | null,
  updates: Partial<Pick<OfficeBusinessMapState, "background" | "layers" | "shapes">>,
) {
  if (!sectorId) return { ...map, ...updates };
  return {
    ...map,
    sectors: map.sectors.map((sector) => sector.id === sectorId ? { ...sector, ...updates } : sector),
  };
}

function rectStyle(rect: BusinessMapRect, grid: OfficeBusinessMapState["grid"]): React.CSSProperties {
  return {
    left: `${(rect.x / grid.width) * 100}%`,
    top: `${(rect.y / grid.height) * 100}%`,
    width: `${(rect.width / grid.width) * 100}%`,
    height: `${(rect.height / grid.height) * 100}%`,
  };
}

function overviewZoom(map: OfficeBusinessMapState) {
  const grounds = map.shapes.find((shape) => shape.id === "park-boundary" && shape.points.length >= 2);
  if (!grounds) return 1;
  const xs = grounds.points.map((point) => point.x);
  const width = Math.max(...xs) - Math.min(...xs);
  if (width <= 0 || width >= map.grid.width) return 1;
  return Math.max(1, Math.min(1.6, Number((map.grid.width / width).toFixed(2))));
}

function sectorShapeStyle(sector: OfficeBusinessSector): React.CSSProperties {
  if (sector.visualShape === "ellipse") {
    return { borderRadius: "50%", padding: "10px 14px" };
  }
  if (sector.visualShape === "organic") {
    return { borderRadius: organicShapeProfile(sector.id).borderRadius };
  }
  return { borderRadius: 0 };
}

function canUseMap(map: OfficeBusinessMapState, isDM: boolean, playerId: string, action: "install" | "remove") {
  return isDM || canPlayerEditBusinessMap(map, playerId, action);
}

export function OfficeBusinessMap({
  value,
  onChange,
  isDM,
  facilities,
  additions = [],
  onAdditionsChange,
  additionUsage = {},
  mapKey = "global",
  currentPlayerId = "",
  players = [],
  onPlayerAction,
  canManageAdditions = false,
  onAdditionPreviewChange,
  onExpansionAction,
  canFundExpansions = false,
  personalFundBalance = 0,
  operationsPanel,
  onSave,
  saveState = "idle",
}: OfficeBusinessMapProps) {
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(value.sectors[0]?.id || null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectedExpansionId, setSelectedExpansionId] = useState<string | null>(null);
  const [selectedAdditionId, setSelectedAdditionId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditorTool>("select");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("selection");
  const [rightPanelTab, setRightPanelTab] = useState<"inspect" | "operations">("inspect");
  const [pendingPoints, setPendingPoints] = useState<BusinessMapPoint[]>([]);
  const [operation, setOperation] = useState<PointerOperation | null>(null);
  const [zoom, setZoom] = useState(() => overviewZoom(value));
  const [history, setHistory] = useState<{ past: OfficeBusinessMapState[]; future: OfficeBusinessMapState[] }>({ past: [], future: [] });
  const [assetProgress, setAssetProgress] = useState<number | null>(null);
  const [assetError, setAssetError] = useState("");
  const [brokenBackground, setBrokenBackground] = useState(false);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [busyExpansionId, setBusyExpansionId] = useState<string | null>(null);
  const [additionSearch, setAdditionSearch] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const additionLibraryRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const draggedRef = useRef(false);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const recenterViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
  }, []);

  const activeSector = value.sectors.find((sector) => sector.id === activeSectorId) || null;
  const selectedSector = value.sectors.find((sector) => sector.id === selectedSectorId) || null;
  const selectedSlotSector = activeSector || selectedSector;
  const selectedSlot = selectedSlotSector?.slots.find((slot) => slot.id === selectedSlotId) || null;
  const selectedExpansion = !activeSector ? value.expansions.find((expansion) => expansion.id === selectedExpansionId) || null : null;
  const surface = surfaceFor(value, activeSectorId) || value;
  const selectedShapes = surface.shapes.filter((shape) => selectedShapeIds.includes(shape.id));
  const selectedShape = selectedShapes[0] || null;
  const slotLayer = surface.layers.find((layer) => layer.id === "slots");
  const canInstallAdditions = isDM || canManageAdditions || canUseMap(value, isDM, currentPlayerId, "install");
  const canRemoveAdditions = isDM || canManageAdditions || canUseMap(value, isDM, currentPlayerId, "remove");

  useEffect(() => {
    setHistory({ past: [], future: [] });
    setPendingPoints([]);
    setSelectedShapeIds([]);
    setSelectedExpansionId(null);
    setBrokenBackground(false);
  }, [mapKey]);

  useEffect(() => {
    setZoom(activeSectorId ? 1 : overviewZoom(valueRef.current));
  }, [activeSectorId, mapKey]);

  useEffect(() => {
    const positionAtEntrance = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    };
    const frame = window.requestAnimationFrame(positionAtEntrance);
    const timeout = window.setTimeout(positionAtEntrance, 120);
    const observer = typeof ResizeObserver === "undefined" || !canvasRef.current ? null : new ResizeObserver(positionAtEntrance);
    if (canvasRef.current) observer?.observe(canvasRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [activeSectorId, mapKey]);

  useEffect(() => {
    if (operationsPanel) setRightPanelTab("inspect");
  }, [activeSectorId, inspectorMode, selectedSectorId, selectedShapeIds, selectedSlotId]);

  useEffect(() => {
    if (activeSectorId && !value.sectors.some((sector) => sector.id === activeSectorId)) {
      setActiveSectorId(null);
      setSelectedSlotId(null);
    }
  }, [activeSectorId, value.sectors]);

  useEffect(() => {
    if (selectedShapeIds.length > 0) setSelectedExpansionId(null);
  }, [selectedShapeIds]);

  useEffect(() => {
    setBrokenBackground(false);
  }, [activeSectorId, surface.background.imageUrl]);

  useEffect(() => {
    onAdditionPreviewChange?.(additions.find((addition) => addition.id === selectedAdditionId) || null);
    return () => onAdditionPreviewChange?.(null);
  }, [additions, onAdditionPreviewChange, selectedAdditionId]);

  const pushHistory = useCallback((snapshot = valueRef.current) => {
    setHistory((current) => ({
      past: [...current.past.slice(-49), cloneOfficeBusinessMap(snapshot)],
      future: [],
    }));
  }, []);

  const emit = useCallback((next: OfficeBusinessMapState, record = true) => {
    if (record) pushHistory(valueRef.current);
    valueRef.current = next;
    onChangeRef.current(next);
  }, [pushHistory]);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;
      const now = cloneOfficeBusinessMap(valueRef.current);
      valueRef.current = previous;
      onChangeRef.current(previous);
      return { past: current.past.slice(0, -1), future: [now, ...current.future].slice(0, 50) };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      const now = cloneOfficeBusinessMap(valueRef.current);
      valueRef.current = next;
      onChangeRef.current(next);
      return { past: [...current.past.slice(-49), now], future: current.future.slice(1) };
    });
  }, []);

  const updateSector = useCallback((sectorId: string, updates: Partial<OfficeBusinessSector>, record = true) => {
    const current = valueRef.current;
    emit({ ...current, sectors: current.sectors.map((sector) => sector.id === sectorId ? { ...sector, ...updates } : sector) }, record);
  }, [emit]);

  const updateExpansion = useCallback((expansionId: string, updates: Partial<OfficeBusinessExpansion>, record = true) => {
    const current = valueRef.current;
    emit({ ...current, expansions: current.expansions.map((expansion) => expansion.id === expansionId ? { ...expansion, ...updates } : expansion) }, record);
  }, [emit]);

  const updateSlot = useCallback((sectorId: string, slotId: string, updates: Partial<OfficeBusinessSlot>, record = true) => {
    const current = valueRef.current;
    emit({
      ...current,
      sectors: current.sectors.map((sector) => sector.id === sectorId
        ? { ...sector, slots: sector.slots.map((slot) => slot.id === slotId ? { ...slot, ...updates } : slot) }
        : sector),
    }, record);
  }, [emit]);

  const updateCurrentSurface = useCallback((updates: Partial<Pick<OfficeBusinessMapState, "background" | "layers" | "shapes">>, record = true) => {
    emit(withSurface(valueRef.current, activeSectorId, updates), record);
  }, [activeSectorId, emit]);

  const pointFromClient = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const grid = valueRef.current.grid;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    const precision = grid.snapToGrid ? 1 : 4;
    return {
      x: Math.max(0, Math.min(grid.width, Math.round((((clientX - bounds.left) / Math.max(1, bounds.width)) * grid.width) * precision) / precision)),
      y: Math.max(0, Math.min(grid.height, Math.round((((clientY - bounds.top) / Math.max(1, bounds.height)) * grid.height) * precision) / precision)),
    };
  }, []);

  useEffect(() => {
    if (!operation) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (operation.type === "pan") {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft = operation.startScrollLeft - (event.clientX - operation.startClientX);
        viewport.scrollTop = operation.startScrollTop - (event.clientY - operation.startClientY);
        draggedRef.current = true;
        return;
      }
      if (operation.type === "point") {
        const current = valueRef.current;
        const currentSurface = surfaceFor(current, operation.sectorId);
        if (!currentSurface) return;
        const point = pointFromClient(event.clientX, event.clientY);
        const shapes = currentSurface.shapes.map((shape) => shape.id !== operation.shapeId ? shape : {
          ...shape,
          points: shape.points.map((entry, index) => index === operation.pointIndex ? point : entry),
        });
        emit(withSurface(current, operation.sectorId, { shapes }), false);
        draggedRef.current = true;
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const grid = valueRef.current.grid;
      const dx = Math.round(((event.clientX - operation.startClientX) / Math.max(1, bounds.width)) * grid.width);
      const dy = Math.round(((event.clientY - operation.startClientY) / Math.max(1, bounds.height)) * grid.height);
      if (dx !== 0 || dy !== 0) draggedRef.current = true;
      const nextRect = operation.kind === "move"
        ? normalizeBusinessMapRect({ ...operation.startRect, x: operation.startRect.x + dx, y: operation.startRect.y + dy }, operation.startRect, grid)
        : normalizeBusinessMapRect({ ...operation.startRect, width: operation.startRect.width + dx, height: operation.startRect.height + dy }, operation.startRect, grid);
      const current = valueRef.current;
      const next = operation.layer === "sector"
        ? { ...current, sectors: current.sectors.map((sector) => sector.id === operation.id ? { ...sector, ...nextRect } : sector) }
        : operation.layer === "expansion"
          ? { ...current, expansions: current.expansions.map((expansion) => expansion.id === operation.id ? { ...expansion, ...nextRect } : expansion) }
        : {
            ...current,
            sectors: current.sectors.map((sector) => sector.id === operation.sectorId
              ? { ...sector, slots: sector.slots.map((slot) => slot.id === operation.id ? { ...slot, ...nextRect } : slot) }
              : sector),
          };
      emit(next, false);
    };
    const handlePointerUp = () => setOperation(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [emit, operation, pointFromClient]);

  const startRectOperation = (
    event: React.PointerEvent,
    layer: "sector" | "slot" | "expansion",
    kind: "move" | "resize",
    id: string,
    rect: BusinessMapRect,
    sectorId?: string,
  ) => {
    if (!isDM || !editMode || tool !== "select") return;
    if (layer === "slot" && (slotLayer?.locked || slotLayer?.visible === false)) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
    pushHistory();
    setOperation({ type: "rect", layer, kind, id, sectorId, startClientX: event.clientX, startClientY: event.clientY, startRect: rect });
  };

  const startPointOperation = (event: React.PointerEvent, shape: BusinessMapShape, pointIndex: number) => {
    const layer = surface.layers.find((entry) => entry.id === shape.layerId);
    if (!isDM || !editMode || tool !== "select" || shape.locked || layer?.locked) return;
    event.preventDefault();
    event.stopPropagation();
    pushHistory();
    setOperation({ type: "point", shapeId: shape.id, pointIndex, sectorId: activeSectorId });
  };

  const startPan = (event: React.PointerEvent) => {
    if (tool !== "hand") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    setOperation({
      type: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    });
  };

  const addSector = () => {
    const current = valueRef.current;
    const id = createBusinessMapId("sector");
    const sector: OfficeBusinessSector = {
      id,
      name: `Sector ${current.sectors.length + 1}`,
      description: "",
      color: "#79B8FF",
      x: 0,
      y: 0,
      width: Math.min(4, current.grid.width),
      height: Math.min(3, current.grid.height),
      background: { mode: "solid", color: "#030306", imageUrl: "", opacity: 1, fit: "cover" },
      layers: BUSINESS_MAP_LAYER_DEFAULTS.map((layer) => ({ ...layer })),
      shapes: [],
      slots: [],
      visualShape: "rectangle",
    };
    emit({ ...current, sectors: [...current.sectors, sector] });
    setSelectedSectorId(id);
    setInspectorMode("selection");
    setEditMode(true);
  };

  const deleteSector = (sectorId: string) => {
    if (!window.confirm("Delete this sector, its geometry, and every slot inside it?")) return;
    const current = valueRef.current;
    const removed = current.sectors.find((sector) => sector.id === sectorId);
    const sectors = current.sectors.filter((sector) => sector.id !== sectorId);
    emit({ ...current, sectors });
    if (removed?.background.imageAsset) void deleteBusinessMapImage(removed.background.imageAsset).catch(() => undefined);
    setSelectedSectorId(sectors[0]?.id || null);
    if (activeSectorId === sectorId) setActiveSectorId(null);
  };

  const addSlot = (sector: OfficeBusinessSector) => {
    const slot = createDefaultBusinessSlot(createBusinessMapId("slot"), `Business Slot ${sector.slots.length + 1}`, "Unassigned", 0, 0);
    updateSector(sector.id, { slots: [...sector.slots, slot] });
    setSelectedSlotId(slot.id);
    setInspectorMode("selection");
    setTool("select");
    setEditMode(true);
  };

  const deleteSlot = (sectorId: string, slotId: string) => {
    const sector = valueRef.current.sectors.find((entry) => entry.id === sectorId);
    const slot = sector?.slots.find((entry) => entry.id === slotId);
    if (!sector || !slot) return;
    if (slot.tier === "major") {
      setActionError("Major slots are permanent. Change it to a minor slot before deleting it.");
      return;
    }
    if (slot.installedAdditionId) {
      setActionError("Remove the installed Facility Addition before deleting this slot.");
      return;
    }
    if (!window.confirm("Delete this business slot?")) return;
    updateSector(sectorId, { slots: sector.slots.filter((entry) => entry.id !== slotId) });
    setSelectedSlotId(null);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (!isDM || !editMode || tool === "hand") return;
    if (tool === "select") {
      setSelectedShapeIds([]);
      setSelectedExpansionId(null);
      if (activeSector) setSelectedSlotId(null);
      else setSelectedSectorId(null);
      setInspectorMode("selection");
      return;
    }
    const point = pointFromClient(event.clientX, event.clientY);
    if (tool === "label") {
      const shape = shapeDefaults("label", [point], surface.shapes.length);
      updateCurrentSurface({ shapes: [...surface.shapes, shape] });
      setSelectedShapeIds([shape.id]);
      setTool("select");
      setInspectorMode("selection");
      return;
    }
    setPendingPoints((current) => [...current, point]);
  };

  const finishDrawing = () => {
    if (tool !== "wall" && tool !== "pathway" && tool !== "area") return;
    const minimum = tool === "area" ? 3 : 2;
    if (pendingPoints.length < minimum) {
      setActionError(`${tool === "area" ? "Areas" : "Lines"} need at least ${minimum} points.`);
      return;
    }
    const shape = shapeDefaults(tool, pendingPoints, surface.shapes.length);
    updateCurrentSurface({ shapes: [...surface.shapes, shape] });
    setPendingPoints([]);
    setSelectedShapeIds([shape.id]);
    setTool("select");
    setInspectorMode("selection");
  };

  const cancelDrawing = () => {
    setPendingPoints([]);
    setTool("select");
  };

  const updateShape = (shapeId: string, updates: Partial<BusinessMapShape>) => {
    updateCurrentSurface({ shapes: surface.shapes.map((shape) => shape.id === shapeId ? { ...shape, ...updates } : shape) });
  };

  const deleteSelectedShapes = () => {
    if (selectedShapeIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedShapeIds.length} selected map element${selectedShapeIds.length === 1 ? "" : "s"}?`)) return;
    updateCurrentSurface({ shapes: surface.shapes.filter((shape) => !selectedShapeIds.includes(shape.id)) });
    setSelectedShapeIds([]);
  };

  const duplicateSelectedShapes = () => {
    if (selectedShapes.length === 0) return;
    const copies = selectedShapes.map((shape) => ({
      ...moveShape(shape, 1, 1, value.grid),
      id: createBusinessMapId(shape.kind),
      name: `${shape.name} Copy`,
    }));
    updateCurrentSurface({ shapes: [...surface.shapes, ...copies] });
    setSelectedShapeIds(copies.map((shape) => shape.id));
  };

  const alignSelectedShapes = (mode: "left" | "center" | "top") => {
    if (selectedShapes.length === 0) return;
    const bounds = selectedShapes.map(shapeBounds);
    const target = mode === "left"
      ? Math.min(...bounds.map((entry) => entry.left))
      : mode === "top"
        ? Math.min(...bounds.map((entry) => entry.top))
        : value.grid.width / 2;
    updateCurrentSurface({
      shapes: surface.shapes.map((shape) => {
        const index = selectedShapes.findIndex((entry) => entry.id === shape.id);
        if (index < 0 || shape.locked) return shape;
        const bound = bounds[index];
        const dx = mode === "left" ? target - bound.left : mode === "center" ? target - ((bound.left + bound.right) / 2) : 0;
        const dy = mode === "top" ? target - bound.top : 0;
        return moveShape(shape, dx, dy, value.grid);
      }),
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !isTyping) {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y" && !isTyping) {
      event.preventDefault();
      redo();
    } else if (event.key === "Escape" && pendingPoints.length > 0) {
      cancelDrawing();
    } else if (event.key === "Enter" && pendingPoints.length > 0 && !isTyping) {
      finishDrawing();
    }
  };

  const uploadBackground = async (file: File) => {
    setAssetError("");
    setAssetProgress(0);
    try {
      const previous = surface.background.imageAsset;
      const asset = await uploadBusinessMapImage(mapKey, "background", file, setAssetProgress);
      updateCurrentSurface({ background: { ...surface.background, mode: "image", imageUrl: asset.publicUrl, imageAsset: asset } });
      setBrokenBackground(false);
      if (previous && previous.path !== asset.path) void deleteBusinessMapImage(previous).catch(() => undefined);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "Background upload failed.");
    } finally {
      setAssetProgress(null);
    }
  };

  const clearBackgroundImage = () => {
    const previous = surface.background.imageAsset;
    if (previous && !window.confirm("Remove this uploaded background image from the map and storage?")) return;
    updateCurrentSurface({ background: { ...surface.background, mode: "solid", imageUrl: "", imageAsset: undefined } });
    setBrokenBackground(false);
    if (previous) void deleteBusinessMapImage(previous).catch((error) => setAssetError(error instanceof Error ? error.message : "Stored image cleanup failed."));
  };

  const updateLayers = (layers: BusinessMapLayer[]) => updateCurrentSurface({ layers });

  const handleInstall = async (sector: OfficeBusinessSector, slot: OfficeBusinessSlot, addition: FacilityAddition) => {
    setActionError("");
    if (slot.tier === "major") {
      setActionError("Major rides and attractions are permanent and cannot accept Facility Additions.");
      return;
    }
    if (!isFacilityAdditionCompatible(slot, addition)) {
      setActionError("That addition does not match this slot's category, tags, or footprint.");
      return;
    }
    const available = Math.max(0, addition.quantity - (additionUsage[addition.id] || 0));
    if (available <= 0) {
      setActionError("No copies of that Facility Addition are available.");
      return;
    }
    if (slot.filled && !slot.installedAdditionId) {
      setActionError("Remove the custom assignment before installing an addition.");
      return;
    }
    if (isDM) {
      emit(installFacilityAddition(valueRef.current, sector.id, slot.id, addition, currentPlayerId || "dm"));
      return;
    }
    if (!canInstallAdditions || !onPlayerAction) {
      setActionError("You do not have permission to install additions on this map.");
      return;
    }
    setBusySlotId(slot.id);
    try {
      await onPlayerAction({ action: "install", scopeId: mapKey, sectorId: sector.id, slotId: slot.id, additionId: addition.id });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Installation failed.");
    } finally {
      setBusySlotId(null);
    }
  };

  const handleRemove = async (sector: OfficeBusinessSector, slot: OfficeBusinessSlot) => {
    if (!slot.installedAdditionId) return;
    setActionError("");
    if (slot.tier === "major") {
      setActionError("Major rides and attractions cannot be removed.");
      return;
    }
    if (isDM) {
      emit(removeFacilityAddition(valueRef.current, sector.id, slot.id));
      return;
    }
    if (!canRemoveAdditions || !onPlayerAction) {
      setActionError("You do not have permission to remove additions from this map.");
      return;
    }
    setBusySlotId(slot.id);
    try {
      await onPlayerAction({ action: "remove", scopeId: mapKey, sectorId: sector.id, slotId: slot.id });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setBusySlotId(null);
    }
  };

  const addAddition = () => {
    if (!isDM || !onAdditionsChange) return;
    const addition = {
      ...createFacilityAddition(additions.length),
      category: selectedSlot?.acceptedCategories[0] || "Unassigned",
      additionCategory: selectedSlot?.acceptedAdditionCategories[0] || "Unassigned",
      tags: selectedSlot?.acceptedTags.slice(0, 1) || [],
    } as FacilityAddition;
    onAdditionsChange([...additions, addition]);
    setSelectedAdditionId(addition.id);
    window.setTimeout(() => additionLibraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const updateAddition = (additionId: string, updates: Partial<FacilityAddition>) => {
    if (!isDM || !onAdditionsChange) return;
    onAdditionsChange(additions.map((addition) => addition.id === additionId ? { ...addition, ...updates, updatedAt: new Date().toISOString() } : addition));
  };

  const deleteAddition = (addition: FacilityAddition) => {
    if (!isDM || !onAdditionsChange) return;
    if ((additionUsage[addition.id] || 0) > 0) {
      setActionError("Remove this addition from every installed slot before deleting it from storage.");
      return;
    }
    if (!window.confirm(`Delete ${addition.name} from Facility Addition storage?`)) return;
    onAdditionsChange(additions.filter((entry) => entry.id !== addition.id));
    setSelectedAdditionId(null);
    if (addition.thumbnailAsset) void deleteBusinessMapImage(addition.thumbnailAsset).catch(() => undefined);
  };

  const uploadAdditionThumbnail = async (addition: FacilityAddition, file: File) => {
    setAssetError("");
    setAssetProgress(0);
    try {
      const asset = await uploadBusinessMapImage(addition.id, "addition", file, setAssetProgress);
      updateAddition(addition.id, { thumbnailUrl: asset.publicUrl, thumbnailAsset: asset });
      if (addition.thumbnailAsset && addition.thumbnailAsset.path !== asset.path) {
        void deleteBusinessMapImage(addition.thumbnailAsset).catch(() => undefined);
      }
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "Thumbnail upload failed.");
    } finally {
      setAssetProgress(null);
    }
  };

  const unlockedSectors = useMemo(() => value.sectors.filter((sector) => isBusinessSectorUnlocked(value, sector)), [value]);
  const themedSectors = useMemo(() => unlockedSectors.filter((sector) => sector.decorationTheme), [unlockedSectors]);
  const summarySectors = themedSectors.length > 0 ? themedSectors : unlockedSectors;
  const occupiedCount = useMemo(
    () => summarySectors.reduce((count, sector) => count + sector.slots.filter((slot) => slot.filled).length, 0),
    [summarySectors],
  );
  const slotCount = useMemo(() => summarySectors.reduce((count, sector) => count + sector.slots.length, 0), [summarySectors]);
  const filteredAdditions = useMemo(() => {
    const query = additionSearch.trim().toLowerCase();
    return additions.filter((addition) => {
      if (selectedSlot && !isFacilityAdditionCompatible(selectedSlot, addition)) return false;
      if (!query) return true;
      return `${addition.name} ${addition.additionCategory} ${addition.category} ${addition.tags.join(" ")}`.toLowerCase().includes(query);
    });
  }, [additionSearch, additions, selectedSlot]);
  const selectedAddition = additions.find((addition) => addition.id === selectedAdditionId) || null;

  const runExpansionAction = async (expansionId: string, action: "fund" | "complete") => {
    if (!onExpansionAction || busyExpansionId) return;
    setActionError("");
    setBusyExpansionId(expansionId);
    try {
      await onExpansionAction(expansionId, action);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Expansion update failed.");
    } finally {
      setBusyExpansionId(null);
    }
  };

  const visibleShapes = useMemo(() => {
    const layerIndex = new Map(surface.layers.map((layer, index) => [layer.id, index]));
    const visibleLayers = new Set(surface.layers.filter((layer) => layer.visible).map((layer) => layer.id));
    return surface.shapes
      .filter((shape) => shape.visible && visibleLayers.has(shape.layerId))
      .slice()
      .sort((a, b) => (layerIndex.get(a.layerId) || 0) - (layerIndex.get(b.layerId) || 0));
  }, [surface.layers, surface.shapes]);

  const drawingTool = tool === "wall" || tool === "pathway" || tool === "area";
  const pendingShape = drawingTool && pendingPoints.length > 0 ? shapeDefaults(tool, pendingPoints, surface.shapes.length) : null;
  const mapBackground = surface.background;
  const canvasCursor = tool === "hand" ? "grab" : drawingTool || tool === "label" ? "crosshair" : "default";

  return (
    <div className="space-y-3 outline-none" tabIndex={0} onKeyDown={handleKeyDown} data-business-map-key={mapKey}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A1A2B] pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-bold" style={S_TEXT}>
            {activeSector && (
              <button type="button" onClick={() => { setActiveSectorId(null); setSelectedSlotId(null); setSelectedShapeIds([]); setSelectedExpansionId(null); }} className="p-0.5" title="Back to business map" style={S_MUTED}>
                <ArrowLeft size={12} />
              </button>
            )}
            <MapIcon size={14} style={{ color: activeSector?.color || "#79B8FF" }} />
            <span className="truncate">{activeSector ? activeSector.name : value.name}</span>
          </div>
          <div className="mt-0.5 text-[8px]" style={S_DIM}>
            {activeSector ? activeSector.description || "Sector interior" : `${summarySectors.length} active ${themedSectors.length > 0 ? "zones" : "sectors"} | ${occupiedCount}/${slotCount} slots filled`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center border border-[#25253B] bg-[#08080D]">
            <IconButton compact label="Zoom out" onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.15).toFixed(2))))} disabled={zoom <= 0.6}><ZoomOut size={10} /></IconButton>
            <span className="w-10 text-center text-[8px]" style={S_DIM}>{Math.round(zoom * 100)}%</span>
            <IconButton compact label="Zoom in" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))))} disabled={zoom >= 2.5}><ZoomIn size={10} /></IconButton>
            <IconButton compact label="Reset zoom" onClick={() => { setZoom(activeSectorId ? 1 : overviewZoom(valueRef.current)); window.requestAnimationFrame(() => { if (viewportRef.current) { viewportRef.current.scrollLeft = Math.max(0, (viewportRef.current.scrollWidth - viewportRef.current.clientWidth) / 2); viewportRef.current.scrollTop = viewportRef.current.scrollHeight; } }); }}><Maximize2 size={10} /></IconButton>
          </div>
          {isDM && (
            <>
              {onSave && <button type="button" onClick={() => void onSave()} disabled={saveState === "saving"} className={`${retro.button} flex items-center gap-1.5 px-2 py-1.5 text-[9px] disabled:opacity-45`} style={S_TEXT}><Save size={11} /> Save Map</button>}
              <button type="button" onClick={() => { setEditMode((current) => !current); setTool("select"); setPendingPoints([]); }} className={`${editMode ? retro.sunken : retro.raised} flex items-center gap-1.5 px-2 py-1.5 text-[9px]`} style={{ color: editMode ? "#FFD56A" : "#9AA8C7", background: editMode ? "#2B210E" : "#0B0B14" }}>
                {editMode ? <Check size={11} /> : <Pencil size={11} />} {editMode ? "Finish Editing" : "Edit Layout"}
              </button>
              <button type="button" onClick={() => activeSector ? addSlot(activeSector) : addSector()} className={`${retro.button} flex items-center gap-1.5 px-2 py-1.5 text-[9px]`} style={S_GREEN}>
                <Plus size={11} /> {activeSector ? "Add Slot" : "Add Sector"}
              </button>
            </>
          )}
          {saveState !== "idle" && <span className="flex items-center gap-1 px-1 text-[8px]" style={saveState === "error" ? S_RED : saveState === "saved" ? S_GREEN : S_DIM}>{saveState === "saving" && <LoaderCircle size={9} className="animate-spin" />}{saveState === "saved" && <Check size={9} />}{saveState === "saving" ? "Saving..." : saveState === "saved" ? "Save successful." : "Save failed."}</span>}
        </div>
      </header>

      {isDM && editMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-[#1A1A2B] bg-[#050508] p-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {TOOL_META.map(({ id, label, icon: Icon }) => (
              <IconButton compact key={id} label={label} active={tool === id} onClick={() => { setTool(id); setPendingPoints([]); }}><Icon size={11} /></IconButton>
            ))}
            {drawingTool && pendingPoints.length > 0 && (
              <>
                <button type="button" onClick={finishDrawing} className={`${retro.button} flex items-center gap-1 px-2 py-1.5 text-[9px]`} style={S_GREEN}><Check size={10} /> Finish</button>
                <IconButton compact label="Cancel drawing" onClick={cancelDrawing}><X size={10} /></IconButton>
                <span className="px-1 text-[8px]" style={S_DIM}>{pendingPoints.length} points</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <IconButton compact label="Undo" onClick={undo} disabled={history.past.length === 0}><Undo2 size={11} /></IconButton>
            <IconButton compact label="Redo" onClick={redo} disabled={history.future.length === 0}><Redo2 size={11} /></IconButton>
            <IconButton compact label="Map settings" active={inspectorMode === "settings"} onClick={() => { setInspectorMode("settings"); setSelectedShapeIds([]); setSelectedSlotId(null); setSelectedSectorId(null); setSelectedExpansionId(null); }}><Settings2 size={11} /></IconButton>
          </div>
        </div>
      )}

      {(actionError || assetError) && (
        <div className="flex items-start justify-between gap-3 border border-[#6A3A3A] bg-[#190909] p-3 text-[9px]" style={S_RED}>
          <span className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{actionError || assetError}</span>
          <button type="button" onClick={() => { setActionError(""); setAssetError(""); }} title="Dismiss"><X size={11} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="relative min-w-0">
          <div
            ref={viewportRef}
            className="min-w-0 max-h-[680px] min-h-[380px] overflow-x-hidden overflow-y-auto border"
            style={{ borderColor: SURFACE_BORDER, background: "#020204", cursor: canvasCursor }}
            onPointerDown={startPan}
          >
            <div
              ref={canvasRef}
              role="application"
              aria-label={activeSector ? `${activeSector.name} facility editor` : "General business map editor"}
              className="relative touch-none overflow-hidden"
              onClick={handleCanvasClick}
              style={{
                width: `${zoom * 100}%`,
                minWidth: `${Math.round(560 * zoom)}px`,
                aspectRatio: `${value.grid.width} / ${value.grid.height}`,
                backgroundColor: mapBackground.color,
                backgroundImage: value.grid.showGrid
                  ? "linear-gradient(#151522 1px, transparent 1px), linear-gradient(90deg, #151522 1px, transparent 1px)"
                  : "none",
                backgroundSize: `${100 / value.grid.width}% ${100 / value.grid.height}%`,
              }}
            >
            {mapBackground.mode === "image" && mapBackground.imageUrl && !brokenBackground && (
              <img
                src={mapBackground.imageUrl}
                alt=""
                draggable={false}
                onError={() => setBrokenBackground(true)}
                className="pointer-events-none absolute inset-0 h-full w-full"
                style={{
                  opacity: mapBackground.opacity,
                  objectFit: mapBackground.fit === "stretch" ? "fill" : mapBackground.fit,
                }}
              />
            )}
            {brokenBackground && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="text-center"><ImageOff size={24} className="mx-auto mb-2" style={S_RED} /><div className="text-[10px]" style={S_RED}>Background image unavailable</div></div>
              </div>
            )}

            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${value.grid.width} ${value.grid.height}`} preserveAspectRatio="none" aria-hidden="true" style={{ pointerEvents: "none" }}>
              {visibleShapes.map((shape) => {
                const selected = selectedShapeIds.includes(shape.id);
                const layer = surface.layers.find((entry) => entry.id === shape.layerId);
                const interactive = isDM && editMode && tool === "select" && !layer?.locked;
                if (shape.kind === "area") {
                  return (
                    <g key={shape.id} style={{ pointerEvents: interactive ? "all" : "none" }} onClick={(event) => { event.stopPropagation(); setInspectorMode("selection"); setSelectedShapeIds((current) => event.shiftKey ? current.includes(shape.id) ? current.filter((id) => id !== shape.id) : [...current, shape.id] : [shape.id]); }}>
                      <polygon points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")} fill={shape.fillColor} fillOpacity={shape.opacity} stroke={selected ? "#FFFFFF" : shape.color} strokeWidth={selected ? shape.strokeWidth + 0.08 : shape.strokeWidth} vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                }
                if (shape.kind === "label") {
                  const point = shape.points[0];
                  return (
                    <text key={shape.id} x={point.x} y={point.y} fill={selected ? "#FFFFFF" : shape.color} opacity={shape.opacity} fontSize="0.55" fontWeight="700" style={{ pointerEvents: interactive ? "all" : "none", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); setInspectorMode("selection"); setSelectedShapeIds(event.shiftKey ? [...new Set([...selectedShapeIds, shape.id])] : [shape.id]); }}>{shape.label || shape.name}</text>
                  );
                }
                if (shape.kind === "pathway") {
                  const parkWalkway = value.name === "Mystic Lands Park";
                  const walkwayWidth = parkWalkway
                    ? Math.max(10.4, shape.strokeWidth * 5.6)
                    : Math.max(2.25, shape.strokeWidth * 1.8);
                  const path = shapePath(shape);
                  const lightPoints = parkWalkway && shape.name === "Guest Walkway"
                    ? shape.points.filter((_, index) => shape.id === "park-ring" ? index % 2 === 0 && index < shape.points.length - 1 : true)
                    : [];
                  return (
                    <g key={shape.id} style={{ pointerEvents: interactive ? "all" : "none", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); setInspectorMode("selection"); setSelectedShapeIds(event.shiftKey ? selectedShapeIds.includes(shape.id) ? selectedShapeIds.filter((id) => id !== shape.id) : [...selectedShapeIds, shape.id] : [shape.id]); }}>
                      <path d={path} fill="none" stroke={selected ? "#FFFFFF" : parkWalkway ? "#26382F" : "#55614F"} strokeOpacity={shape.opacity} strokeWidth={walkwayWidth + (parkWalkway ? 7.6 : 1.4)} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      {parkWalkway && (
                        <>
                          <path d={path} fill="none" stroke={selected ? "#FFFFFF" : "#DED4BA"} strokeOpacity={shape.opacity} strokeWidth={walkwayWidth + 4.8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                          <path d={path} fill="none" stroke={selected ? "#FFFFFF" : "#A99D80"} strokeOpacity={shape.opacity * 0.72} strokeWidth={walkwayWidth + 4.8} strokeDasharray="0.1 0.12" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        </>
                      )}
                      <path d={path} fill="none" stroke={selected ? "#EEE7D5" : shape.color} strokeOpacity={shape.opacity} strokeWidth={walkwayWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      {parkWalkway && (
                        <path d={path} fill="none" stroke={selected ? "#FFFFFF" : "#8F846C"} strokeOpacity={shape.opacity * 0.58} strokeWidth="0.68" strokeDasharray="0.12 0.18" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      )}
                      {lightPoints.map((point, index) => (
                        <g key={`${shape.id}-path-light-${index}`}>
                          <circle cx={point.x} cy={point.y} r="0.23" fill="#FFE5A1" opacity="0.14" />
                          <circle cx={point.x} cy={point.y} r="0.17" fill="#25352D" stroke="#C9B991" strokeWidth="0.05" vectorEffect="non-scaling-stroke" />
                          <circle cx={point.x} cy={point.y} r="0.07" fill="#FFE5A1" opacity="0.94" />
                        </g>
                      ))}
                    </g>
                  );
                }
                return (
                  <path key={shape.id} d={shapePath(shape)} fill="none" stroke={selected ? "#FFFFFF" : shape.color} strokeOpacity={shape.opacity} strokeWidth={selected ? shape.strokeWidth + 0.08 : shape.strokeWidth} strokeLinecap="square" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); setInspectorMode("selection"); setSelectedShapeIds(event.shiftKey ? selectedShapeIds.includes(shape.id) ? selectedShapeIds.filter((id) => id !== shape.id) : [...selectedShapeIds, shape.id] : [shape.id]); }} />
                );
              })}
              {pendingShape && (
                pendingShape.kind === "area"
                  ? <polygon points={pendingPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="#79B8FF" fillOpacity="0.18" stroke="#FFFFFF" strokeDasharray="0.2 0.15" strokeWidth="0.08" />
                  : <path d={shapePath(pendingShape)} fill="none" stroke="#FFFFFF" strokeDasharray="0.2 0.15" strokeWidth="0.1" />
              )}
              {pendingPoints.map((point, index) => <circle key={`pending-${index}`} cx={point.x} cy={point.y} r="0.13" fill="#FFFFFF" />)}
              {isDM && editMode && tool === "select" && selectedShapes.map((shape) => {
                const layer = surface.layers.find((entry) => entry.id === shape.layerId);
                if (shape.locked || layer?.locked) return null;
                return shape.points.map((point, index) => (
                  <circle key={`${shape.id}-${index}`} cx={point.x} cy={point.y} r="0.16" fill="#FFD56A" stroke="#050508" strokeWidth="0.05" style={{ pointerEvents: "all", cursor: "move" }} onPointerDown={(event) => startPointOperation(event, shape, index)} />
                ));
              })}
            </svg>

            {!activeSector && value.expansions.filter((expansion) => expansion.status !== "complete").map((expansion) => {
              const funded = expansion.status === "funded";
              const canAfford = personalFundBalance >= expansion.cost;
              const selected = selectedExpansionId === expansion.id;
              return (
                <div key={expansion.id} onPointerDown={(event) => { if ((event.target as HTMLElement).closest("button")) return; startRectOperation(event, "expansion", "move", expansion.id, expansion); }} onClick={(event) => { event.stopPropagation(); if (draggedRef.current) { draggedRef.current = false; return; } if (isDM && editMode) { setSelectedExpansionId(expansion.id); setSelectedSectorId(null); setSelectedShapeIds([]); setInspectorMode("selection"); } }} className="absolute z-10 flex flex-col justify-between overflow-hidden border border-dashed p-2 text-left" style={{ ...rectStyle(expansion, value.grid), borderColor: selected ? "#FFFFFF" : funded ? "#FFD56A" : "#8B7BE8", background: funded ? "#3A2B0CBB" : "#17102DBB", color: "#E5ECFF", boxShadow: selected ? "inset 0 0 0 1px #8B7BE8, 0 0 10px #8B7BE866" : "none", cursor: isDM && editMode && tool === "select" ? "move" : "default" }}>
                  <div><div className="flex items-center gap-1 text-[9px] font-bold"><Hammer size={10} />{expansion.name}</div><div className="mt-1 text-[7px]" style={S_DIM}>{funded ? "EXPANSION UNDERWAY" : `${expansion.cost.toLocaleString()} ${expansion.currency}`}</div></div>
                  {funded && isDM && onExpansionAction ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void runExpansionAction(expansion.id, "complete"); }} disabled={busyExpansionId === expansion.id} className={`${retro.button} mt-2 px-2 py-1 text-[8px] disabled:opacity-40`} style={S_GREEN}>{busyExpansionId === expansion.id ? "Completing..." : "Complete Expansion"}</button> : !funded && canFundExpansions && onExpansionAction ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void runExpansionAction(expansion.id, "fund"); }} disabled={!canAfford || busyExpansionId === expansion.id} className={`${retro.button} mt-2 px-2 py-1 text-[8px] disabled:opacity-35`} style={S_GREEN}>{canAfford ? "Fund Expansion" : "Insufficient Personal Funds"}</button> : <div className="mt-2 text-[7px]" style={S_DIM}>{funded ? "Awaiting DM completion" : "Development plot locked"}</div>}
                  {isDM && editMode && tool === "select" && <ResizeHandle onPointerDown={(event) => startRectOperation(event, "expansion", "resize", expansion.id, expansion)} />}
                </div>
              );
            })}

            {!activeSector && value.sectors.filter((sector) => (isDM && editMode) || isBusinessSectorUnlocked(value, sector)).map((sector) => {
              const selected = selectedSectorId === sector.id;
              const filled = sector.slots.filter((slot) => slot.filled).length;
              const locked = !isBusinessSectorUnlocked(value, sector);
              const ellipse = sector.visualShape === "ellipse";
              const shaped = ellipse || sector.visualShape === "organic";
              const compact = sector.width <= 2 || sector.height <= 1;
              const centerLabel = ellipse || sector.decorationTheme === "stormlands";
              return (
                <button
                  type="button"
                  key={sector.id}
                  onPointerDown={(event) => startRectOperation(event, "sector", "move", sector.id, sector)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (draggedRef.current) { draggedRef.current = false; return; }
                    setSelectedSectorId(sector.id);
                    setSelectedExpansionId(null);
                    setSelectedShapeIds([]);
                    setSelectedSlotId(null);
                    setInspectorMode("selection");
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(sector, value.grid), ...sectorShapeStyle(sector), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : sector.color, background: locked ? "#101018CC" : `${sector.color}38`, opacity: locked ? 0.55 : 1, boxShadow: selected ? `inset 0 0 0 1px ${sector.color}, 0 0 10px ${sector.color}55` : "none", cursor: locked && !editMode ? "not-allowed" : editMode && tool === "select" ? "move" : "pointer" }}
                >
                  <MysticParkZoneDecoration theme={sector.decorationTheme} subdued={editMode || locked} />
                  <div className={`relative z-10 flex h-full min-h-0 flex-col ${shaped ? "items-center text-center" : ""} ${centerLabel || compact ? "justify-center" : ""}`}>
                    <div
                      className={shaped
                        ? `${compact ? "text-[7px]" : "text-[9px]"} w-[86%] whitespace-normal break-words text-center font-bold leading-tight`
                        : "truncate text-[10px] font-bold"}
                      title={sector.name}
                      style={sector.decorationTheme ? { background: "#020509C7", border: "1px solid #FFFFFF1A", padding: "2px 4px", textShadow: "0 1px 3px #000000" } : undefined}
                    >
                      {sector.name}
                    </div>
                    {!compact && <div className="mt-1 truncate text-[8px]" style={{ color: sector.color, textShadow: "0 1px 2px #000000" }}>{sector.width}x{sector.height}</div>}
                    {!compact && <div className={centerLabel ? "mt-1 text-[8px]" : "mt-auto text-[8px]"} style={{ ...S_DIM, textShadow: "0 1px 2px #000000" }}>{locked ? "LOCKED BY EXPANSION" : `${filled}/${sector.slots.length} slots`}</div>}
                  </div>
                  {editMode && tool === "select" && <ResizeHandle onPointerDown={(event) => startRectOperation(event, "sector", "resize", sector.id, sector)} />}
                </button>
              );
            })}

            {activeSector && slotLayer?.visible !== false && activeSector.slots.map((slot) => {
              const selected = selectedSlotId === slot.id;
              const color = facilitySlotRoleColor(slot.role);
              const installed = additions.find((addition) => addition.id === slot.installedAdditionId);
              const canDrop = slot.tier === "minor" && canInstallAdditions && (!slot.filled || Boolean(slot.installedAdditionId));
              return (
                <button
                  type="button"
                  key={slot.id}
                  onPointerDown={(event) => startRectOperation(event, "slot", "move", slot.id, slot, activeSector.id)}
                  onClick={(event) => { event.stopPropagation(); if (draggedRef.current) { draggedRef.current = false; return; } setSelectedSlotId(slot.id); setSelectedShapeIds([]); setSelectedExpansionId(null); setInspectorMode("selection"); }}
                  onDragOver={(event) => { if (canDrop) event.preventDefault(); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const additionId = event.dataTransfer.getData("application/x-facility-addition");
                    const addition = additions.find((entry) => entry.id === additionId);
                    if (addition) void handleInstall(activeSector, slot, addition);
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(slot, value.grid), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : color, background: slot.filled ? `${color}55` : `${color}1E`, boxShadow: selected ? `inset 0 0 0 1px ${color}, 0 0 10px ${color}55` : "none", cursor: editMode && tool === "select" && !slotLayer.locked ? "move" : "pointer" }}
                >
                   {installed?.thumbnailUrl && <img src={installed.thumbnailUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />}
                   {!slot.filled && <EmptySlotIcon className="absolute right-2 top-2" />}
                   <div className="relative flex h-full min-h-0 flex-col">
                     <div className="truncate pr-8 text-[9px] font-bold">{slot.name}</div>
                     <div className="mt-1 flex items-center gap-1 truncate text-[7px]" style={{ color }}>{slot.tier === "major" && <Lock size={7} />}{slot.role.toUpperCase()}</div>
                    <div className="mt-auto truncate text-[8px]" style={slot.filled ? S_TEXT : S_DIM}>{busySlotId === slot.id ? "UPDATING..." : slot.filled ? slot.occupant || "FILLED" : "EMPTY"}</div>
                  </div>
                  {editMode && tool === "select" && !slotLayer.locked && <ResizeHandle onPointerDown={(event) => startRectOperation(event, "slot", "resize", slot.id, slot, activeSector.id)} />}
                </button>
              );
            })}

            {activeSector && activeSector.slots.length === 0 && surface.shapes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px]" style={S_DIM}>Empty floor layout</div>
            )}
            </div>
          </div>
          <button
            type="button"
            onClick={recenterViewport}
            className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center border shadow-md transition-colors hover:bg-[#151B28]"
            style={{ borderColor: CONTROL_BORDER, color: "#C8D4EA", background: "#08080DEE" }}
            title="Recenter map"
            aria-label="Recenter map"
          >
            <LocateFixed size={13} />
          </button>
        </div>

        <aside className="min-h-[380px] max-h-[680px] overflow-y-auto border border-[#1A1A2B] bg-[#050508]">
          {operationsPanel && (
            <div className="sticky top-0 z-20 grid grid-cols-2 border-b border-[#1A1A2B] bg-[#050508] p-1" role="tablist" aria-label="Facility map side panel">
              <button type="button" role="tab" aria-selected={rightPanelTab === "inspect"} onClick={() => setRightPanelTab("inspect")} className="flex items-center justify-center gap-1.5 border px-2 py-2 text-[9px] font-semibold" style={{ color: rightPanelTab === "inspect" ? "#E5ECFF" : "#65708A", borderColor: rightPanelTab === "inspect" ? "#394866" : "transparent", background: rightPanelTab === "inspect" ? "#101723" : "transparent" }}><Eye size={11} />Inspect</button>
              <button type="button" role="tab" aria-selected={rightPanelTab === "operations"} onClick={() => setRightPanelTab("operations")} className="flex items-center justify-center gap-1.5 border px-2 py-2 text-[9px] font-semibold" style={{ color: rightPanelTab === "operations" ? "#E5ECFF" : "#65708A", borderColor: rightPanelTab === "operations" ? "#394866" : "transparent", background: rightPanelTab === "operations" ? "#101723" : "transparent" }}><Building2 size={11} />Operations</button>
            </div>
          )}
          <div className="p-3">
          {rightPanelTab === "operations" && operationsPanel ? operationsPanel : inspectorMode === "settings" ? (
            <MapSettingsInspector
              map={value}
              surfaceName={activeSector?.name || value.name}
              background={surface.background}
              layers={surface.layers}
              players={players}
              isDM={isDM}
              uploadProgress={assetProgress}
              brokenBackground={brokenBackground}
              onMapName={(name) => emit({ ...valueRef.current, name })}
              onGrid={(grid) => emit(resizeOfficeBusinessMapGrid(valueRef.current, grid))}
              onBackground={(background) => updateCurrentSurface({ background })}
              onUpload={uploadBackground}
              onClearBackground={clearBackgroundImage}
              onLayers={updateLayers}
              onPermissions={(permissions) => emit({ ...valueRef.current, permissions: { ...valueRef.current.permissions, ...permissions } })}
            />
          ) : selectedShape ? (
            <ShapeInspector
              shape={selectedShape}
              selectedCount={selectedShapeIds.length}
              isDM={isDM}
              editMode={editMode}
              onUpdate={(updates) => updateShape(selectedShape.id, updates)}
              onDuplicate={duplicateSelectedShapes}
              onDelete={deleteSelectedShapes}
              onAlign={alignSelectedShapes}
            />
          ) : selectedSlot && selectedSlotSector ? (
            <SlotInspector
              slot={selectedSlot}
              additions={additions}
              additionUsage={additionUsage}
              facilities={facilities}
              grid={value.grid}
              isDM={isDM}
              editMode={editMode}
               canInstall={canInstallAdditions && selectedSlot.tier === "minor"}
               canRemove={canRemoveAdditions && selectedSlot.tier === "minor"}
              busy={busySlotId === selectedSlot.id}
              backLabel={!activeSector ? selectedSlotSector.name : undefined}
              onBack={!activeSector ? () => setSelectedSlotId(null) : undefined}
              onUpdate={(updates) => updateSlot(selectedSlotSector.id, selectedSlot.id, updates)}
               onInstall={(addition) => void handleInstall(selectedSlotSector, selectedSlot, addition)}
               onRemove={() => void handleRemove(selectedSlotSector, selectedSlot)}
               onCreateAddition={isDM && selectedSlot.tier === "minor" ? addAddition : undefined}
               onDelete={() => deleteSlot(selectedSlotSector.id, selectedSlot.id)}
            />
          ) : !activeSector && selectedExpansion ? (
            <ExpansionInspector
              expansion={selectedExpansion}
              isDM={isDM}
              editMode={editMode}
              grid={value.grid}
              onUpdate={(updates) => updateExpansion(selectedExpansion.id, updates)}
            />
          ) : !activeSector && selectedSector ? (
            <SectorInspector
              sector={selectedSector}
              isDM={isDM}
              editMode={editMode}
              grid={value.grid}
              additions={additions}
              onUpdate={(updates) => updateSector(selectedSector.id, updates)}
              onSelectSlot={(slotId) => { setSelectedSlotId(slotId); setSelectedShapeIds([]); setSelectedExpansionId(null); setInspectorMode("selection"); }}
              onEditLayout={isDM && editMode ? () => { setActiveSectorId(selectedSector.id); setSelectedSlotId(null); setSelectedShapeIds([]); setInspectorMode("selection"); } : undefined}
              onDelete={() => deleteSector(selectedSector.id)}
            />
          ) : (
            <EmptyInspector icon={activeSector ? Grid3X3 : Building2} text={isDM && editMode ? "Select an element, or open map settings." : "Select a map element to inspect it."} />
          )}
          </div>
        </aside>
      </div>

      {selectedSlot && selectedSlot.tier === "minor" && <div ref={additionLibraryRef}><FacilityAdditionLibrary
        additions={filteredAdditions}
        allAdditions={additions}
        selected={selectedAddition}
        usage={additionUsage}
        isDM={isDM}
        canDrag={canInstallAdditions}
        query={additionSearch}
        uploadProgress={assetProgress}
        onQuery={setAdditionSearch}
        onSelect={setSelectedAdditionId}
        onAdd={addAddition}
        onUpdate={updateAddition}
        onDelete={deleteAddition}
        onUploadThumbnail={uploadAdditionThumbnail}
      /></div>}
    </div>
  );
}

function IconButton({ label, onClick, children, active = false, disabled = false, compact = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`flex ${compact ? "h-7 w-7" : "h-8 w-8"} items-center justify-center border transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-25`} style={{ borderColor: active ? "#FFD56A" : CONTROL_BORDER, color: active ? "#FFD56A" : "#9AA8C7", background: active ? "#2B210E" : CONTROL_BG }}>
      {children}
    </button>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (event: React.PointerEvent) => void }) {
  return <span onPointerDown={onPointerDown} className="absolute bottom-0 right-0 flex h-5 w-5 cursor-se-resize items-center justify-center bg-black/70" title="Resize"><Maximize2 size={9} /></span>;
}

function MapSettingsInspector({
  map,
  surfaceName,
  background,
  layers,
  players,
  isDM,
  uploadProgress,
  brokenBackground,
  onMapName,
  onGrid,
  onBackground,
  onUpload,
  onClearBackground,
  onLayers,
  onPermissions,
}: {
  map: OfficeBusinessMapState;
  surfaceName: string;
  background: BusinessMapBackground;
  layers: BusinessMapLayer[];
  players: BusinessMapPlayerOption[];
  isDM: boolean;
  uploadProgress: number | null;
  brokenBackground: boolean;
  onMapName: (name: string) => void;
  onGrid: (grid: Partial<OfficeBusinessMapState["grid"]>) => void;
  onBackground: (background: BusinessMapBackground) => void;
  onUpload: (file: File) => void;
  onClearBackground: () => void;
  onLayers: (layers: BusinessMapLayer[]) => void;
  onPermissions: (permissions: Partial<OfficeBusinessMapState["permissions"]>) => void;
}) {
  const moveLayer = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= layers.length) return;
    const next = [...layers];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onLayers(next);
  };
  return (
    <div className="space-y-4">
      <PanelTitle icon={Settings2} text="Map Settings" />
      {isDM ? (
        <>
          <Field label="Map Name"><input value={map.name} onChange={(event) => onMapName(event.target.value.slice(0, 100))} className="w-full border bg-transparent px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <div className="border border-[#1A1A2B] p-3">
            <div className="mb-2 text-[9px] font-semibold" style={S_TEXT}>CANVAS</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Width"><input type="number" min={MIN_BUSINESS_MAP_GRID_WIDTH} max={MAX_BUSINESS_MAP_GRID_WIDTH} value={map.grid.width} onChange={(event) => onGrid({ width: Number(event.target.value) })} className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
              <Field label="Height"><input type="number" min={MIN_BUSINESS_MAP_GRID_HEIGHT} max={MAX_BUSINESS_MAP_GRID_HEIGHT} value={map.grid.height} onChange={(event) => onGrid({ height: Number(event.target.value) })} className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
            </div>
            <Toggle label="Show grid" checked={map.grid.showGrid} onChange={(checked) => onGrid({ showGrid: checked })} />
            <Toggle label="Snap to grid" checked={map.grid.snapToGrid} onChange={(checked) => onGrid({ snapToGrid: checked })} />
          </div>

          <div className="border border-[#1A1A2B] p-3">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold" style={S_TEXT}><ImagePlus size={11} /> {surfaceName} Background</div>
            <Field label="Solid Color"><input type="color" value={background.color} onChange={(event) => onBackground({ ...background, color: event.target.value })} className="h-8 w-full border bg-transparent p-1" style={{ borderColor: CONTROL_BORDER }} /></Field>
            <Field label="Image URL"><input value={background.imageUrl} onChange={(event) => onBackground({ ...background, mode: event.target.value.trim() ? "image" : "solid", imageUrl: event.target.value.slice(0, 3000) })} placeholder="https://..." className="w-full border bg-transparent px-2 py-2 text-[9px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
            <div className="mt-2 flex gap-2">
              <label className={`${retro.button} flex cursor-pointer items-center gap-1 px-2 py-2 text-[9px]`} style={S_TEXT}><Upload size={10} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label>
              {background.imageUrl && <button type="button" onClick={onClearBackground} className={`${retro.button} flex items-center gap-1 px-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={10} /> Clear</button>}
            </div>
            <div className="mt-2 text-[8px]" style={S_DIM}>PNG, JPEG, WebP, or GIF. Maximum 10 MB.</div>
            {uploadProgress != null && <ProgressBar value={uploadProgress} />}
            {brokenBackground && <div className="mt-2 flex items-center gap-2 text-[8px]" style={S_RED}><ImageOff size={10} /> Stored background cannot be loaded.</div>}
            {background.mode === "image" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="Fit"><select value={background.fit} onChange={(event) => onBackground({ ...background, fit: event.target.value as BusinessMapBackground["fit"] })} className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}><option value="cover">Cover</option><option value="contain">Contain</option><option value="stretch">Stretch</option></select></Field>
                <Field label="Opacity"><input type="range" min="0.1" max="1" step="0.05" value={background.opacity} onChange={(event) => onBackground({ ...background, opacity: Number(event.target.value) })} className="w-full" /></Field>
              </div>
            )}
          </div>

          <div className="border border-[#1A1A2B] p-3">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold" style={S_TEXT}><Layers3 size={11} /> LAYERS</div>
            <div className="space-y-1">
              {layers.map((layer, index) => (
                <div key={layer.id} className="flex items-center gap-1 border border-[#171724] bg-[#08080D] p-1.5">
                  <button type="button" onClick={() => onLayers(layers.map((entry) => entry.id === layer.id ? { ...entry, visible: !entry.visible } : entry))} title={layer.visible ? "Hide layer" : "Show layer"}>{layer.visible ? <Eye size={10} /> : <EyeOff size={10} />}</button>
                  <button type="button" onClick={() => onLayers(layers.map((entry) => entry.id === layer.id ? { ...entry, locked: !entry.locked } : entry))} title={layer.locked ? "Unlock layer" : "Lock layer"}>{layer.locked ? <Lock size={10} /> : <Unlock size={10} />}</button>
                  <span className="flex-1 text-[9px]" style={S_TEXT}>{layer.name}</span>
                  <button type="button" onClick={() => moveLayer(index, -1)} disabled={index === 0} title="Move layer up" className="disabled:opacity-25"><ArrowUp size={10} /></button>
                  <button type="button" onClick={() => moveLayer(index, 1)} disabled={index === layers.length - 1} title="Move layer down" className="disabled:opacity-25"><ArrowDown size={10} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#1A1A2B] p-3">
            <div className="mb-2 text-[9px] font-semibold" style={S_TEXT}>PLAYER ACCESS</div>
            <Toggle label="Players can install additions" checked={map.permissions.playerCanInstall} onChange={(checked) => onPermissions({ playerCanInstall: checked })} />
            <Toggle label="Players can remove additions" checked={map.permissions.playerCanRemove} onChange={(checked) => onPermissions({ playerCanRemove: checked })} />
            <div className="mt-2 text-[8px]" style={S_DIM}>Allowed profiles</div>
            <div className="mt-1 max-h-36 space-y-1 overflow-y-auto">
              {players.filter((player) => player.id !== "dm").map((player) => {
                const restricted = map.permissions.allowedPlayerIds.length > 0;
                const checked = restricted && map.permissions.allowedPlayerIds.includes(player.id);
                return <label key={player.id} className="flex items-center gap-2 border border-[#171724] p-2 text-[9px]" style={S_TEXT}><input type="checkbox" checked={checked} onChange={(event) => { const current = map.permissions.allowedPlayerIds; onPermissions({ allowedPlayerIds: event.target.checked ? [...new Set([...current, player.id])] : current.filter((id) => id !== player.id) }); }} />{player.name}<span className="ml-auto text-[7px]" style={S_DIM}>{player.id}</span></label>;
              })}
              {players.filter((player) => player.id !== "dm").length === 0 && <div className="text-[8px]" style={S_DIM}>No player profiles loaded.</div>}
            </div>
            {map.permissions.allowedPlayerIds.length > 0 && <button type="button" onClick={() => onPermissions({ allowedPlayerIds: [] })} className="mt-2 text-[8px] underline" style={S_MUTED}>Allow all profiles</button>}
          </div>
        </>
      ) : (
        <div className="text-[10px] leading-5" style={S_MUTED}>Map settings are managed by the DM.</div>
      )}
    </div>
  );
}

function SectorInspector({ sector, isDM, editMode, grid, additions, onUpdate, onSelectSlot, onEditLayout, onDelete }: {
  sector: OfficeBusinessSector;
  isDM: boolean;
  editMode: boolean;
  grid: OfficeBusinessMapState["grid"];
  additions: FacilityAddition[];
  onUpdate: (updates: Partial<OfficeBusinessSector>) => void;
  onSelectSlot: (slotId: string) => void;
  onEditLayout?: () => void;
  onDelete: () => void;
}) {
  const filledSlots = sector.slots.filter((slot) => slot.filled).length;
  return (
    <div className="space-y-3">
      <PanelTitle icon={Building2} text={sector.name} color={sector.color} />
      <div className="flex items-center justify-between border border-[#1A1A2B] px-2 py-1.5 text-[8px]"><span style={S_DIM}>AREA TYPE</span><span style={{ color: sector.color }}>{sector.zoneType || "General"}</span></div>
      {isDM && editMode ? (
        <>
          <Field label="Sector Name"><input value={sector.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 60) })} className="w-full border bg-transparent px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Description"><textarea value={sector.description} onChange={(event) => onUpdate({ description: event.target.value.slice(0, 600) })} rows={4} className="w-full resize-none border bg-transparent px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Sector Color"><input type="color" value={sector.color} onChange={(event) => onUpdate({ color: event.target.value })} className="h-9 w-full border bg-transparent p-1" style={{ borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Area Shape"><select value={sector.visualShape || "rectangle"} onChange={(event) => onUpdate({ visualShape: event.target.value as OfficeBusinessSector["visualShape"] })} className="w-full border bg-[#08080D] px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="organic">Organic</option></select></Field>
          <RectInputs rect={sector} grid={grid} onUpdate={onUpdate} />
        </>
      ) : <div className="text-[10px] leading-5" style={S_MUTED}>{sector.description || "No sector description."}</div>}
      <div className="grid grid-cols-2 gap-2 text-[9px]"><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{filledSlots}/{sector.slots.length} slots filled</div><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{sector.shapes.length} map elements</div></div>

      <div className="border-t border-[#1A1A2B] pt-3">
        <div className="mb-2 flex items-center justify-between text-[8px]"><span className="font-semibold" style={S_TEXT}>AREA CONTENTS & SLOTS</span><span style={S_DIM}>{sector.slots.length}</span></div>
        <div className="space-y-2">
          {sector.slots.map((slot) => {
            const color = facilitySlotRoleColor(slot.role);
            const installed = additions.find((addition) => addition.id === slot.installedAdditionId);
            const occupant = installed?.name || slot.occupant || (slot.filled ? "Filled" : "Empty");
            const accepted = slot.acceptedAdditionCategories.length > 0 ? slot.acceptedAdditionCategories.join(", ") : "Any addition category";
            const compatibleTags = slot.acceptedTags.length > 0 ? slot.acceptedTags.join(", ") : "Any compatible tags";
            return (
              <button key={slot.id} type="button" onClick={() => onSelectSlot(slot.id)} className="w-full border bg-[#08080D] p-2.5 text-left transition-colors hover:bg-[#101018]" style={{ borderColor: `${color}88` }}>
                <div className="flex items-start justify-between gap-2"><span className="text-[9px] font-semibold leading-4" style={S_TEXT}>{slot.name}</span><span className="flex flex-shrink-0 items-center gap-1 text-[7px]" style={{ color }}>{slot.tier === "major" && <Lock size={7} />}{slot.role.toUpperCase()}</span></div>
                <div className="mt-2 flex items-center gap-2 border-l-2 pl-2" style={{ borderColor: color }}>{!slot.filled && <EmptySlotIcon compact />}<div className="min-w-0"><div className="text-[7px]" style={S_DIM}>CONTAINS</div><div className="mt-0.5 truncate text-[9px]" style={slot.filled ? S_TEXT : S_MUTED}>{occupant}</div></div></div>
                <div className="mt-2 grid gap-1 text-[7px] leading-3"><div><span style={S_DIM}>ACCEPTS </span><span style={S_MUTED}>{accepted}</span></div><div><span style={S_DIM}>COMPATIBLE TAGS </span><span style={S_MUTED}>{compatibleTags}</span></div></div>
                {slot.notes && <div className="mt-2 line-clamp-2 text-[7px] leading-3" style={S_DIM}>{slot.notes}</div>}
              </button>
            );
          })}
          {sector.slots.length === 0 && <div className="border border-[#1A1A2B] p-3 text-center text-[8px]" style={S_DIM}>This area has no configured slots.</div>}
        </div>
      </div>

      {onEditLayout && <button type="button" onClick={onEditLayout} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[10px]`} style={S_TEXT}><Pencil size={12} /> Edit Interior Layout</button>}
      {isDM && editMode && <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Sector</button>}
    </div>
  );
}

function ExpansionInspector({ expansion, isDM, editMode, grid, onUpdate }: { expansion: OfficeBusinessExpansion; isDM: boolean; editMode: boolean; grid: OfficeBusinessMapState["grid"]; onUpdate: (updates: Partial<OfficeBusinessExpansion>) => void }) {
  return (
    <div className="space-y-3">
      <PanelTitle icon={Hammer} text={expansion.name} color="#8B7BE8" />
      <div className="flex items-center justify-between border border-[#1A1A2B] p-2 text-[8px]"><span style={S_DIM}>STATUS</span><span style={expansion.status === "funded" ? { color: "#FFD56A" } : expansion.status === "complete" ? S_GREEN : S_MUTED}>{expansion.status.toUpperCase()}</span></div>
      {isDM && editMode ? (
        <>
          <Field label="Expansion Name"><input value={expansion.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 80) })} className="w-full border bg-transparent px-2 py-1.5 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Description"><textarea value={expansion.description} onChange={(event) => onUpdate({ description: event.target.value.slice(0, 600) })} rows={3} className="w-full resize-none border bg-transparent px-2 py-1.5 text-[9px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <RectInputs rect={expansion} grid={grid} onUpdate={onUpdate} />
          <div className="text-[8px] leading-4" style={S_DIM}>Drag the plot or use width and height to resize the Northern Expansion Grounds.</div>
        </>
      ) : <div className="text-[9px] leading-5" style={S_MUTED}>{expansion.description}</div>}
    </div>
  );
}

function ShapeInspector({ shape, selectedCount, isDM, editMode, onUpdate, onDuplicate, onDelete, onAlign }: { shape: BusinessMapShape; selectedCount: number; isDM: boolean; editMode: boolean; onUpdate: (updates: Partial<BusinessMapShape>) => void; onDuplicate: () => void; onDelete: () => void; onAlign: (mode: "left" | "center" | "top") => void }) {
  return (
    <div className="space-y-3">
      <PanelTitle icon={shape.kind === "wall" ? Minus : shape.kind === "pathway" ? Route : shape.kind === "area" ? Pentagon : Type} text={selectedCount > 1 ? `${selectedCount} Elements` : shape.name} color={shape.color} />
      {isDM && editMode ? (
        <>
          <Field label="Name"><input value={shape.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 60) })} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          {shape.kind === "label" && <Field label="Label"><input value={shape.label} onChange={(event) => onUpdate({ label: event.target.value.slice(0, 100) })} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>}
          <div className="grid grid-cols-2 gap-2"><Field label="Stroke"><input type="color" value={shape.color} onChange={(event) => onUpdate({ color: event.target.value })} className="h-8 w-full border bg-transparent p-1" style={{ borderColor: CONTROL_BORDER }} /></Field>{shape.kind === "area" && <Field label="Fill"><input type="color" value={shape.fillColor} onChange={(event) => onUpdate({ fillColor: event.target.value })} className="h-8 w-full border bg-transparent p-1" style={{ borderColor: CONTROL_BORDER }} /></Field>}</div>
          {shape.kind !== "label" && <Field label="Line Width"><input type="range" min="0.08" max="1.5" step="0.02" value={shape.strokeWidth} onChange={(event) => onUpdate({ strokeWidth: Number(event.target.value) })} className="w-full" /></Field>}
          <Field label="Opacity"><input type="range" min="0.05" max="1" step="0.05" value={shape.opacity} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} className="w-full" /></Field>
          {(shape.kind === "pathway" || shape.kind === "wall") && <Toggle label="Curved line" checked={shape.curved} onChange={(checked) => onUpdate({ curved: checked })} />}
          <Toggle label="Locked" checked={shape.locked} onChange={(checked) => onUpdate({ locked: checked })} />
          <Toggle label="Visible" checked={shape.visible} onChange={(checked) => onUpdate({ visible: checked })} />
          <div className="flex flex-wrap gap-1 border-t border-[#1A1A2B] pt-3">
            <IconButton label="Align left" onClick={() => onAlign("left")}><AlignLeft size={11} /></IconButton>
            <IconButton label="Align center" onClick={() => onAlign("center")}><AlignCenter size={11} /></IconButton>
            <IconButton label="Align top" onClick={() => onAlign("top")}><AlignStartVertical size={11} /></IconButton>
            <IconButton label="Duplicate" onClick={onDuplicate}><Copy size={11} /></IconButton>
            <IconButton label="Delete" onClick={onDelete}><Trash2 size={11} /></IconButton>
          </div>
        </>
      ) : <div className="text-[10px] leading-5" style={S_MUTED}>{shape.kind} | {shape.points.length} points</div>}
    </div>
  );
}

function SlotInspector({ slot, additions, additionUsage, facilities, grid, isDM, editMode, canInstall, canRemove, busy, backLabel, onBack, onUpdate, onInstall, onRemove, onCreateAddition, onDelete }: { slot: OfficeBusinessSlot; additions: FacilityAddition[]; additionUsage: Record<string, number>; facilities: Array<{ id: string; name: string }>; grid: OfficeBusinessMapState["grid"]; isDM: boolean; editMode: boolean; canInstall: boolean; canRemove: boolean; busy: boolean; backLabel?: string; onBack?: () => void; onUpdate: (updates: Partial<OfficeBusinessSlot>) => void; onInstall: (addition: FacilityAddition) => void; onRemove: () => void; onCreateAddition?: () => void; onDelete: () => void }) {
  const color = facilitySlotRoleColor(slot.role);
  const compatible = additions.filter((addition) => isFacilityAdditionCompatible(slot, addition));
  const installed = additions.find((addition) => addition.id === slot.installedAdditionId);
  const permanent = slot.tier === "major";
  return (
    <div className="space-y-3">
      {onBack && <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[8px] hover:text-white" style={S_MUTED}><ArrowLeft size={10} /> Back to {backLabel || "area"}</button>}
      <PanelTitle icon={permanent ? Lock : Factory} text={slot.name} color={color} />
      {isDM && editMode ? (
        <>
          <Field label="Slot Name"><input value={slot.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 60) })} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Facility Slot Role"><select value={slot.role} onChange={(event) => { const role = event.target.value as FacilitySlotRole; const tier = role === "Ride" || role === "Major Attraction" ? "major" : "minor"; onUpdate({ role, tier, filled: tier === "major" ? true : slot.filled, occupant: tier === "major" ? slot.occupant || slot.name : slot.occupant }); }} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}>{FACILITY_SLOT_ROLES.map((role) => <option key={role} value={role} disabled={Boolean(slot.installedAdditionId) && (role === "Ride" || role === "Major Attraction")}>{role}</option>)}</select></Field>
          <div className="flex items-center justify-between border border-[#1A1A2B] p-2 text-[8px]"><span style={S_DIM}>SLOT CLASS</span><span className="flex items-center gap-1" style={{ color }}>{permanent && <Lock size={8} />}{permanent ? "MAJOR / PERMANENT" : "MINOR / MOVEABLE"}</span></div>
          <Field label="Accepted Addition Categories"><div className="grid grid-cols-2 gap-1">{FACILITY_ADDITION_CATEGORIES.filter((category) => category !== "Unassigned").map((category) => <label key={category} className="flex items-center gap-1 border border-[#171724] p-1.5 text-[8px]" style={S_TEXT}><input type="checkbox" checked={slot.acceptedAdditionCategories.includes(category)} disabled={permanent} onChange={(event) => onUpdate({ acceptedAdditionCategories: event.target.checked ? [...new Set([...slot.acceptedAdditionCategories, category])] : slot.acceptedAdditionCategories.filter((entry) => entry !== category) })} />{category}</label>)}</div><div className="mt-1 text-[7px]" style={S_DIM}>{permanent ? "Permanent slots do not accept Facility Additions." : "No selections accepts every addition category."}</div></Field>
          <Field label="Compatible Tags"><input value={slot.acceptedTags.join(", ")} onChange={(event) => onUpdate({ acceptedTags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) })} placeholder="family, exterior, food" className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          {!slot.installedAdditionId && (permanent ? <Field label="Permanent Feature"><input value={slot.occupant} onChange={(event) => onUpdate({ filled: true, occupant: event.target.value.slice(0, 100), linkedFacilityId: "" })} className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field> : <><Toggle label="Custom assignment" checked={slot.filled} onChange={(checked) => onUpdate({ filled: checked, occupant: checked ? slot.occupant : "", linkedFacilityId: checked ? slot.linkedFacilityId : "" })} />{slot.filled && <><Field label="Link Existing Facility"><select value={slot.linkedFacilityId} onChange={(event) => { const facility = facilities.find((entry) => entry.id === event.target.value); onUpdate({ linkedFacilityId: event.target.value, occupant: facility?.name || slot.occupant }); }} className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}><option value="">Custom assignment</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></Field><Field label="Filled With"><input value={slot.occupant} onChange={(event) => onUpdate({ occupant: event.target.value.slice(0, 100), linkedFacilityId: "" })} className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field></>}</>)}
          <Field label="Notes"><textarea value={slot.notes} onChange={(event) => onUpdate({ notes: event.target.value.slice(0, 1200) })} rows={3} className="w-full resize-none border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <RectInputs rect={slot} grid={grid} onUpdate={onUpdate} />
          {!permanent && <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Slot</button>}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[9px]"><span style={S_DIM}>ROLE</span><span className="flex items-center gap-1" style={{ color }}>{permanent && <Lock size={8} />}{slot.role}</span></div>
          <div className="border p-3" style={{ borderColor: color, background: `${color}16` }}><div className="text-[8px]" style={S_DIM}>{permanent ? "PERMANENT FEATURE" : "ASSIGNMENT"}</div><div className="mt-1 flex items-center gap-2 text-[11px]" style={slot.filled ? S_TEXT : S_MUTED}>{!slot.filled && <EmptySlotIcon compact />}{slot.filled ? slot.occupant || "Filled" : "Empty slot"}</div>{slot.installedBy && <div className="mt-1 text-[7px]" style={S_DIM}>Installed by {slot.installedBy}</div>}</div>
          {slot.notes && <div className="whitespace-pre-wrap text-[9px] leading-5" style={S_MUTED}>{slot.notes}</div>}
          {!permanent && <div className="border border-[#1A1A2B] p-3"><div className="mb-2 text-[8px] font-semibold" style={S_TEXT}>SLOT COMPATIBILITY</div><div className="space-y-2 text-[8px] leading-4"><div><div style={S_DIM}>ACCEPTED ADDITION CATEGORIES</div><div style={S_MUTED}>{slot.acceptedAdditionCategories.length > 0 ? slot.acceptedAdditionCategories.join(", ") : "Any addition category"}</div></div><div><div style={S_DIM}>COMPATIBLE TAGS</div><div style={S_MUTED}>{slot.acceptedTags.length > 0 ? slot.acceptedTags.join(", ") : "Any compatible tags"}</div></div></div></div>}
        </div>
      )}

      {onCreateAddition && <button type="button" onClick={onCreateAddition} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_GREEN}><Plus size={11} /> Create Facility Addition</button>}

      {slot.installedAdditionId ? (
        <div className="border border-[#294A39] bg-[#07120C] p-3">
          <div className="text-[8px]" style={S_DIM}>INSTALLED ADDITION</div>
          <div className="mt-1 text-[11px]" style={S_TEXT}>{installed?.name || slot.occupant}</div>
          {canRemove && <button type="button" onClick={onRemove} disabled={busy} className={`${retro.button} mt-2 flex w-full items-center justify-center gap-2 py-2 text-[9px] disabled:opacity-40`} style={S_RED}>{busy ? <LoaderCircle size={10} className="animate-spin" /> : <Trash2 size={10} />} Remove</button>}
          {canInstall && <div className="mt-3 border-t border-[#294A39] pt-3"><div className="mb-2 text-[8px]" style={S_DIM}>SWITCH TO</div><div className="max-h-36 space-y-1 overflow-y-auto">{compatible.filter((addition) => addition.id !== slot.installedAdditionId).map((addition) => { const available = Math.max(0, addition.quantity - (additionUsage[addition.id] || 0)); return <button type="button" key={addition.id} onClick={() => onInstall(addition)} disabled={available <= 0 || busy} className="flex w-full items-center gap-2 border border-[#1A1A2B] p-2 text-left disabled:opacity-35"><AdditionThumb addition={addition} /><span className="min-w-0 flex-1 truncate text-[9px]" style={S_TEXT}>{addition.name}</span><span className="text-[8px]" style={S_DIM}>{available}</span></button>; })}{compatible.filter((addition) => addition.id !== slot.installedAdditionId).length === 0 && <div className="py-2 text-center text-[8px]" style={S_DIM}>No alternate additions.</div>}</div></div>}
        </div>
      ) : !slot.filled && canInstall ? (
        <div className="border border-[#1A1A2B] p-3"><div className="mb-2 text-[8px]" style={S_DIM}>COMPATIBLE ADDITIONS</div><div className="max-h-52 space-y-1 overflow-y-auto">{compatible.map((addition) => { const available = Math.max(0, addition.quantity - (additionUsage[addition.id] || 0)); return <button type="button" key={addition.id} onClick={() => onInstall(addition)} disabled={available <= 0 || busy} className="flex w-full items-center gap-2 border border-[#1A1A2B] p-2 text-left disabled:opacity-35"><AdditionThumb addition={addition} /><span className="min-w-0 flex-1 truncate text-[9px]" style={S_TEXT}>{addition.name}</span><span className="text-[8px]" style={S_DIM}>{available}</span></button>; })}{compatible.length === 0 && <div className="py-3 text-center text-[8px]" style={S_DIM}>No compatible additions.</div>}</div></div>
      ) : null}
    </div>
  );
}

function FacilityAdditionLibrary({ additions, allAdditions, selected, usage, isDM, canDrag, query, uploadProgress, onQuery, onSelect, onAdd, onUpdate, onDelete, onUploadThumbnail }: { additions: FacilityAddition[]; allAdditions: FacilityAddition[]; selected: FacilityAddition | null; usage: Record<string, number>; isDM: boolean; canDrag: boolean; query: string; uploadProgress: number | null; onQuery: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onUpdate: (id: string, updates: Partial<FacilityAddition>) => void; onDelete: (addition: FacilityAddition) => void; onUploadThumbnail: (addition: FacilityAddition, file: File) => void }) {
  return (
    <section className="border-t border-[#1A1A2B] pt-2" aria-label="Facility Addition storage">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Package size={13} style={{ color: "#79B8FF" }} /><span className="text-[11px] font-semibold" style={S_TEXT}>Facility Addition Storage</span><span className="border border-[#25253B] px-1.5 py-0.5 text-[8px]" style={S_DIM}>{allAdditions.length}</span></div>
        <div className="flex items-center gap-2"><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search additions..." className="w-44 border bg-transparent px-2 py-1 text-[9px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} />{isDM && <button type="button" onClick={onAdd} className={`${retro.button} flex items-center gap-1 px-2 py-1 text-[9px]`} style={S_GREEN}><Plus size={10} /> Create</button>}</div>
      </div>
      <div className="flex min-h-[88px] gap-2 overflow-x-auto border border-[#1A1A2B] bg-[#030306] p-2">
        {additions.map((addition) => {
          const used = usage[addition.id] || 0;
          const available = Math.max(0, addition.quantity - used);
          return (
            <button
              type="button"
              key={addition.id}
              draggable={canDrag && available > 0}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-facility-addition", addition.id); }}
              onClick={() => onSelect(addition.id)}
              className="relative h-[70px] w-[132px] flex-shrink-0 overflow-hidden border p-1.5 text-left"
              style={{ borderColor: selected?.id === addition.id ? "#FFFFFF" : facilityAdditionCategoryColor(addition.additionCategory), background: "#08080D" }}
            >
              {addition.thumbnailUrl && <img src={addition.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
              <div className="relative flex h-full flex-col"><div className="truncate text-[9px] font-semibold" style={S_TEXT}>{addition.name}</div><div className="mt-1 text-[7px]" style={{ color: facilityAdditionCategoryColor(addition.additionCategory) }}>{addition.additionCategory.toUpperCase()}</div><div className="mt-auto flex items-center justify-between text-[8px]" style={S_DIM}><span>{addition.width}x{addition.height}</span><span>{available}/{addition.quantity}</span></div></div>
            </button>
          );
        })}
        {additions.length === 0 && <div className="flex w-full items-center justify-center text-[9px]" style={S_DIM}>{allAdditions.length === 0 ? "No Facility Additions stored." : query.trim() ? "No additions match the search." : "No compatible additions for this slot."}</div>}
      </div>

      {selected && (
        <div className="mt-2 grid grid-cols-1 gap-2 border border-[#1A1A2B] bg-[#050508] p-2 lg:grid-cols-[110px_minmax(0,1fr)_210px]">
          <div className="aspect-[4/3] overflow-hidden border border-[#25253B] bg-[#08080D]">
            {selected.thumbnailUrl ? <img src={selected.thumbnailUrl} alt={`${selected.name} thumbnail`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImagePlus size={20} style={S_DIM} /></div>}
          </div>
          <div className="min-w-0 space-y-2">
            {isDM ? <><input value={selected.name} onChange={(event) => onUpdate(selected.id, { name: event.target.value.slice(0, 80) })} className="w-full border bg-transparent px-2 py-1.5 text-[10px] font-semibold" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /><textarea value={selected.description} onChange={(event) => onUpdate(selected.id, { description: event.target.value.slice(0, 1200) })} rows={2} placeholder="Description" className="w-full resize-none border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /><input value={selected.tags.join(", ")} onChange={(event) => onUpdate(selected.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) })} placeholder="Compatibility tags" className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></> : <><div className="text-[11px] font-semibold" style={S_TEXT}>{selected.name}</div><div className="text-[9px] leading-5" style={S_MUTED}>{selected.description || "No description."}</div><div className="text-[8px]" style={S_DIM}>{selected.tags.join(", ") || "No tags"}</div></>}
          </div>
          <div className="space-y-2">
            {isDM ? <><Field label="Addition Category"><select value={selected.additionCategory} onChange={(event) => onUpdate(selected.id, { additionCategory: event.target.value as FacilityAdditionCategory })} className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}>{FACILITY_ADDITION_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><div className="grid grid-cols-3 gap-2"><Field label="Quantity"><input type="number" min="0" max="999" value={selected.quantity} onChange={(event) => onUpdate(selected.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field><Field label="Width"><input type="number" min="1" max="32" value={selected.width} onChange={(event) => onUpdate(selected.id, { width: Math.max(1, Number(event.target.value) || 1) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field><Field label="Height"><input type="number" min="1" max="24" value={selected.height} onChange={(event) => onUpdate(selected.id, { height: Math.max(1, Number(event.target.value) || 1) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field></div><div className="grid grid-cols-2 gap-2"><Field label="Purchase Cost"><input type="number" min="0" value={selected.cost} onChange={(event) => onUpdate(selected.id, { cost: Math.max(0, Number(event.target.value) || 0) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field><Field label="Monthly Upkeep"><input type="number" min="0" value={selected.monthlyUpkeep} onChange={(event) => onUpdate(selected.id, { monthlyUpkeep: Math.max(0, Number(event.target.value) || 0) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field></div><div className="grid grid-cols-2 gap-1">{FACILITY_STAT_KEYS.map((stat) => <Field key={stat} label={FACILITY_STAT_META[stat].label}><input type="number" value={selected.statModifiers.find((modifier) => modifier.stat === stat)?.amount || 0} onChange={(event) => { const amount = Number(event.target.value) || 0; onUpdate(selected.id, { statModifiers: [...selected.statModifiers.filter((modifier) => modifier.stat !== stat), ...(amount ? [{ stat, amount }] : [])] }); }} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>)}</div><label className={`${retro.button} flex cursor-pointer items-center justify-center gap-1 py-2 text-[8px]`} style={S_TEXT}><Upload size={9} /> Thumbnail<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadThumbnail(selected, file); event.currentTarget.value = ""; }} /></label>{uploadProgress != null && <ProgressBar value={uploadProgress} />}<button type="button" onClick={() => onDelete(selected)} disabled={(usage[selected.id] || 0) > 0} className={`${retro.button} flex w-full items-center justify-center gap-1 py-2 text-[8px] disabled:opacity-30`} style={S_RED}><Trash2 size={9} /> Delete</button></> : <><div className="text-[9px]" style={S_DIM}>{Math.max(0, selected.quantity - (usage[selected.id] || 0))} available of {selected.quantity}</div><div className="text-[8px]" style={S_DIM}>{selected.additionCategory} · {selected.cost.toLocaleString()} CR · {selected.monthlyUpkeep.toLocaleString()} CR upkeep</div><div className="space-y-1">{selected.statModifiers.map((modifier) => <div key={modifier.stat} className="flex justify-between text-[8px]"><span style={S_DIM}>{FACILITY_STAT_META[modifier.stat].label}</span><span style={modifier.amount >= 0 ? S_GREEN : S_RED}>{modifier.amount >= 0 ? "+" : ""}{modifier.amount}</span></div>)}</div></>}
            <div className="text-[7px]" style={S_DIM}>Thumbnail: recommended 1200x900 (4:3), PNG or WebP.</div>
          </div>
        </div>
      )}
    </section>
  );
}

function AdditionThumb({ addition }: { addition: FacilityAddition }) {
  return addition.thumbnailUrl
    ? <img src={addition.thumbnailUrl} alt="" className="h-8 w-10 flex-shrink-0 object-cover" />
    : <span className="flex h-8 w-10 flex-shrink-0 items-center justify-center border border-[#25253B]"><Package size={11} style={S_DIM} /></span>;
}

function EmptySlotIcon({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return <span aria-hidden="true" className={`pointer-events-none flex flex-shrink-0 items-center justify-center border border-dashed border-[#8FA2BE99] bg-[#0B111BCC] text-[#AFC3DE] ${compact ? "h-5 w-5" : "h-7 w-7"} ${className}`}><Plus size={compact ? 10 : 13} /></span>;
}

function RectInputs({ rect, grid, onUpdate }: { rect: BusinessMapRect; grid: OfficeBusinessMapState["grid"]; onUpdate: (updates: Partial<BusinessMapRect>) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[8px]" style={S_DIM}><Move size={9} /> GRID POSITION &amp; SIZE</div>
      <div className="grid grid-cols-4 gap-1">
        {(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="text-[7px] uppercase" style={S_DIM}>{key}<input type="number" min={key === "x" || key === "y" ? 0 : 1} max={key === "x" || key === "width" ? grid.width : grid.height} value={rect[key]} onChange={(event) => onUpdate(normalizeBusinessMapRect({ ...rect, [key]: Number(event.target.value) }, rect, grid))} className="mt-1 w-full border bg-transparent px-1 py-1.5 text-[9px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></label>)}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="mt-2 flex items-center justify-between gap-3 border border-[#171724] bg-[#08080D] px-2 py-2 text-[9px]" style={S_TEXT}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ProgressBar({ value }: { value: number }) {
  return <div className="mt-2 h-2 overflow-hidden border border-[#25253B] bg-[#030306]" aria-label={`Upload ${value}%`}><div className="h-full bg-[#54C7A0] transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[8px]" style={S_DIM}>{label.toUpperCase()}<div className="mt-1">{children}</div></label>;
}

function PanelTitle({ icon: Icon, text, color = "#79B8FF" }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; text: string; color?: string }) {
  return <div className="flex items-center gap-2 border-b border-[#1A1A2B] pb-2"><Icon size={13} style={{ color }} /><span className="truncate text-[11px] font-bold" style={S_TEXT}>{text}</span></div>;
}

function EmptyInspector({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; text: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center"><Icon size={22} style={S_DIM} /><div className="text-[10px]" style={S_DIM}>{text}</div></div>;
}

export default OfficeBusinessMap;
