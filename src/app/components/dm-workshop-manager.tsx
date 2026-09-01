import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Boxes,
  Check,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileClock,
  Hammer,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { retro } from "./retro-styles";
import {
  completeWorkshopBuild,
  loadWorkshopAdminBootstrap,
  saveWorkshopBlueprint,
  saveWorkshopComponent,
  saveWorkshopSalvageRecipe,
  updateWorkshopAccess,
  updateWorkshopStorage,
  type WorkshopAdminBootstrap,
} from "@/lib/workshop-api";
import {
  createWorkshopId,
  normalizeWorkshopBlueprint,
  normalizeWorkshopComponent,
  normalizeWorkshopSalvageRecipe,
  type WorkshopAccess,
  type WorkshopBlueprint,
  type WorkshopComponent,
  type WorkshopEffect,
  type WorkshopSalvageRecipe,
  type WorkshopSlotDefinition,
} from "@/lib/workshop-model";

type View = "orders" | "access" | "blueprints" | "components" | "salvage" | "ledger";

const PANEL = { background: "#090D27", border: "1px solid #252C5E" } as const;
const SUB_PANEL = { background: "#070A20", border: "1px solid #1C224D" } as const;
const INPUT = `${retro.sunken} w-full bg-[#070A20] px-2.5 py-2 text-[12px] outline-none`;
const LABEL = "mb-1 block text-[9px] uppercase tracking-[0.12em] text-[#7D86B5]";
const BUTTON = `${retro.button} inline-flex items-center justify-center gap-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`;

const errorText = (error: unknown) => error instanceof Error ? error.message : "The Workshop request failed.";
const splitList = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const joinList = (value: string[]) => value.join(", ");

function emptyBlueprint(): WorkshopBlueprint {
  return normalizeWorkshopBlueprint({ id: createWorkshopId("blueprint"), name: "New Blueprint", active: true, version: 1, slots: [] });
}

function emptyComponent(): WorkshopComponent {
  return normalizeWorkshopComponent({ id: createWorkshopId("component"), name: "New Component", active: true, orderable: true, effects: [] });
}

function emptyRecipe(): WorkshopSalvageRecipe {
  return normalizeWorkshopSalvageRecipe({ id: createWorkshopId("salvage"), name: "New Salvage Recipe", itemTag: "Scrappable", active: true, components: [] });
}

function accessFor(data: WorkshopAdminBootstrap, playerId: string): WorkshopAccess {
  return data.accessRows.find((entry) => entry.playerId === playerId) || { playerId, enabled: false, blueprintIds: [], updatedAt: "", updatedBy: "" };
}

export function DMWorkshopManager({ initialData }: { initialData?: WorkshopAdminBootstrap } = {}) {
  const [view, setView] = useState<View>("orders");
  const [data, setData] = useState<WorkshopAdminBootstrap | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(initialData?.players[0]?.id || "");
  const [blueprintEditor, setBlueprintEditor] = useState<WorkshopBlueprint | null>(null);
  const [componentEditor, setComponentEditor] = useState<WorkshopComponent | null>(null);
  const [recipeEditor, setRecipeEditor] = useState<WorkshopSalvageRecipe | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadWorkshopAdminBootstrap();
      setData(next);
      setSelectedPlayerId((current) => current && next.players.some((player) => player.id === current) ? current : next.players[0]?.id || "");
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!initialData) void refresh(); }, [initialData, refresh]);

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

  const selectedAccess = data && selectedPlayerId ? accessFor(data, selectedPlayerId) : null;
  const selectedStorage = data?.storageRows.find((entry) => entry.playerId === selectedPlayerId)?.quantities || {};
  const playerName = useCallback((playerId: string) => data?.players.find((player) => player.id === playerId)?.name || playerId, [data]);
  const componentName = useCallback((componentId: string) => data?.components.find((component) => component.id === componentId)?.name || componentId, [data]);
  const blueprintName = useCallback((blueprintId: string) => data?.blueprints.find((blueprint) => blueprint.id === blueprintId)?.name || blueprintId, [data]);
  const buildingOrders = useMemo(() => data?.builds.filter((build) => build.status === "building") || [], [data]);

  const saveAccess = (access: WorkshopAccess) => run(
    `access-${access.playerId}`,
    () => updateWorkshopAccess(access.playerId, access.enabled, access.blueprintIds),
    `Workshop access updated for ${playerName(access.playerId)}.`,
  );

  const views: Array<{ id: View; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: "orders", label: `Build Orders${buildingOrders.length ? ` (${buildingOrders.length})` : ""}`, icon: ClipboardCheck },
    { id: "access", label: "Player Access", icon: UserCog },
    { id: "blueprints", label: "Blueprints", icon: Wrench },
    { id: "components", label: "Components", icon: Boxes },
    { id: "salvage", label: "Salvage", icon: ArchiveRestore },
    { id: "ledger", label: "History", icon: FileClock },
  ];

  if (loading && !data) return <div className="flex min-h-[360px] items-center justify-center gap-2 text-[12px] text-[#98A2D6]"><Loader2 size={16} className="animate-spin" /> Loading Workshop administration...</div>;

  return (
    <div className="space-y-3 text-[#D9DEFF]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <div className="flex items-center gap-2 text-[18px] font-bold text-[#F1D47A]"><Hammer size={18} /> Modular Workshop</div>
          <div className="mt-0.5 text-[10px] text-[#7D86B5]">Protected access, component catalog, work orders, and salvage control</div>
        </div>
        <button className={BUTTON} onClick={() => void refresh()} disabled={loading}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button>
      </div>

      {(error || notice) && <div className="px-3 py-2 text-[11px]" style={{ ...SUB_PANEL, borderColor: error ? "#7E3040" : "#28634E", color: error ? "#FF9BA9" : "#8DE1B5" }}>{error || notice}</div>}

      <div className="flex flex-wrap gap-1 border-b border-[#252C5E] pb-2">
        {views.map((entry) => <button key={entry.id} className={`${BUTTON} ${view === entry.id ? "bg-[#232A61] text-[#F1D47A]" : ""}`} onClick={() => setView(entry.id)}><entry.icon size={13} /> {entry.label}</button>)}
      </div>

      {data && view === "orders" && (
        <div className="space-y-2">
          {buildingOrders.length === 0 && <div className="p-8 text-center text-[11px] text-[#7780AE]" style={PANEL}>No builds are waiting for DM completion.</div>}
          {buildingOrders.map((build) => {
            const blueprint = data.blueprints.find((entry) => entry.id === build.blueprintId);
            return (
              <section key={build.id} className="grid gap-3 p-3 md:grid-cols-[1fr_auto]" style={PANEL}>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-bold text-white">{build.name}</span><span className="bg-[#3B2F12] px-2 py-0.5 text-[9px] uppercase text-[#F1D47A]">Building</span>{build.isRebuild && <span className="bg-[#17334D] px-2 py-0.5 text-[9px] uppercase text-[#81C8FF]">Rebuild</span>}</div>
                  <div className="mt-1 text-[10px] text-[#98A2D6]">{playerName(build.playerId)} · {blueprint?.name || build.blueprintId} · revision {build.revision}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]"><span><Coins size={11} className="mr-1 inline" />Quoted: {build.quotedCost.toLocaleString()} CR</span><span>{build.assignments.length}/{blueprint?.slots.length || 0} slots assigned</span><span>{Object.values(build.storageReservation).reduce((sum, value) => sum + value, 0)} owned parts reserved</span></div>
                  {build.notes && <div className="mt-2 text-[10px] text-[#AAB2DD]">{build.notes}</div>}
                </div>
                <button className={`${BUTTON} min-w-[150px] bg-[#174631] text-[#9FF0C5]`} disabled={busy === build.id} onClick={() => void run(build.id, () => completeWorkshopBuild(build.id, build.revision), `${build.name} completed and delivered.`)}>{busy === build.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Complete Construction</button>
              </section>
            );
          })}
        </div>
      )}

      {data && view === "access" && (
        <div className="grid min-h-[440px] min-w-0 gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-w-0 self-start space-y-1 p-2" style={PANEL}>
            {data.players.map((player) => {
              const access = accessFor(data, player.id);
              return <button key={player.id} className={`box-border flex w-full max-w-full items-center justify-between px-3 py-2 text-left text-[11px] ${selectedPlayerId === player.id ? "bg-[#232A61] text-white" : "hover:bg-[#11173B]"}`} onClick={() => setSelectedPlayerId(player.id)}><span>{player.name}</span><span className={access.enabled ? "text-[#72D9A6]" : "text-[#68709A]"}>{access.enabled ? "Enabled" : "Hidden"}</span></button>;
            })}
          </aside>
          {selectedAccess && <section className="min-w-0 space-y-4 p-4" style={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252C5E] pb-3">
              <div><div className="text-[15px] font-bold text-white">{playerName(selectedPlayerId)}</div><div className="text-[10px] text-[#7D86B5]">Workshop visibility and individually granted designs</div></div>
              <label className="flex cursor-pointer items-center gap-2 text-[11px]"><input type="checkbox" disabled={Boolean(busy)} checked={selectedAccess.enabled} onChange={(event) => void saveAccess({ ...selectedAccess, enabled: event.target.checked })} /> Workshop enabled</label>
            </div>
            <div>
              <div className={LABEL}>Blueprint access</div>
              <div className="grid gap-2 md:grid-cols-2">
                {data.blueprints.map((blueprint) => {
                  const checked = selectedAccess.blueprintIds.includes(blueprint.id);
                  return <label key={blueprint.id} className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2" style={SUB_PANEL}><span><span className="block text-[11px] text-white">{blueprint.name}</span><span className="text-[9px] text-[#727BAA]">{blueprint.category} · v{blueprint.version}{!blueprint.active ? " · inactive" : ""}</span></span><input type="checkbox" disabled={Boolean(busy)} checked={checked} onChange={() => void saveAccess({ ...selectedAccess, blueprintIds: checked ? selectedAccess.blueprintIds.filter((id) => id !== blueprint.id) : [...selectedAccess.blueprintIds, blueprint.id] })} /></label>;
                })}
              </div>
            </div>
            <div>
              <div className={LABEL}>Owned component storage</div>
              <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                {data.components.map((component) => <div key={component.id} className="box-border flex min-w-0 w-full max-w-full items-center gap-2 px-2 py-1.5" style={SUB_PANEL}><div className="min-w-0 flex-1"><div className="truncate text-[10px] text-white">{component.name}</div><div className="text-[8px] text-[#727BAA]">{component.orderable ? `${component.price.toLocaleString()} CR to order` : "Unorderable"}</div></div><button className={`${BUTTON} !px-2`} title="Remove one" disabled={(selectedStorage[component.id] || 0) <= 0 || Boolean(busy)} onClick={() => void run(`storage-${component.id}`, () => updateWorkshopStorage(selectedPlayerId, component.id, -1), "Component storage updated.")}>−</button><span className="w-7 text-center text-[11px] font-bold">{selectedStorage[component.id] || 0}</span><button className={`${BUTTON} !px-2`} title="Add one" disabled={Boolean(busy)} onClick={() => void run(`storage-${component.id}`, () => updateWorkshopStorage(selectedPlayerId, component.id, 1), "Component distributed.")}>+</button></div>)}
              </div>
            </div>
          </section>}
        </div>
      )}

      {data && view === "blueprints" && (
        <CatalogEditorLayout
          title="Blueprint Catalog"
          entries={data.blueprints.map((entry) => ({ id: entry.id, title: entry.name, subtitle: `${entry.category} · v${entry.version}${entry.active ? "" : " · inactive"}` }))}
          selectedId={blueprintEditor?.id || ""}
          onSelect={(id) => setBlueprintEditor(structuredClone(data.blueprints.find((entry) => entry.id === id)!))}
          onCreate={() => setBlueprintEditor(emptyBlueprint())}
        >
          {blueprintEditor && <BlueprintEditor value={blueprintEditor} onChange={setBlueprintEditor} onClose={() => setBlueprintEditor(null)} onSave={() => void run("save-blueprint", () => saveWorkshopBlueprint(blueprintEditor), `${blueprintEditor.name} saved.`)} saving={busy === "save-blueprint"} />}
        </CatalogEditorLayout>
      )}

      {data && view === "components" && (
        <CatalogEditorLayout
          title="Component Catalog"
          entries={data.components.map((entry) => ({ id: entry.id, title: entry.name, subtitle: `${entry.category} · ${entry.orderable ? `${entry.price.toLocaleString()} CR` : "unorderable"}${entry.active ? "" : " · inactive"}` }))}
          selectedId={componentEditor?.id || ""}
          onSelect={(id) => setComponentEditor(structuredClone(data.components.find((entry) => entry.id === id)!))}
          onCreate={() => setComponentEditor(emptyComponent())}
        >
          {componentEditor && <ComponentEditor value={componentEditor} onChange={setComponentEditor} onClose={() => setComponentEditor(null)} onSave={() => void run("save-component", () => saveWorkshopComponent(componentEditor), `${componentEditor.name} saved.`)} saving={busy === "save-component"} />}
        </CatalogEditorLayout>
      )}

      {data && view === "salvage" && (
        <CatalogEditorLayout
          title="DM Salvage Recipes"
          entries={data.salvageRecipes.map((entry) => ({ id: entry.id, title: entry.name, subtitle: entry.itemId ? `Item: ${entry.itemId}` : `Tag: ${entry.itemTag || "none"}` }))}
          selectedId={recipeEditor?.id || ""}
          onSelect={(id) => setRecipeEditor(structuredClone(data.salvageRecipes.find((entry) => entry.id === id)!))}
          onCreate={() => setRecipeEditor(emptyRecipe())}
        >
          {recipeEditor && <RecipeEditor value={recipeEditor} components={data.components} onChange={setRecipeEditor} onClose={() => setRecipeEditor(null)} onSave={() => void run("save-recipe", () => saveWorkshopSalvageRecipe(recipeEditor), `${recipeEditor.name} saved.`)} saving={busy === "save-recipe"} />}
        </CatalogEditorLayout>
      )}

      {data && view === "ledger" && <div className="overflow-hidden" style={PANEL}>
        <div className="grid grid-cols-[150px_130px_120px_1fr] gap-2 border-b border-[#252C5E] px-3 py-2 text-[9px] uppercase text-[#727BAA]"><span>Time</span><span>Player</span><span>Action</span><span>Detail</span></div>
        {data.ledger.map((entry) => <div key={String(entry.id)} className="grid grid-cols-[150px_130px_120px_1fr] gap-2 border-b border-[#151A3D] px-3 py-2 text-[10px]"><span className="text-[#7D86B5]">{new Date(String(entry.createdAt || "")).toLocaleString()}</span><span>{playerName(String(entry.playerId || ""))}</span><span className="uppercase text-[#F1D47A]">{String(entry.action || "")}</span><span className="text-[#AAB2DD]">{String(entry.detail || "")}</span></div>)}
        {data.ledger.length === 0 && <div className="p-8 text-center text-[11px] text-[#727BAA]">No Workshop history yet.</div>}
      </div>}

      {data && view === "blueprints" && !blueprintEditor && <section className="p-4" style={PANEL}><div className="mb-2 text-[12px] font-bold text-[#F1D47A]">Saint Gregory reference build</div><div className="text-[11px] text-[#AAB2DD]">{data.sampleBuild.name} demonstrates the Humanoid Robot blueprint with {data.sampleBuild.assignments.length} assigned systems. It remains a read-only reference and does not create inventory or charge a player.</div></section>}
    </div>
  );
}

function CatalogEditorLayout({ title, entries, selectedId, onSelect, onCreate, children }: { title: string; entries: Array<{ id: string; title: string; subtitle: string }>; selectedId: string; onSelect: (id: string) => void; onCreate: () => void; children: React.ReactNode }) {
  return <div className="grid min-h-[500px] min-w-0 gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="min-w-0 self-start p-2" style={PANEL}><div className="mb-2 flex items-center justify-between px-1"><span className="text-[11px] font-bold text-white">{title}</span><button className={`${BUTTON} !px-2`} onClick={onCreate}><Plus size={12} /> New</button></div><div className="space-y-1">{entries.map((entry) => <button key={entry.id} className={`box-border flex w-full max-w-full items-center gap-2 px-2 py-2 text-left ${selectedId === entry.id ? "bg-[#232A61]" : "hover:bg-[#11173B]"}`} onClick={() => onSelect(entry.id)}><span className="min-w-0 flex-1"><span className="block truncate text-[11px] text-white">{entry.title}</span><span className="block truncate text-[9px] text-[#727BAA]">{entry.subtitle}</span></span><ChevronRight size={12} /></button>)}</div></aside>
    <section className="min-w-0 p-4" style={PANEL}>{children || <div className="flex h-full items-center justify-center text-[11px] text-[#727BAA]">Select an entry or create a new one.</div>}</section>
  </div>;
}

function EditorHeader({ title, saving, onSave, onClose }: { title: string; saving: boolean; onSave: () => void; onClose: () => void }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#252C5E] pb-3"><div className="text-[14px] font-bold text-white">{title}</div><div className="flex gap-1"><button className={BUTTON} onClick={onClose}><X size={13} /> Close</button><button className={`${BUTTON} bg-[#174631] text-[#9FF0C5]`} disabled={saving} onClick={onSave}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button></div></div>;
}

function BlueprintEditor({ value, onChange, onSave, onClose, saving }: { value: WorkshopBlueprint; onChange: (value: WorkshopBlueprint) => void; onSave: () => void; onClose: () => void; saving: boolean }) {
  const set = <K extends keyof WorkshopBlueprint>(key: K, next: WorkshopBlueprint[K]) => onChange({ ...value, [key]: next });
  const updateSlot = (index: number, patch: Partial<WorkshopSlotDefinition>) => set("slots", value.slots.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  return <div><EditorHeader title={value.name} saving={saving} onSave={onSave} onClose={onClose} /><div className="grid gap-3 md:grid-cols-2"><Field label="Name"><input className={INPUT} value={value.name} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Category"><input className={INPUT} value={value.category} onChange={(event) => set("category", event.target.value)} /></Field><Field label="Base construction price"><input className={INPUT} type="number" min="0" value={value.basePrice} onChange={(event) => set("basePrice", Number(event.target.value))} /></Field><Field label="Rebuild fee"><input className={INPUT} type="number" min="0" value={value.rebuildFee} onChange={(event) => set("rebuildFee", Number(event.target.value))} /></Field><Field label="Output item type"><input className={INPUT} value={value.outputType} onChange={(event) => set("outputType", event.target.value)} /></Field><Field label="Output rarity"><input className={INPUT} value={value.outputRarity} onChange={(event) => set("outputRarity", event.target.value)} /></Field><Field label="Output tags (comma separated)"><input className={INPUT} value={joinList(value.outputTags)} onChange={(event) => set("outputTags", splitList(event.target.value))} /></Field><Field label="Allowed equipment slots (comma separated)"><input className={INPUT} value={joinList(value.equipSlots)} onChange={(event) => set("equipSlots", splitList(event.target.value))} /></Field><Field label="Description" wide><textarea className={`${INPUT} min-h-20`} value={value.description} onChange={(event) => set("description", event.target.value)} /></Field><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={value.active} onChange={(event) => set("active", event.target.checked)} /> Active blueprint</label></div><div className="mt-5 flex items-center justify-between"><div><div className="text-[11px] font-bold text-[#F1D47A]">Assembly slots</div><div className="text-[9px] text-[#727BAA]">Compatible tags use any-one matching when tags are specified.</div></div><button className={BUTTON} onClick={() => set("slots", [...value.slots, { id: createWorkshopId("slot"), group: "GENERAL", label: "New Slot", description: "", required: true, acceptedCategories: [], acceptedTags: [] }])}><Plus size={12} /> Slot</button></div><div className="mt-2 space-y-2">{value.slots.map((slot, index) => <div key={slot.id} className="grid gap-2 p-2 md:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]" style={SUB_PANEL}><input className={INPUT} value={slot.label} aria-label="Slot label" onChange={(event) => updateSlot(index, { label: event.target.value })} /><input className={INPUT} value={slot.group} aria-label="Slot group" onChange={(event) => updateSlot(index, { group: event.target.value })} /><input className={INPUT} value={joinList(slot.acceptedCategories)} aria-label="Compatible categories" placeholder="Compatible categories" onChange={(event) => updateSlot(index, { acceptedCategories: splitList(event.target.value) })} /><input className={INPUT} value={joinList(slot.acceptedTags)} aria-label="Compatible tags" placeholder="Compatible tags" onChange={(event) => updateSlot(index, { acceptedTags: splitList(event.target.value) })} /><div className="flex items-center gap-1"><label className="flex items-center gap-1 text-[9px]"><input type="checkbox" checked={slot.required} onChange={(event) => updateSlot(index, { required: event.target.checked })} /> Req.</label><button className={`${BUTTON} !px-2 text-[#FF8998]`} title="Remove slot" onClick={() => set("slots", value.slots.filter((_, entryIndex) => entryIndex !== index))}><Trash2 size={12} /></button></div></div>)}</div></div>;
}

function ComponentEditor({ value, onChange, onSave, onClose, saving }: { value: WorkshopComponent; onChange: (value: WorkshopComponent) => void; onSave: () => void; onClose: () => void; saving: boolean }) {
  const set = <K extends keyof WorkshopComponent>(key: K, next: WorkshopComponent[K]) => onChange({ ...value, [key]: next });
  const updateEffect = (index: number, patch: Partial<WorkshopEffect>) => set("effects", value.effects.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  return <div><EditorHeader title={value.name} saving={saving} onSave={onSave} onClose={onClose} /><div className="grid gap-3 md:grid-cols-2"><Field label="Name"><input className={INPUT} value={value.name} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Component category"><input className={INPUT} value={value.category} onChange={(event) => set("category", event.target.value)} /></Field><Field label="Order price"><input className={INPUT} type="number" min="0" value={value.price} onChange={(event) => set("price", Number(event.target.value))} /></Field><Field label="Compatible tags (comma separated)"><input className={INPUT} value={joinList(value.tags)} onChange={(event) => set("tags", splitList(event.target.value))} /></Field><Field label="Description" wide><textarea className={`${INPUT} min-h-20`} value={value.description} onChange={(event) => set("description", event.target.value)} /></Field><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={value.orderable} onChange={(event) => set("orderable", event.target.checked)} /> Players may order this part with credits</label><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={value.active} onChange={(event) => set("active", event.target.checked)} /> Active component</label></div><div className="mt-5 flex items-center justify-between"><div><div className="text-[11px] font-bold text-[#F1D47A]">Effects</div><div className="text-[9px] text-[#727BAA]">Use keys like Attribute::STR, Skill::Firearms, Resource::Armor Class, or Armor for native equipment bonuses.</div></div><button className={BUTTON} onClick={() => set("effects", [...value.effects, { id: createWorkshopId("effect"), label: "New Effect", kind: "rule", key: "", mode: "grant", value: 0, text: "", applyWhenEquipped: false }])}><Plus size={12} /> Effect</button></div><div className="mt-2 space-y-2">{value.effects.map((effect, index) => <div key={effect.id} className="grid gap-2 p-2 md:grid-cols-[1fr_100px_1fr_90px_1.4fr_auto]" style={SUB_PANEL}><input className={INPUT} value={effect.label} aria-label="Effect label" onChange={(event) => updateEffect(index, { label: event.target.value })} /><select className={INPUT} value={effect.kind} onChange={(event) => updateEffect(index, { kind: event.target.value as WorkshopEffect["kind"] })}><option value="stat">Stat</option><option value="dice">Dice</option><option value="rule">Rule</option></select><input className={INPUT} value={effect.key} placeholder="Effect key" onChange={(event) => updateEffect(index, { key: event.target.value })} /><input className={INPUT} type="number" value={effect.value} aria-label="Effect value" onChange={(event) => updateEffect(index, { value: Number(event.target.value) })} /><input className={INPUT} value={effect.text} placeholder="Displayed effect / dice" onChange={(event) => updateEffect(index, { text: event.target.value })} /><div className="flex items-center gap-1"><label className="text-[8px] text-[#8D96C3]"><input type="checkbox" checked={effect.applyWhenEquipped} onChange={(event) => updateEffect(index, { applyWhenEquipped: event.target.checked })} /> Equip</label><button className={`${BUTTON} !px-2 text-[#FF8998]`} title="Remove effect" onClick={() => set("effects", value.effects.filter((_, entryIndex) => entryIndex !== index))}><Trash2 size={12} /></button></div></div>)}</div></div>;
}

function RecipeEditor({ value, components, onChange, onSave, onClose, saving }: { value: WorkshopSalvageRecipe; components: WorkshopComponent[]; onChange: (value: WorkshopSalvageRecipe) => void; onSave: () => void; onClose: () => void; saving: boolean }) {
  const set = <K extends keyof WorkshopSalvageRecipe>(key: K, next: WorkshopSalvageRecipe[K]) => onChange({ ...value, [key]: next });
  return <div><EditorHeader title={value.name} saving={saving} onSave={onSave} onClose={onClose} /><div className="grid gap-3 md:grid-cols-2"><Field label="Recipe name"><input className={INPUT} value={value.name} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Exact item ID (optional)"><input className={INPUT} value={value.itemId} onChange={(event) => set("itemId", event.target.value)} /></Field><Field label="Matching item tag"><input className={INPUT} value={value.itemTag} onChange={(event) => set("itemTag", event.target.value)} /></Field><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={value.active} onChange={(event) => set("active", event.target.checked)} /> Active recipe</label></div><div className="mt-5 flex items-center justify-between"><span className="text-[11px] font-bold text-[#F1D47A]">Returned owned parts</span><button className={BUTTON} onClick={() => set("components", [...value.components, { componentId: components[0]?.id || "", quantity: 1 }])}><PackagePlus size={12} /> Part</button></div><div className="mt-2 space-y-1">{value.components.map((entry, index) => <div key={`${entry.componentId}-${index}`} className="grid grid-cols-[1fr_100px_auto] gap-2 p-2" style={SUB_PANEL}><select className={INPUT} value={entry.componentId} onChange={(event) => set("components", value.components.map((item, itemIndex) => itemIndex === index ? { ...item, componentId: event.target.value } : item))}>{components.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}</select><input className={INPUT} type="number" min="1" value={entry.quantity} onChange={(event) => set("components", value.components.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(1, Number(event.target.value)) } : item))} /><button className={`${BUTTON} !px-2 text-[#FF8998]`} onClick={() => set("components", value.components.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={12} /></button></div>)}</div></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className={LABEL}>{label}</span>{children}</label>;
}
