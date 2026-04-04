import React, { useMemo, useRef, useState } from "react";
import { retro } from "./retro-styles";
import { RichTextEditor } from "./rich-text-editor";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import type { ManagedItem, PlayerData, TagDefinition, TagField } from "./types";
import {
  DM_DIVIDER,
  DM_EFFECT_HDR,
  DM_EFFECT_LABEL,
  DM_LOCKED_BADGE,
  DM_PURPLE,
  DM_TAG_BADGE,
  dmActiveBtn,
  dmAssignDim,
  dmLockColor,
  dmRarityBadge,
  dmTabStyle,
  S_ACCENT,
  S_ACCENT_HDR,
  S_GREEN_BTN,
  S_MUTED,
  S_RED,
  S_SECTION_HDR,
  S_TEXT,
  S_TEXT_BOLD,
} from "./dm-styles";
import { Plus, Save, Edit, Trash2, X, Lock, Copy } from "lucide-react";

interface DMItemManagerSectionProps {
  players: PlayerData[];
  managedItems: ManagedItem[];
  itemTags: TagDefinition[];
  statusTags: TagDefinition[];
  onPersistItems: (next: ManagedItem[]) => Promise<void>;
}

const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;
const labelStyle = { color: "#5A6A8A" } as const;
const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;

function formatOwners(assignedTo: string[], players: { id: string; name: string }[]) {
  if (assignedTo.includes("all")) return "All Players";
  if (assignedTo.length === 0) return "Unassigned";
  return assignedTo.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

function getActiveCustomFields(entity: { tags: string[] }, tagList: TagDefinition[]): { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] {
  const fields: { tagName: string; fieldName: string; key: string; fieldDef: TagField }[] = [];
  entity.tags.forEach((tagName) => {
    const tagDef = tagList.find((t) => t.name === tagName);
    if (tagDef && tagDef.fields.length > 0) {
      tagDef.fields.forEach((f) => {
        fields.push({ tagName, fieldName: f.name, key: cfKey(tagName, f.name), fieldDef: f });
      });
    }
  });
  return fields;
}

const rarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];
const rarityColor = (r: string) => {
  switch (r) {
    case "Uncommon": return "#7ACA8A";
    case "Rare": return "#4A9AFF";
    case "Very Rare": return "#C4A0FF";
    case "Legendary": return "#FFAA4A";
    default: return "#9AAACC";
  }
};

export function DMItemManagerSection({ players, managedItems, itemTags, statusTags, onPersistItems }: DMItemManagerSectionProps) {
  const [itemFilterTab, setItemFilterTab] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<ManagedItem | null>(null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const originalAssignedToRef = useRef<string[]>([]);

  const updateItemField = <K extends keyof ManagedItem>(key: K, value: ManagedItem[K]) => {
    if (editingItem) setEditingItem({ ...editingItem, [key]: value });
  };

  const updateItemCustomField = (key: string, value: string) => {
    if (!editingItem) return;
    setEditingItem({ ...editingItem, customFields: { ...editingItem.customFields, [key]: value } });
  };

  const toggleItemTag = (tagName: string) => {
    if (!editingItem) return;
    const has = editingItem.tags.includes(tagName);
    updateItemField("tags", has ? editingItem.tags.filter((t) => t !== tagName) : [...editingItem.tags, tagName]);
  };

  const handleAddItem = () => {
    setEditingItem({ id: `mi-${Date.now()}`, name: "", rarity: "Common", type: "", tags: [], description: "", assignedTo: [], customFields: {} });
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
  };

  const handleCancelItemEdit = () => {
    setEditingItem(null);
    setIsAddingNewItem(false);
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;
    if (isAddingNewItem) {
      await onPersistItems([...managedItems, editingItem]);
    } else {
      const originalPlayers = originalAssignedToRef.current;
      const resolveIds = (arr: string[]) => arr.includes("all") ? players.map((p) => p.id) : arr;
      const oldIds = new Set(resolveIds(originalPlayers));
      const newIds = resolveIds(editingItem.assignedTo);
      const newlyAdded = newIds.filter((id) => !oldIds.has(id));
      let updated = managedItems.map((i) => (i.id === editingItem.id ? editingItem : i));
      for (const playerId of newlyAdded) {
        const duplicate: ManagedItem = {
          ...editingItem,
          id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          assignedTo: [playerId],
          customFields: { ...editingItem.customFields },
          duplicatedFrom: editingItem.name || "Unknown Item",
        };
        updated = [...updated, duplicate];
      }
      if (newlyAdded.length > 0) {
        const newlyAddedSet = new Set(newlyAdded);
        updated = updated.map((i) => {
          if (i.id === editingItem.id) {
            const kept = editingItem.assignedTo.includes("all")
              ? resolveIds(editingItem.assignedTo).filter((id) => !newlyAddedSet.has(id))
              : editingItem.assignedTo.filter((id) => !newlyAddedSet.has(id));
            return { ...i, assignedTo: kept };
          }
          return i;
        });
      }
      await onPersistItems(updated);
    }
    setEditingItem(null);
    setIsAddingNewItem(false);
  };

  const handleDeleteItem = async (id: string) => {
    const next = managedItems.filter((i) => i.id !== id);
    await onPersistItems(next);
    if (editingItem?.id === id) {
      setEditingItem(null);
      setIsAddingNewItem(false);
    }
  };

  const activeCustomFields = useMemo(() => editingItem ? getActiveCustomFields(editingItem, itemTags) : [], [editingItem, itemTags]);
  const filteredItems = useMemo(() => itemFilterTab === "all" ? managedItems : itemFilterTab === "ownerless" ? managedItems.filter((i) => i.assignedTo.length === 0) : managedItems.filter((i) => i.assignedTo.includes("all") || i.assignedTo.includes(itemFilterTab)), [itemFilterTab, managedItems]);

  const renderTypedField = (key: string, fieldDef: TagField, value: string, onChange: (key: string, val: string) => void, labelEl: React.ReactNode) => renderTypedFieldShared(key, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Items</h2>
        <button onClick={handleAddItem} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}><Plus size={14} /> Add Item</button>
      </div>

      {editingItem && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[12px]" style={S_SECTION_HDR}>{isAddingNewItem ? "ADD NEW ITEM" : `EDITING: ${editingItem.name || "(unnamed)"}`}</div>
            <button onClick={handleCancelItemEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div><label className="text-[10px] block mb-1" style={labelStyle}>Item Name:</label><input type="text" value={editingItem.name} onChange={(e) => updateItemField("name", e.target.value)} placeholder="Enter item name..." className={inputClass} style={inputStyle} /></div>
            <div><label className="text-[10px] block mb-1" style={labelStyle}>Item Type:</label><input type="text" value={editingItem.type} onChange={(e) => updateItemField("type", e.target.value)} placeholder="e.g., Weapon, Armor, Tool..." className={inputClass} style={inputStyle} /></div>
            <div><label className="text-[10px] block mb-1" style={labelStyle}>Rarity:</label><select value={editingItem.rarity} onChange={(e) => updateItemField("rarity", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`} style={{ color: rarityColor(editingItem.rarity) }}>{rarities.map((r) => <option key={r} value={r} style={{ color: rarityColor(r) }}>{r}</option>)}</select></div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players:</label>
            <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full md:w-2/3`}>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input type="checkbox" checked={editingItem.assignedTo.includes("all")} onChange={(e) => { if (e.target.checked) updateItemField("assignedTo", ["all"]); else updateItemField("assignedTo", []); }} className="accent-[#4A9A5A]" />
                <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
              </label>
              <div className="h-[1px] mb-2" style={DM_DIVIDER} />
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {players.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" disabled={editingItem.assignedTo.includes("all")} checked={editingItem.assignedTo.includes("all") || editingItem.assignedTo.includes(p.id)} onChange={(e) => { const current = editingItem.assignedTo.filter((id) => id !== "all"); if (e.target.checked) updateItemField("assignedTo", [...current, p.id]); else updateItemField("assignedTo", current.filter((id) => id !== p.id)); }} className="accent-[#4A7BFF]" />
                    <span className="text-[12px]" style={dmAssignDim(editingItem.assignedTo.includes("all"))}>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!editingItem.locked} onChange={(e) => updateItemField("locked", e.target.checked)} className="accent-[#FF6A6A]" /><span className="text-[12px] flex items-center gap-1.5" style={dmLockColor(!!editingItem.locked)}><Lock size={12} />{editingItem.locked ? "Locked — players cannot edit this item" : "Unlocked — players can edit this item"}</span></label></div>

          <div className="mb-4">
            <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
            <div className="flex flex-wrap gap-1.5">
              {itemTags.map((tag) => { const active = editingItem.tags.includes(tag.name); const hasFields = tag.fields.length > 0; return <button key={tag.id} onClick={() => toggleItemTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={dmActiveBtn(active)}>{tag.name}{hasFields && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}</button>; })}
              {itemTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No tags defined. Create tags in "Manage Tags" first.</span>}
            </div>
          </div>

          {activeCustomFields.length > 0 && <div className="mb-4"><div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div><div className={`${retro.raised} bg-[#0E0E35] p-3`}><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{activeCustomFields.map((cf) => {
            const labelEl = <label className="text-[10px] block mb-1" style={S_ACCENT}><span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:</label>;
            if (cf.tagName === "Equipment" && cf.fieldName === "Slot") {
              const EQUIP_SLOTS = [{ id: "head", label: "Head" }, { id: "face", label: "Face" }, { id: "neck", label: "Neck" }, { id: "jacket", label: "Jacket / Cloak" }, { id: "armor", label: "Armor" }, { id: "shirt", label: "Shirt" }, { id: "armguards", label: "Armguards" }, { id: "gloves", label: "Gloves" }, { id: "weapon_l", label: "Weapon (L)" }, { id: "weapon_r", label: "Weapon (R)" }, { id: "belt", label: "Belt" }, { id: "belt_slot", label: "Belt Slot" }, { id: "leggings", label: "Leggings" }, { id: "shoes", label: "Shoes" }, { id: "ring", label: "Ring (any)" }];
              return <div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Slot —</option>{EQUIP_SLOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>;
            }
            if (cf.tagName === "Attribute Buff" && cf.fieldName === "Attribute") {
              const ATTRS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
              return <div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Attribute —</option>{ATTRS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>;
            }
            if ((cf.tagName === "Attribute Buff" || cf.tagName === "Skill Buff" || cf.tagName === "Resources Buff") && cf.fieldName === "Amount") return <div key={cf.key}>{labelEl}<input type="number" value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="e.g. +2 or -1" className={inputClass} style={inputStyle} /></div>;
            if ((cf.tagName === "Skill Buff" || cf.tagName === "Disadvantageous") && cf.fieldName === "Skill") {
              const ALL_SKILLS = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
              return <div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Skill —</option>{ALL_SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>;
            }
            if (cf.tagName === "Resources Buff" && cf.fieldName === "Resource") {
              const ALL_RESOURCES = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
              return <div key={cf.key}>{labelEl}<select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Resource —</option>{ALL_RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>;
            }
            if (cf.tagName === "Status Effect" && cf.fieldName === "Effect Name") {
              const existingEffects = statusTags.map((t) => t.name);
              const currentVal = editingItem.customFields[cf.key] || "";
              const isCustom = currentVal !== "" && !existingEffects.includes(currentVal);
              const showTextInput = isCustom || currentVal === "";
              return <div key={cf.key}>{labelEl}<select value={isCustom ? "__custom__" : currentVal} onChange={(e) => updateItemCustomField(cf.key, e.target.value === "__custom__" ? "" : e.target.value)} className={inputClass} style={inputStyle}><option value="">— Select Status Effect —</option>{existingEffects.map((e) => <option key={e} value={e}>{e}</option>)}<option value="__custom__">✎ Custom (type below)...</option></select>{showTextInput && <input type="text" value={isCustom ? currentVal : ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="Or type a new status effect name..." className={`${inputClass} mt-1`} style={inputStyle} />}</div>;
            }
            return renderTypedField(cf.key, cf.fieldDef, editingItem.customFields[cf.key] || cf.fieldDef.defaultValue || "", updateItemCustomField, labelEl);
          })}</div></div></div>}

          <div className="mb-4"><label className="text-[10px] block mb-1" style={labelStyle}>Item Description:</label><RichTextEditor value={editingItem.description} onChange={(html) => updateItemField("description", html)} placeholder="Enter item description..." minHeight={80} /></div>

          {editingItem.tags.includes("Effect") && (() => {
            const effectKeys = Object.keys(editingItem.customFields ?? {}).filter((k) => k.startsWith("Effect::")).sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]));
            if (effectKeys.length === 0) effectKeys.push("Effect::0");
            const nextIdx = effectKeys.length > 0 ? Math.max(...effectKeys.map((k) => parseInt(k.split("::")[1]))) + 1 : 0;
            return <div className="mb-4"><div className="flex items-center justify-between mb-2"><div className="text-[10px]" style={DM_EFFECT_HDR}>EFFECT DESCRIPTIONS</div><button onClick={() => updateItemCustomField(`Effect::${nextIdx}`, "")} className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`} style={DM_PURPLE}><Plus size={10} /> Add Effect</button></div><div className="space-y-3">{effectKeys.map((key, i) => <div key={key} className={`${retro.raised} bg-[#0E0E35] p-3`}><div className="flex items-center justify-between mb-1"><label className="text-[9px]" style={DM_EFFECT_LABEL}>Effect #{i + 1}</label>{effectKeys.length > 1 && <button onClick={() => { const cf = { ...editingItem.customFields }; delete cf[key]; setEditingItem({ ...editingItem, customFields: cf }); }} className="hover:opacity-80"><X size={12} style={S_RED} /></button>}</div><RichTextEditor value={editingItem.customFields[key] || ""} onChange={(html) => updateItemCustomField(key, html)} placeholder="Describe this effect..." minHeight={60} /></div>)}</div></div>;
          })()}

          <div className="flex gap-2"><button onClick={handleSaveItem} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}><Save size={14} /> {isAddingNewItem ? "Add Item" : "Save Changes"}</button><button onClick={handleCancelItemEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button></div>
        </div>
      )}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A5B #0C0C2E" }}>
          {[{ id: "all", label: "All" }, { id: "ownerless", label: "Templates" }, ...players.map((p) => ({ id: p.id, label: p.name }))].map((tab) => <button key={tab.id} onClick={() => setItemFilterTab(tab.id)} className={`${itemFilterTab === tab.id ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[10px] shrink-0 transition-colors`} style={dmTabStyle(itemFilterTab === tab.id)}>{tab.label}<span className="ml-1 text-[8px] opacity-60">{tab.id === "all" ? managedItems.length : tab.id === "ownerless" ? managedItems.filter((i) => i.assignedTo.length === 0).length : managedItems.filter((i) => i.assignedTo.includes("all") || i.assignedTo.includes(tab.id)).length}</span></button>)}
        </div>
        {filteredItems.length === 0 ? <div className="text-[12px] text-center py-6" style={S_MUTED}>No items {itemFilterTab === "all" ? "created yet" : "in this category"}.</div> : <div className="space-y-2">{filteredItems.map((item) => {
          const ownerStr = formatOwners(item.assignedTo, players);
          const itemCustomFields = getActiveCustomFields(item, itemTags).filter((cf) => item.customFields[cf.key]);
          return <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-3`}><div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-0.5"><span className="text-[13px]" style={S_TEXT_BOLD}>{item.name}</span><span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(item.rarity))}>{item.rarity}</span>{item.locked && <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}><Lock size={8} /> LOCKED</span>}</div><div className="text-[11px]" style={S_MUTED}>{item.type} · Assigned to: {ownerStr}</div>{item.duplicatedFrom && <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#C4A0FF" }}><Copy size={9} /> Duplicated from: <span style={{ color: "#E0C0FF" }}>{item.duplicatedFrom}</span></div>}</div><div className="flex items-center gap-2"><button onClick={async () => { const currentIds = new Set(item.assignedTo.includes("all") ? players.map((p) => p.id) : item.assignedTo); const missing = players.filter((p) => !currentIds.has(p.id)); if (missing.length === 0) return; const newItems = missing.map((p) => ({ ...item, id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, assignedTo: [p.id], customFields: { ...item.customFields }, duplicatedFrom: item.name || "Unknown Item" })); await onPersistItems([...managedItems, ...newItems]); }} className={`${retro.button} px-3 py-1 text-[11px]`} style={{ color: "#C4A0FF" }} title="Create a copy for every player who doesn't have this item"><Copy size={12} className="inline mr-1" />Duplicate to All</button><button onClick={() => { originalAssignedToRef.current = [...item.assignedTo]; setEditingItem({ ...item, customFields: { ...item.customFields } }); setIsAddingNewItem(false); }} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}><Edit size={12} className="inline mr-1" />Edit</button><button onClick={() => handleDeleteItem(item.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}><Trash2 size={12} className="inline mr-1" />Remove</button></div></div>{item.tags.length > 0 && <div className="flex flex-wrap gap-1 mb-1">{item.tags.map((t) => <span key={t} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{t}</span>)}</div>}{itemCustomFields.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">{itemCustomFields.map((cf) => <span key={cf.key} className="text-[10px]"><span style={S_MUTED}>{cf.fieldName}:</span> <span style={S_TEXT}>{item.customFields[cf.key]}</span></span>)}</div>}</div>;
        })}</div>}
      </div>
    </div>
  );
}
