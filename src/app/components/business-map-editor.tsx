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
  ImageOff,
  ImagePlus,
  Layers3,
  LoaderCircle,
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
  BUSINESS_SLOT_CATEGORIES,
  MAX_BUSINESS_MAP_GRID_HEIGHT,
  MAX_BUSINESS_MAP_GRID_WIDTH,
  MIN_BUSINESS_MAP_GRID_HEIGHT,
  MIN_BUSINESS_MAP_GRID_WIDTH,
  businessSlotCategoryColor,
  canPlayerEditBusinessMap,
  cloneOfficeBusinessMap,
  createBusinessMapId,
  createDefaultBusinessSlot,
  createFacilityAddition,
  installFacilityAddition,
  isFacilityAdditionCompatible,
  normalizeBusinessMapRect,
  removeFacilityAddition,
  resizeOfficeBusinessMapGrid,
  type BusinessMapBackground,
  type BusinessMapLayer,
  type BusinessMapPoint,
  type BusinessMapRect,
  type BusinessMapShape,
  type BusinessMapShapeKind,
  type BusinessSlotCategory,
  type FacilityAddition,
  type OfficeBusinessMapState,
  type OfficeBusinessSector,
  type OfficeBusinessSlot,
} from "@/lib/business-map-model";
import { deleteBusinessMapImage, uploadBusinessMapImage } from "@/lib/business-map-storage";
import type { FacilityAdditionAction } from "@/lib/office-state-api";
import { retro } from "./retro-styles";
import { S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT } from "./shared-styles";

type EditorTool = "select" | "hand" | BusinessMapShapeKind;
type InspectorMode = "selection" | "settings";

type RectOperation = {
  type: "rect";
  layer: "sector" | "slot";
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

function shapePath(shape: Pick<BusinessMapShape, "points" | "curved">) {
  const points = shape.points;
  if (points.length === 0) return "";
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
}: OfficeBusinessMapProps) {
  const [activeSectorId, setActiveSectorId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(value.sectors[0]?.id || null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectedAdditionId, setSelectedAdditionId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [tool, setTool] = useState<EditorTool>("select");
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("selection");
  const [pendingPoints, setPendingPoints] = useState<BusinessMapPoint[]>([]);
  const [operation, setOperation] = useState<PointerOperation | null>(null);
  const [zoom, setZoom] = useState(1);
  const [history, setHistory] = useState<{ past: OfficeBusinessMapState[]; future: OfficeBusinessMapState[] }>({ past: [], future: [] });
  const [assetProgress, setAssetProgress] = useState<number | null>(null);
  const [assetError, setAssetError] = useState("");
  const [brokenBackground, setBrokenBackground] = useState(false);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [additionSearch, setAdditionSearch] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const draggedRef = useRef(false);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const activeSector = value.sectors.find((sector) => sector.id === activeSectorId) || null;
  const selectedSector = value.sectors.find((sector) => sector.id === selectedSectorId) || null;
  const selectedSlot = activeSector?.slots.find((slot) => slot.id === selectedSlotId) || null;
  const surface = surfaceFor(value, activeSectorId) || value;
  const selectedShapes = surface.shapes.filter((shape) => selectedShapeIds.includes(shape.id));
  const selectedShape = selectedShapes[0] || null;
  const slotLayer = surface.layers.find((layer) => layer.id === "slots");

  useEffect(() => {
    setHistory({ past: [], future: [] });
    setPendingPoints([]);
    setSelectedShapeIds([]);
    setBrokenBackground(false);
  }, [mapKey]);

  useEffect(() => {
    if (activeSectorId && !value.sectors.some((sector) => sector.id === activeSectorId)) {
      setActiveSectorId(null);
      setSelectedSlotId(null);
    }
  }, [activeSectorId, value.sectors]);

  useEffect(() => {
    setBrokenBackground(false);
  }, [activeSectorId, surface.background.imageUrl]);

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
    layer: "sector" | "slot",
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

  const handleInstall = async (slot: OfficeBusinessSlot, addition: FacilityAddition) => {
    setActionError("");
    if (!activeSector) return;
    if (!isFacilityAdditionCompatible(slot, addition)) {
      setActionError("That addition does not match this slot's category, tags, or footprint.");
      return;
    }
    const available = Math.max(0, addition.quantity - (additionUsage[addition.id] || 0));
    if (available <= 0) {
      setActionError("No copies of that Facility Addition are available.");
      return;
    }
    if (slot.filled) {
      setActionError("Remove the current assignment before installing another addition.");
      return;
    }
    if (isDM) {
      emit(installFacilityAddition(valueRef.current, activeSector.id, slot.id, addition, currentPlayerId || "dm"));
      return;
    }
    if (!canUseMap(value, isDM, currentPlayerId, "install") || !onPlayerAction) {
      setActionError("You do not have permission to install additions on this map.");
      return;
    }
    setBusySlotId(slot.id);
    try {
      await onPlayerAction({ action: "install", scopeId: mapKey, sectorId: activeSector.id, slotId: slot.id, additionId: addition.id });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Installation failed.");
    } finally {
      setBusySlotId(null);
    }
  };

  const handleRemove = async (slot: OfficeBusinessSlot) => {
    if (!activeSector || !slot.installedAdditionId) return;
    setActionError("");
    if (isDM) {
      emit(removeFacilityAddition(valueRef.current, activeSector.id, slot.id));
      return;
    }
    if (!canUseMap(value, isDM, currentPlayerId, "remove") || !onPlayerAction) {
      setActionError("You do not have permission to remove additions from this map.");
      return;
    }
    setBusySlotId(slot.id);
    try {
      await onPlayerAction({ action: "remove", scopeId: mapKey, sectorId: activeSector.id, slotId: slot.id });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setBusySlotId(null);
    }
  };

  const addAddition = () => {
    if (!isDM || !onAdditionsChange) return;
    const addition = createFacilityAddition(additions.length);
    onAdditionsChange([...additions, addition]);
    setSelectedAdditionId(addition.id);
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

  const occupiedCount = useMemo(
    () => value.sectors.reduce((count, sector) => count + sector.slots.filter((slot) => slot.filled).length, 0),
    [value.sectors],
  );
  const slotCount = useMemo(() => value.sectors.reduce((count, sector) => count + sector.slots.length, 0), [value.sectors]);
  const filteredAdditions = useMemo(() => {
    const query = additionSearch.trim().toLowerCase();
    if (!query) return additions;
    return additions.filter((addition) => `${addition.name} ${addition.category} ${addition.tags.join(" ")}`.toLowerCase().includes(query));
  }, [additionSearch, additions]);
  const selectedAddition = additions.find((addition) => addition.id === selectedAdditionId) || null;

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
    <div className="space-y-4 outline-none" tabIndex={0} onKeyDown={handleKeyDown} data-business-map-key={mapKey}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1A1A2B] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-bold" style={S_TEXT}>
            {activeSector && (
              <button type="button" onClick={() => { setActiveSectorId(null); setSelectedSlotId(null); setSelectedShapeIds([]); }} className="p-1" title="Back to business map" style={S_MUTED}>
                <ArrowLeft size={14} />
              </button>
            )}
            <MapIcon size={16} style={{ color: activeSector?.color || "#79B8FF" }} />
            <span className="truncate">{activeSector ? activeSector.name : value.name}</span>
          </div>
          <div className="mt-1 text-[9px]" style={S_DIM}>
            {activeSector ? activeSector.description || "Sector interior" : `${value.sectors.length} sectors | ${occupiedCount}/${slotCount} slots filled`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-[#25253B] bg-[#08080D]">
            <IconButton label="Zoom out" onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.15).toFixed(2))))} disabled={zoom <= 0.6}><ZoomOut size={11} /></IconButton>
            <span className="w-12 text-center text-[8px]" style={S_DIM}>{Math.round(zoom * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.15).toFixed(2))))} disabled={zoom >= 2.5}><ZoomIn size={11} /></IconButton>
            <IconButton label="Reset zoom" onClick={() => { setZoom(1); if (viewportRef.current) { viewportRef.current.scrollLeft = 0; viewportRef.current.scrollTop = 0; } }}><Maximize2 size={11} /></IconButton>
          </div>
          {isDM && (
            <>
              <button type="button" onClick={() => { setEditMode((current) => !current); setTool("select"); setPendingPoints([]); }} className={`${editMode ? retro.sunken : retro.raised} flex items-center gap-2 px-3 py-2 text-[10px]`} style={{ color: editMode ? "#FFD56A" : "#9AA8C7", background: editMode ? "#2B210E" : "#0B0B14" }}>
                {editMode ? <Check size={12} /> : <Pencil size={12} />} {editMode ? "Finish Editing" : "Edit Layout"}
              </button>
              <button type="button" onClick={() => activeSector ? addSlot(activeSector) : addSector()} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_GREEN}>
                <Plus size={12} /> {activeSector ? "Add Slot" : "Add Sector"}
              </button>
            </>
          )}
        </div>
      </header>

      {isDM && editMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border border-[#1A1A2B] bg-[#050508] p-2">
          <div className="flex flex-wrap items-center gap-1">
            {TOOL_META.map(({ id, label, icon: Icon }) => (
              <IconButton key={id} label={label} active={tool === id} onClick={() => { setTool(id); setPendingPoints([]); }}><Icon size={12} /></IconButton>
            ))}
            {drawingTool && pendingPoints.length > 0 && (
              <>
                <button type="button" onClick={finishDrawing} className={`${retro.button} flex items-center gap-1 px-2 py-1.5 text-[9px]`} style={S_GREEN}><Check size={10} /> Finish</button>
                <IconButton label="Cancel drawing" onClick={cancelDrawing}><X size={11} /></IconButton>
                <span className="px-1 text-[8px]" style={S_DIM}>{pendingPoints.length} points</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="Undo" onClick={undo} disabled={history.past.length === 0}><Undo2 size={12} /></IconButton>
            <IconButton label="Redo" onClick={redo} disabled={history.future.length === 0}><Redo2 size={12} /></IconButton>
            <IconButton label="Map settings" active={inspectorMode === "settings"} onClick={() => { setInspectorMode("settings"); setSelectedShapeIds([]); setSelectedSlotId(null); setSelectedSectorId(null); }}><Settings2 size={12} /></IconButton>
          </div>
        </div>
      )}

      {(actionError || assetError) && (
        <div className="flex items-start justify-between gap-3 border border-[#6A3A3A] bg-[#190909] p-3 text-[9px]" style={S_RED}>
          <span className="flex items-start gap-2"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{actionError || assetError}</span>
          <button type="button" onClick={() => { setActionError(""); setAssetError(""); }} title="Dismiss"><X size={11} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div
          ref={viewportRef}
          className="relative max-h-[680px] min-h-[380px] overflow-auto border"
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
              minWidth: `${Math.round(720 * zoom)}px`,
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
                return (
                  <path key={shape.id} d={shapePath(shape)} fill="none" stroke={selected ? "#FFFFFF" : shape.color} strokeOpacity={shape.opacity} strokeWidth={selected ? shape.strokeWidth + 0.08 : shape.strokeWidth} strokeLinecap={shape.kind === "pathway" ? "round" : "square"} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: interactive ? "stroke" : "none", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); setInspectorMode("selection"); setSelectedShapeIds(event.shiftKey ? selectedShapeIds.includes(shape.id) ? selectedShapeIds.filter((id) => id !== shape.id) : [...selectedShapeIds, shape.id] : [shape.id]); }} />
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

            {!activeSector && value.sectors.map((sector) => {
              const selected = selectedSectorId === sector.id;
              const filled = sector.slots.filter((slot) => slot.filled).length;
              return (
                <button
                  type="button"
                  key={sector.id}
                  onPointerDown={(event) => startRectOperation(event, "sector", "move", sector.id, sector)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (draggedRef.current) { draggedRef.current = false; return; }
                    setSelectedSectorId(sector.id);
                    setSelectedShapeIds([]);
                    setInspectorMode("selection");
                    if (!editMode) setActiveSectorId(sector.id);
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(sector, value.grid), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : sector.color, background: `${sector.color}38`, boxShadow: selected ? `inset 0 0 0 1px ${sector.color}, 0 0 10px ${sector.color}55` : "none", cursor: editMode && tool === "select" ? "move" : "pointer" }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="truncate text-[10px] font-bold">{sector.name}</div>
                    <div className="mt-1 truncate text-[8px]" style={{ color: sector.color }}>{sector.width}x{sector.height}</div>
                    <div className="mt-auto text-[8px]" style={S_DIM}>{filled}/{sector.slots.length} slots</div>
                  </div>
                  {editMode && tool === "select" && <ResizeHandle onPointerDown={(event) => startRectOperation(event, "sector", "resize", sector.id, sector)} />}
                </button>
              );
            })}

            {activeSector && slotLayer?.visible !== false && activeSector.slots.map((slot) => {
              const selected = selectedSlotId === slot.id;
              const color = businessSlotCategoryColor(slot.category);
              const installed = additions.find((addition) => addition.id === slot.installedAdditionId);
              const canDrop = canUseMap(value, isDM, currentPlayerId, "install") && !slot.filled;
              return (
                <button
                  type="button"
                  key={slot.id}
                  onPointerDown={(event) => startRectOperation(event, "slot", "move", slot.id, slot, activeSector.id)}
                  onClick={(event) => { event.stopPropagation(); if (draggedRef.current) { draggedRef.current = false; return; } setSelectedSlotId(slot.id); setSelectedShapeIds([]); setInspectorMode("selection"); }}
                  onDragOver={(event) => { if (canDrop) event.preventDefault(); }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const additionId = event.dataTransfer.getData("application/x-facility-addition");
                    const addition = additions.find((entry) => entry.id === additionId);
                    if (addition) void handleInstall(slot, addition);
                  }}
                  className="absolute overflow-hidden border p-2 text-left"
                  style={{ ...rectStyle(slot, value.grid), color: "#E5ECFF", borderColor: selected ? "#FFFFFF" : color, background: slot.filled ? `${color}55` : `${color}1E`, boxShadow: selected ? `inset 0 0 0 1px ${color}, 0 0 10px ${color}55` : "none", cursor: editMode && tool === "select" && !slotLayer.locked ? "move" : "pointer" }}
                >
                  {installed?.thumbnailUrl && <img src={installed.thumbnailUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />}
                  <div className="relative flex h-full min-h-0 flex-col">
                    <div className="truncate text-[9px] font-bold">{slot.name}</div>
                    <div className="mt-1 truncate text-[7px]" style={{ color }}>{slot.category.toUpperCase()}</div>
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

        <aside className="min-h-[380px] border border-[#1A1A2B] bg-[#050508] p-3">
          {inspectorMode === "settings" ? (
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
          ) : activeSector && selectedSlot ? (
            <SlotInspector
              slot={selectedSlot}
              additions={additions}
              additionUsage={additionUsage}
              facilities={facilities}
              grid={value.grid}
              isDM={isDM}
              editMode={editMode}
              canInstall={canUseMap(value, isDM, currentPlayerId, "install")}
              canRemove={canUseMap(value, isDM, currentPlayerId, "remove")}
              busy={busySlotId === selectedSlot.id}
              onUpdate={(updates) => updateSlot(activeSector.id, selectedSlot.id, updates)}
              onInstall={(addition) => void handleInstall(selectedSlot, addition)}
              onRemove={() => void handleRemove(selectedSlot)}
              onDelete={() => deleteSlot(activeSector.id, selectedSlot.id)}
            />
          ) : !activeSector && selectedSector ? (
            <SectorInspector
              sector={selectedSector}
              isDM={isDM}
              editMode={editMode}
              grid={value.grid}
              onUpdate={(updates) => updateSector(selectedSector.id, updates)}
              onOpen={() => { setActiveSectorId(selectedSector.id); setSelectedSlotId(null); setSelectedShapeIds([]); setInspectorMode("selection"); }}
              onDelete={() => deleteSector(selectedSector.id)}
            />
          ) : (
            <EmptyInspector icon={activeSector ? Grid3X3 : Building2} text={isDM && editMode ? "Select an element, or open map settings." : "Select a map element to inspect it."} />
          )}
        </aside>
      </div>

      <FacilityAdditionLibrary
        additions={filteredAdditions}
        allAdditions={additions}
        selected={selectedAddition}
        usage={additionUsage}
        isDM={isDM}
        canDrag={canUseMap(value, isDM, currentPlayerId, "install")}
        query={additionSearch}
        uploadProgress={assetProgress}
        onQuery={setAdditionSearch}
        onSelect={setSelectedAdditionId}
        onAdd={addAddition}
        onUpdate={updateAddition}
        onDelete={deleteAddition}
        onUploadThumbnail={uploadAdditionThumbnail}
      />
    </div>
  );
}

function IconButton({ label, onClick, children, active = false, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className="flex h-8 w-8 items-center justify-center border transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-25" style={{ borderColor: active ? "#FFD56A" : CONTROL_BORDER, color: active ? "#FFD56A" : "#9AA8C7", background: active ? "#2B210E" : CONTROL_BG }}>
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

function SectorInspector({ sector, isDM, editMode, grid, onUpdate, onOpen, onDelete }: { sector: OfficeBusinessSector; isDM: boolean; editMode: boolean; grid: OfficeBusinessMapState["grid"]; onUpdate: (updates: Partial<OfficeBusinessSector>) => void; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="space-y-3">
      <PanelTitle icon={Building2} text={sector.name} color={sector.color} />
      {isDM && editMode ? (
        <>
          <Field label="Sector Name"><input value={sector.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 60) })} className="w-full border bg-transparent px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Description"><textarea value={sector.description} onChange={(event) => onUpdate({ description: event.target.value.slice(0, 600) })} rows={4} className="w-full resize-none border bg-transparent px-2 py-2 text-[10px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Sector Color"><input type="color" value={sector.color} onChange={(event) => onUpdate({ color: event.target.value })} className="h-9 w-full border bg-transparent p-1" style={{ borderColor: CONTROL_BORDER }} /></Field>
          <RectInputs rect={sector} grid={grid} onUpdate={onUpdate} />
        </>
      ) : <div className="text-[10px] leading-5" style={S_MUTED}>{sector.description || "No sector description."}</div>}
      <div className="grid grid-cols-2 gap-2 text-[9px]"><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{sector.slots.length} slots</div><div className="border border-[#1A1A2B] p-2" style={S_DIM}>{sector.shapes.length} elements</div></div>
      <button type="button" onClick={onOpen} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[10px]`} style={S_TEXT}><MapIcon size={12} /> Open Sector</button>
      {isDM && editMode && <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Sector</button>}
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

function SlotInspector({ slot, additions, additionUsage, facilities, grid, isDM, editMode, canInstall, canRemove, busy, onUpdate, onInstall, onRemove, onDelete }: { slot: OfficeBusinessSlot; additions: FacilityAddition[]; additionUsage: Record<string, number>; facilities: Array<{ id: string; name: string }>; grid: OfficeBusinessMapState["grid"]; isDM: boolean; editMode: boolean; canInstall: boolean; canRemove: boolean; busy: boolean; onUpdate: (updates: Partial<OfficeBusinessSlot>) => void; onInstall: (addition: FacilityAddition) => void; onRemove: () => void; onDelete: () => void }) {
  const color = businessSlotCategoryColor(slot.category);
  const compatible = additions.filter((addition) => isFacilityAdditionCompatible(slot, addition));
  const installed = additions.find((addition) => addition.id === slot.installedAdditionId);
  return (
    <div className="space-y-3">
      <PanelTitle icon={Factory} text={slot.name} color={color} />
      {isDM && editMode ? (
        <>
          <Field label="Slot Name"><input value={slot.name} onChange={(event) => onUpdate({ name: event.target.value.slice(0, 60) })} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <Field label="Display Type"><select value={slot.category} onChange={(event) => onUpdate({ category: event.target.value as BusinessSlotCategory })} className="w-full border bg-transparent px-2 py-2 text-[10px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}>{BUSINESS_SLOT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
          <Field label="Accepted Categories"><div className="grid grid-cols-2 gap-1">{BUSINESS_SLOT_CATEGORIES.filter((category) => category !== "Unassigned").map((category) => <label key={category} className="flex items-center gap-1 border border-[#171724] p-1.5 text-[8px]" style={S_TEXT}><input type="checkbox" checked={slot.acceptedCategories.includes(category)} onChange={(event) => onUpdate({ acceptedCategories: event.target.checked ? [...new Set([...slot.acceptedCategories, category])] : slot.acceptedCategories.filter((entry) => entry !== category) })} />{category}</label>)}</div><div className="mt-1 text-[7px]" style={S_DIM}>No selections accepts every category.</div></Field>
          <Field label="Required Tags"><input value={slot.acceptedTags.join(", ")} onChange={(event) => onUpdate({ acceptedTags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) })} placeholder="power, exterior, staff" className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          {!slot.installedAdditionId && <><Toggle label="Custom assignment" checked={slot.filled} onChange={(checked) => onUpdate({ filled: checked, occupant: checked ? slot.occupant : "", linkedFacilityId: checked ? slot.linkedFacilityId : "" })} />{slot.filled && <><Field label="Link Existing Facility"><select value={slot.linkedFacilityId} onChange={(event) => { const facility = facilities.find((entry) => entry.id === event.target.value); onUpdate({ linkedFacilityId: event.target.value, occupant: facility?.name || slot.occupant }); }} className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}><option value="">Custom assignment</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></Field><Field label="Filled With"><input value={slot.occupant} onChange={(event) => onUpdate({ occupant: event.target.value.slice(0, 100), linkedFacilityId: "" })} className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field></>}</>}
          <Field label="Notes"><textarea value={slot.notes} onChange={(event) => onUpdate({ notes: event.target.value.slice(0, 1200) })} rows={3} className="w-full resize-none border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field>
          <RectInputs rect={slot} grid={grid} onUpdate={onUpdate} />
          <button type="button" onClick={onDelete} className={`${retro.button} flex w-full items-center justify-center gap-2 py-2 text-[9px]`} style={S_RED}><Trash2 size={11} /> Delete Slot</button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[9px]"><span style={S_DIM}>TYPE</span><span style={{ color }}>{slot.category}</span></div>
          <div className="border p-3" style={{ borderColor: color, background: `${color}16` }}><div className="text-[8px]" style={S_DIM}>ASSIGNMENT</div><div className="mt-1 text-[11px]" style={slot.filled ? S_TEXT : S_MUTED}>{slot.filled ? slot.occupant || "Filled" : "Empty"}</div>{slot.installedBy && <div className="mt-1 text-[7px]" style={S_DIM}>Installed by {slot.installedBy}</div>}</div>
          {slot.notes && <div className="whitespace-pre-wrap text-[9px] leading-5" style={S_MUTED}>{slot.notes}</div>}
        </div>
      )}

      {slot.installedAdditionId ? (
        <div className="border border-[#294A39] bg-[#07120C] p-3">
          <div className="text-[8px]" style={S_DIM}>INSTALLED ADDITION</div>
          <div className="mt-1 text-[11px]" style={S_TEXT}>{installed?.name || slot.occupant}</div>
          {canRemove && <button type="button" onClick={onRemove} disabled={busy} className={`${retro.button} mt-2 flex w-full items-center justify-center gap-2 py-2 text-[9px] disabled:opacity-40`} style={S_RED}>{busy ? <LoaderCircle size={10} className="animate-spin" /> : <Trash2 size={10} />} Remove</button>}
        </div>
      ) : !slot.filled && canInstall ? (
        <div className="border border-[#1A1A2B] p-3">
          <div className="mb-2 text-[8px]" style={S_DIM}>COMPATIBLE ADDITIONS</div>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {compatible.map((addition) => {
              const available = Math.max(0, addition.quantity - (additionUsage[addition.id] || 0));
              return <button type="button" key={addition.id} onClick={() => onInstall(addition)} disabled={available <= 0 || busy} className="flex w-full items-center gap-2 border border-[#1A1A2B] p-2 text-left disabled:opacity-35"><AdditionThumb addition={addition} /><span className="min-w-0 flex-1 truncate text-[9px]" style={S_TEXT}>{addition.name}</span><span className="text-[8px]" style={S_DIM}>{available}</span></button>;
            })}
            {compatible.length === 0 && <div className="py-3 text-center text-[8px]" style={S_DIM}>No compatible additions.</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FacilityAdditionLibrary({ additions, allAdditions, selected, usage, isDM, canDrag, query, uploadProgress, onQuery, onSelect, onAdd, onUpdate, onDelete, onUploadThumbnail }: { additions: FacilityAddition[]; allAdditions: FacilityAddition[]; selected: FacilityAddition | null; usage: Record<string, number>; isDM: boolean; canDrag: boolean; query: string; uploadProgress: number | null; onQuery: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onUpdate: (id: string, updates: Partial<FacilityAddition>) => void; onDelete: (addition: FacilityAddition) => void; onUploadThumbnail: (addition: FacilityAddition, file: File) => void }) {
  return (
    <section className="border-t border-[#1A1A2B] pt-4" aria-label="Facility Addition storage">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Package size={13} style={{ color: "#79B8FF" }} /><span className="text-[11px] font-semibold" style={S_TEXT}>Facility Addition Storage</span><span className="border border-[#25253B] px-1.5 py-0.5 text-[8px]" style={S_DIM}>{allAdditions.length}</span></div>
        <div className="flex items-center gap-2"><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search additions..." className="w-48 border bg-transparent px-2 py-1.5 text-[9px] outline-none" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} />{isDM && <button type="button" onClick={onAdd} className={`${retro.button} flex items-center gap-1 px-2 py-1.5 text-[9px]`} style={S_GREEN}><Plus size={10} /> Add</button>}</div>
      </div>
      <div className="flex min-h-[132px] gap-2 overflow-x-auto border border-[#1A1A2B] bg-[#030306] p-3">
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
              className="relative h-[108px] w-[150px] flex-shrink-0 overflow-hidden border p-2 text-left"
              style={{ borderColor: selected?.id === addition.id ? "#FFFFFF" : businessSlotCategoryColor(addition.category), background: "#08080D" }}
            >
              {addition.thumbnailUrl && <img src={addition.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
              <div className="relative flex h-full flex-col"><div className="truncate text-[9px] font-semibold" style={S_TEXT}>{addition.name}</div><div className="mt-1 text-[7px]" style={{ color: businessSlotCategoryColor(addition.category) }}>{addition.category.toUpperCase()}</div><div className="mt-auto flex items-center justify-between text-[8px]" style={S_DIM}><span>{addition.width}x{addition.height}</span><span>{available}/{addition.quantity}</span></div></div>
            </button>
          );
        })}
        {additions.length === 0 && <div className="flex w-full items-center justify-center text-[9px]" style={S_DIM}>{allAdditions.length === 0 ? "No Facility Additions stored." : "No additions match the search."}</div>}
      </div>

      {selected && (
        <div className="mt-3 grid grid-cols-1 gap-3 border border-[#1A1A2B] bg-[#050508] p-3 lg:grid-cols-[140px_minmax(0,1fr)_220px]">
          <div className="aspect-[4/3] overflow-hidden border border-[#25253B] bg-[#08080D]">
            {selected.thumbnailUrl ? <img src={selected.thumbnailUrl} alt={`${selected.name} thumbnail`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImagePlus size={20} style={S_DIM} /></div>}
          </div>
          <div className="min-w-0 space-y-2">
            {isDM ? <><input value={selected.name} onChange={(event) => onUpdate(selected.id, { name: event.target.value.slice(0, 80) })} className="w-full border bg-transparent px-2 py-2 text-[11px] font-semibold" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /><textarea value={selected.description} onChange={(event) => onUpdate(selected.id, { description: event.target.value.slice(0, 1200) })} rows={3} placeholder="Description" className="w-full resize-none border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /><input value={selected.tags.join(", ")} onChange={(event) => onUpdate(selected.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) })} placeholder="Compatibility tags" className="w-full border bg-transparent px-2 py-2 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></> : <><div className="text-[11px] font-semibold" style={S_TEXT}>{selected.name}</div><div className="text-[9px] leading-5" style={S_MUTED}>{selected.description || "No description."}</div><div className="text-[8px]" style={S_DIM}>{selected.tags.join(", ") || "No tags"}</div></>}
          </div>
          <div className="space-y-2">
            {isDM ? <><Field label="Category"><select value={selected.category} onChange={(event) => onUpdate(selected.id, { category: event.target.value as BusinessSlotCategory })} className="w-full border bg-transparent px-2 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }}>{BUSINESS_SLOT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><div className="grid grid-cols-3 gap-2"><Field label="Quantity"><input type="number" min="0" max="999" value={selected.quantity} onChange={(event) => onUpdate(selected.id, { quantity: Math.max(0, Number(event.target.value) || 0) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field><Field label="Width"><input type="number" min="1" max="32" value={selected.width} onChange={(event) => onUpdate(selected.id, { width: Math.max(1, Number(event.target.value) || 1) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field><Field label="Height"><input type="number" min="1" max="24" value={selected.height} onChange={(event) => onUpdate(selected.id, { height: Math.max(1, Number(event.target.value) || 1) })} className="w-full border bg-transparent px-1 py-1.5 text-[9px]" style={{ color: "#E5ECFF", borderColor: CONTROL_BORDER }} /></Field></div><label className={`${retro.button} flex cursor-pointer items-center justify-center gap-1 py-2 text-[8px]`} style={S_TEXT}><Upload size={9} /> Thumbnail<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadThumbnail(selected, file); event.currentTarget.value = ""; }} /></label>{uploadProgress != null && <ProgressBar value={uploadProgress} />}<button type="button" onClick={() => onDelete(selected)} disabled={(usage[selected.id] || 0) > 0} className={`${retro.button} flex w-full items-center justify-center gap-1 py-2 text-[8px] disabled:opacity-30`} style={S_RED}><Trash2 size={9} /> Delete</button></> : <div className="text-[9px]" style={S_DIM}>{Math.max(0, selected.quantity - (usage[selected.id] || 0))} available of {selected.quantity}</div>}
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
