import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArchiveRestore,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Coins,
  Hammer,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import { retro } from "./retro-styles";
import type { PlayerTheme } from "./player-theme";
import type { ManagedItem } from "./types";
import { WorkshopBlueprintVisual } from "./workshop-blueprint-visual";
import {
  deleteWorkshopDraft,
  loadWorkshopBootstrap,
  rebuildWorkshopBuild,
  saveWorkshopBuild,
  scrapWorkshopBuild,
  scrapWorkshopItem,
  submitWorkshopBuild,
} from "@/lib/workshop-api";
import {
  calculateWorkshopQuote,
  createWorkshopId,
  normalizeWorkshopBuild,
  workshopBuildReadiness,
  type WorkshopBlueprint,
  type WorkshopBootstrap,
  type WorkshopBuild,
} from "@/lib/workshop-model";

type Section = "builds" | "storage" | "salvage";

const errorText = (error: unknown) => error instanceof Error ? error.message : "The Workshop request failed.";
const STATUS_COLOR: Record<WorkshopBuild["status"], string> = { draft: "#8AB8FF", building: "#F1D47A", completed: "#76D6A4", scrapped: "#8B91AF" };

export function PersonalFilesWorkshop({ initialBootstrap, playerId, items, theme, onChanged }: { initialBootstrap: WorkshopBootstrap; playerId: string; items: ManagedItem[]; theme: PlayerTheme; onChanged: () => void | Promise<void> }) {
  const [data, setData] = useState(initialBootstrap);
  const [section, setSection] = useState<Section>("builds");
  const [selectedBuildId, setSelectedBuildId] = useState(initialBootstrap.builds[0]?.id || "");
  const [editor, setEditor] = useState<WorkshopBuild | null>(initialBootstrap.builds[0] ? structuredClone(initialBootstrap.builds[0]) : null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const localDraftsRef = useRef<Record<string, WorkshopBuild>>({});

  useEffect(() => {
    setData(initialBootstrap);
    setSelectedBuildId((current) => current && (initialBootstrap.builds.some((build) => build.id === current) || Boolean(localDraftsRef.current[current])) ? current : initialBootstrap.builds[0]?.id || "");
  }, [initialBootstrap]);

  useEffect(() => {
    const localDraft = localDraftsRef.current[selectedBuildId];
    const build = data.builds.find((entry) => entry.id === selectedBuildId);
    setEditor((current) => localDraft ? structuredClone(localDraft) : build ? structuredClone(build) : current?.id === selectedBuildId ? current : null);
  }, [data.builds, selectedBuildId]);

  const refresh = useCallback(async () => {
    const next = await loadWorkshopBootstrap();
    setData(next);
    await onChanged();
  }, [onChanged]);

  const run = useCallback(async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await refresh();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy("");
    }
  }, [refresh]);

  const panel = { background: theme.panelBg, border: `1px solid ${theme.panelBorder}` } as const;
  const subPanel = { background: theme.inputBg, border: `1px solid ${theme.dividerColor}` } as const;
  const button = `${retro.button} inline-flex items-center justify-center gap-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`;
  const input = `${retro.sunken} w-full px-2.5 py-2 text-[12px] outline-none`;
  const selectedBlueprint = editor ? data.blueprints.find((entry) => entry.id === editor.blueprintId) : null;
  const readiness = editor && selectedBlueprint ? workshopBuildReadiness(editor, selectedBlueprint, data.components) : null;
  const quote = editor && selectedBlueprint ? calculateWorkshopQuote(editor, selectedBlueprint, data.components, data.storage) : null;
  const canEdit = editor?.status === "draft" || editor?.status === "building";
  const hasUnsavedChanges = Boolean(editor && localDraftsRef.current[editor.id]);
  const visibleBuilds = [
    ...Object.values(localDraftsRef.current),
    ...data.builds.filter((build) => !localDraftsRef.current[build.id]),
  ];
  const externalScrappable = items.filter((item) => item.assignedTo.includes(playerId) && item.tags.includes("Scrappable") && !item.tags.includes("Workshop Built"));

  const rememberEditor = (next: WorkshopBuild) => {
    localDraftsRef.current[next.id] = structuredClone(next);
    setEditor(next);
  };

  useEffect(() => {
    if (!selectedBlueprint) {
      setSelectedSlotId("");
      return;
    }
    setSelectedSlotId((current) => selectedBlueprint.slots.some((slot) => slot.id === current) ? current : selectedBlueprint.slots[0]?.id || "");
  }, [editor?.id, selectedBlueprint?.id]);

  const createBuild = (blueprint: WorkshopBlueprint) => {
    const now = new Date().toISOString();
    const build = normalizeWorkshopBuild({ id: createWorkshopId("build"), playerId, blueprintId: blueprint.id, blueprintVersion: blueprint.version, name: `New ${blueprint.name}`, designation: "", notes: "", status: "draft", outputItemId: createWorkshopId("workshop-item"), revision: 0, createdAt: now, updatedAt: now, assignments: [] });
    rememberEditor(build);
    setSelectedBuildId(build.id);
    setSelectedSlotId(blueprint.slots[0]?.id || "");
    setSection("builds");
  };

  const save = () => editor && run("save", async () => {
    const result = await saveWorkshopBuild(editor, editor.revision);
    delete localDraftsRef.current[result.build.id];
    setEditor(structuredClone(result.build));
    setSelectedBuildId(result.build.id);
  }, `${editor.name} saved.`);

  const beginBuild = () => editor && run("submit", async () => {
    const saved = await saveWorkshopBuild(editor, editor.revision);
    const submitted = await submitWorkshopBuild(saved.build.id, saved.build.revision);
    delete localDraftsRef.current[submitted.build.id];
    setEditor(structuredClone(submitted.build));
    setSelectedBuildId(saved.build.id);
  }, `${editor.name} is now Building. You can continue editing it until the DM completes it.`);

  const deleteDraft = async () => {
    if (!editor || editor.status !== "draft") return;
    if (!window.confirm(`Delete the draft "${editor.name}"? This cannot be undone.`)) return;
    const deletedId = editor.id;
    const deletedName = editor.name;
    const serverBacked = data.builds.some((build) => build.id === deletedId);
    const nextBuild = visibleBuilds.find((build) => build.id !== deletedId) || null;
    setBusy("delete-draft");
    setError("");
    setNotice("");
    try {
      if (serverBacked) await deleteWorkshopDraft(deletedId, editor.revision);
      delete localDraftsRef.current[deletedId];
      setData((current) => ({ ...current, builds: current.builds.filter((build) => build.id !== deletedId) }));
      setEditor(null);
      setSelectedSlotId("");
      setSelectedBuildId(nextBuild?.id || "");
      setNotice(`${deletedName} deleted.`);
      if (serverBacked) await refresh();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy("");
    }
  };

  const assign = (slotId: string, componentId: string) => {
    if (!editor) return;
    rememberEditor({ ...editor, assignments: componentId ? [...editor.assignments.filter((entry) => entry.slotId !== slotId), { slotId, componentId }] : editor.assignments.filter((entry) => entry.slotId !== slotId) });
  };

  return <div className="space-y-3" style={{ color: theme.textColor }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-[17px] font-bold" style={{ color: theme.headerColor }}><Hammer size={18} /> Modular Workshop</div><div className="mt-0.5 text-[10px]" style={{ color: theme.labelColor }}>Assemble granted designs, reserve owned parts, and submit work for DM completion</div></div>
      <div className="flex items-center gap-2"><span className="px-3 py-1.5 text-[11px] font-bold" style={subPanel}><Coins size={12} className="mr-1 inline" /> {data.credits.toLocaleString()} CR</span><button className={button} onClick={() => void run("refresh", () => Promise.resolve(), "Workshop refreshed.")} disabled={Boolean(busy)}><RefreshCw size={13} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh</button></div>
    </div>

    {(error || notice) && <div className="px-3 py-2 text-[11px]" style={{ ...subPanel, borderColor: error ? "#8A3545" : "#2E7357", color: error ? "#FF9BA9" : "#8DE1B5" }}>{error || notice}</div>}

    <div className="flex flex-wrap gap-1 border-b pb-2" style={{ borderColor: theme.dividerColor }}>
      <SectionButton active={section === "builds"} onClick={() => setSection("builds")} icon={Wrench} label="Builds" theme={theme} />
      <SectionButton active={section === "storage"} onClick={() => setSection("storage")} icon={Boxes} label="Owned Parts" theme={theme} />
      <SectionButton active={section === "salvage"} onClick={() => setSection("salvage")} icon={ArchiveRestore} label="Salvage" theme={theme} />
    </div>

    {section === "builds" && <div className="grid min-h-[520px] gap-3 xl:grid-cols-[260px_1fr]">
      <aside className="p-2" style={panel}>
        <div className="mb-2 text-[9px] uppercase tracking-[0.12em]" style={{ color: theme.labelColor }}>Work orders</div>
        <div className="space-y-1">{visibleBuilds.map((build) => <button key={build.id} className="flex w-full items-center gap-2 px-2 py-2 text-left" style={{ background: selectedBuildId === build.id ? theme.cardBg : "transparent" }} onClick={() => setSelectedBuildId(build.id)}><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold">{build.name}</span><span className="block text-[9px]" style={{ color: STATUS_COLOR[build.status] }}>{build.status.toUpperCase()}{build.isRebuild ? " · REBUILD" : ""}{localDraftsRef.current[build.id] ? " · UNSAVED" : ""}</span></span><ChevronRight size={12} /></button>)}</div>
        <div className="my-3 border-t" style={{ borderColor: theme.dividerColor }} />
        <div className="mb-2 text-[9px] uppercase tracking-[0.12em]" style={{ color: theme.labelColor }}>Start a design</div>
        <div className="space-y-1">{data.blueprints.map((blueprint) => <button key={blueprint.id} className="flex w-full items-center gap-2 px-2 py-2 text-left hover:brightness-125" style={subPanel} onClick={() => createBuild(blueprint)}><Plus size={13} style={{ color: theme.accentColor }} /><span><span className="block text-[10px] font-bold">{blueprint.name}</span><span className="text-[8px]" style={{ color: theme.labelColor }}>{blueprint.category} · {blueprint.basePrice.toLocaleString()} CR base</span></span></button>)}</div>
      </aside>

      <section className="min-w-0 p-3" style={panel}>
        {!editor || !selectedBlueprint ? <div className="flex h-full items-center justify-center text-center text-[11px]" style={{ color: theme.labelColor }}>Choose a granted blueprint or an existing work order.</div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: theme.dividerColor }}><div><div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-bold">{editor.name}</span><span className="px-2 py-0.5 text-[9px] uppercase" style={{ background: `${STATUS_COLOR[editor.status]}22`, color: STATUS_COLOR[editor.status] }}>{editor.status}</span>{hasUnsavedChanges && <span className="px-2 py-0.5 text-[9px] uppercase text-[#F1D47A]" style={{ background: "#41340F" }}>Unsaved</span>}{editor.isRebuild && <span className="px-2 py-0.5 text-[9px] uppercase text-[#8AC8FF]" style={{ background: "#14334B" }}>Rebuild</span>}</div><div className="mt-1 text-[9px]" style={{ color: theme.labelColor }}>{selectedBlueprint.name} · design v{editor.blueprintVersion} · revision {editor.revision}</div></div><div className="text-right"><div className="text-[15px] font-bold" style={{ color: theme.accentColor }}>{quote?.totalCost.toLocaleString()} CR</div><div className="text-[8px]" style={{ color: theme.labelColor }}>{quote?.baseCost.toLocaleString()} base + {quote?.componentCost.toLocaleString()} ordered parts</div></div></div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,1.35fr)]"><label><span className="mb-1 block text-[8px] uppercase" style={{ color: theme.labelColor }}>Name</span><input className={input} style={{ background: theme.inputBg, color: theme.textColor }} disabled={!canEdit} value={editor.name} onChange={(event) => rememberEditor({ ...editor, name: event.target.value })} /></label><label><span className="mb-1 block text-[8px] uppercase" style={{ color: theme.labelColor }}>Designation</span><input className={input} style={{ background: theme.inputBg, color: theme.textColor }} disabled={!canEdit} value={editor.designation} onChange={(event) => rememberEditor({ ...editor, designation: event.target.value })} /></label><label><span className="mb-1 block text-[8px] uppercase" style={{ color: theme.labelColor }}>Build notes</span><textarea className={`${input} min-h-[36px] resize-y`} style={{ background: theme.inputBg, color: theme.textColor }} disabled={!canEdit} value={editor.notes} onChange={(event) => rememberEditor({ ...editor, notes: event.target.value })} placeholder="Assembly notes" /></label></div>

          {quote && <WorkshopBlueprintVisual blueprint={selectedBlueprint} build={editor} components={data.components} storage={data.storage} quote={quote} canEdit={Boolean(canEdit)} selectedSlotId={selectedSlotId} onSelectSlot={setSelectedSlotId} onAssign={assign} theme={theme} />}

          <div className="mt-4 grid gap-2 md:grid-cols-3"><div className="px-3 py-2 text-[10px]" style={subPanel}><span className="block text-[8px] uppercase" style={{ color: theme.labelColor }}>Readiness</span><span style={{ color: readiness?.ready && quote?.unavailable.length === 0 ? "#76D6A4" : "#FF9B87" }}>{readiness?.ready && quote?.unavailable.length === 0 ? "Ready for construction" : "Needs attention"}</span></div><div className="px-3 py-2 text-[10px]" style={subPanel}><span className="block text-[8px] uppercase" style={{ color: theme.labelColor }}>Parts</span>{quote?.ownedParts || 0} owned · {quote?.orderedParts || 0} ordered</div><div className="px-3 py-2 text-[10px]" style={subPanel}><span className="block text-[8px] uppercase" style={{ color: theme.labelColor }}>Credits after completion</span>{Math.max(0, data.credits - (quote?.totalCost || 0)).toLocaleString()} CR</div></div>
          {((readiness && !readiness.ready) || (quote?.unavailable.length || 0) > 0) && <div className="mt-2 flex gap-2 px-3 py-2 text-[10px] text-[#FFAD96]" style={subPanel}><AlertTriangle size={14} className="shrink-0" /><span>{readiness?.missing.length ? `Required: ${readiness.missing.join(", ")}. ` : ""}{readiness?.incompatible.length ? `Incompatible: ${readiness.incompatible.join(", ")}. ` : ""}{quote?.unavailable.length ? `Missing unorderable parts: ${quote.unavailable.join(", ")}.` : ""}</span></div>}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {editor.status === "draft" && <button className={`${button} text-[#FFB0BC]`} style={{ background: "#4A1B29" }} disabled={Boolean(busy)} onClick={() => void deleteDraft()}>{busy === "delete-draft" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete Draft</button>}
            {canEdit && <button className={button} disabled={Boolean(busy)} onClick={() => void save()}>{busy === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Changes</button>}
            {editor.status === "draft" && <button className={`${button} text-[#9FF0C5]`} style={{ background: "#174631" }} disabled={Boolean(busy) || !readiness?.ready || Boolean(quote?.unavailable.length)} onClick={() => void beginBuild()}><Hammer size={13} /> Build</button>}
            {editor.status === "completed" && <><button className={button} disabled={Boolean(busy)} onClick={() => void run("rebuild", () => rebuildWorkshopBuild(editor.id, editor.revision), `${editor.name} returned to the Workshop. Its parts are available for the rebuild.`)}><Wrench size={13} /> Rebuild</button><button className={`${button} text-[#FF9BA9]`} disabled={Boolean(busy)} onClick={() => void run("scrap", () => scrapWorkshopBuild(editor.id, editor.revision), `${editor.name} was scrapped. Its components were returned with no credit refund.`)}><Trash2 size={13} /> Scrap</button></>}
          </div>
          {editor.status === "building" && <div className="mt-3 flex items-center gap-2 px-3 py-2 text-[10px] text-[#F1D47A]" style={subPanel}><Loader2 size={13} className="animate-spin" /> Construction is awaiting DM completion. Saved edits update the live quote and component reservations.</div>}
          {editor.status === "completed" && <div className="mt-3 flex items-center gap-2 px-3 py-2 text-[10px] text-[#76D6A4]" style={subPanel}><CheckCircle2 size={13} /> Delivered to Inventory. Equipment-compatible effects activate through the normal equipment slots.</div>}
        </>}
      </section>
    </div>}

    {section === "storage" && <section className="p-4" style={panel}><div className="mb-3"><div className="text-[13px] font-bold">Facility Component Storage</div><div className="text-[9px]" style={{ color: theme.labelColor }}>Unorderable parts must be here before a build can begin. Completed-item scrap returns all installed parts here.</div></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.components.map((component) => <div key={component.id} className="flex items-center gap-3 px-3 py-2" style={subPanel}><Package size={16} style={{ color: theme.accentColor }} /><div className="min-w-0 flex-1"><div className="truncate text-[10px] font-bold">{component.name}</div><div className="text-[8px]" style={{ color: theme.labelColor }}>{component.category} · {component.orderable ? `${component.price.toLocaleString()} CR orderable` : "storage only"}</div></div><span className="text-[15px] font-bold">{data.storage.quantities[component.id] || 0}</span></div>)}</div></section>}

    {section === "salvage" && <section className="p-4" style={panel}><div className="mb-3"><div className="text-[13px] font-bold">Salvage Existing Items</div><div className="text-[9px]" style={{ color: theme.labelColor }}>Only items tagged Scrappable and covered by a DM salvage recipe can be dismantled. Parts return to Workshop storage; credits never do.</div></div>{externalScrappable.length === 0 ? <div className="p-8 text-center text-[10px]" style={{ ...subPanel, color: theme.labelColor }}>No eligible non-Workshop items are currently assigned to this profile.</div> : <div className="space-y-2">{externalScrappable.map((item) => { const recipe = data.salvageRecipes.find((entry) => entry.active && (entry.itemId === item.id || (entry.itemTag && item.tags.includes(entry.itemTag)))); return <div key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-3" style={subPanel}><ArchiveRestore size={16} style={{ color: theme.accentColor }} /><div className="min-w-0 flex-1"><div className="text-[11px] font-bold">{item.name}</div><div className="text-[8px]" style={{ color: theme.labelColor }}>{recipe ? `${recipe.name}: ${recipe.components.map((entry) => `${entry.quantity}× ${data.components.find((component) => component.id === entry.componentId)?.name || entry.componentId}`).join(", ")}` : "No active DM salvage recipe"}</div></div><button className={`${button} text-[#FFB0A5]`} disabled={!recipe || Boolean(busy)} onClick={() => void run(`salvage-${item.id}`, () => scrapWorkshopItem(item.id), `${item.name} salvaged into owned Workshop parts.`)}><Trash2 size={13} /> Salvage</button></div>; })}</div>}</section>}
  </div>;
}

function SectionButton({ active, onClick, icon: Icon, label, theme }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number }>; label: string; theme: PlayerTheme }) {
  return <button className={`${retro.button} inline-flex items-center gap-1.5 px-4 py-1.5 text-[10px]`} style={{ background: active ? theme.cardBg : theme.uiButtonBg, color: active ? theme.accentColor : theme.buttonColor }} onClick={onClick}><Icon size={13} /> {label}</button>;
}
