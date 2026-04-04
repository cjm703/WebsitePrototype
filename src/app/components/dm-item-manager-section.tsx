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
  DM_PANEL,
  DM_PANEL_ALT,
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
  S_SUBTLE,
  S_TEXT,
  S_TEXT_BOLD,
} from "./dm-styles";
import {
  Plus,
  Save,
  Edit,
  Trash2,
  X,
  Lock,
  Copy,
  Search,
  Sparkles,
  Users,
  Tags,
  FileText,
  Eye,
  Layers3,
  WandSparkles,
} from "lucide-react";

interface DMItemManagerSectionProps {
  players: PlayerData[];
  managedItems: ManagedItem[];
  itemTags: TagDefinition[];
  statusTags: TagDefinition[];
  onPersistItems: (next: ManagedItem[]) => Promise<void>;
}

type ItemEditorPanel = "basics" | "assignment" | "tags" | "fields" | "effects" | "preview";
type ItemTemplateId = "blank" | "weapon" | "armor" | "consumable" | "source" | "tool" | "effect";

interface ItemTemplateDef {
  id: ItemTemplateId;
  label: string;
  description: string;
  name: string;
  type: string;
  rarity: string;
  tags: string[];
  starterDescription: string;
}

const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;
const labelStyle = { color: "#5A6A8A" } as const;
const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;

const ITEM_TEMPLATES: ItemTemplateDef[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Start from an empty item shell.",
    name: "",
    type: "",
    rarity: "Common",
    tags: [],
    starterDescription: "",
  },
  {
    id: "weapon",
    label: "Weapon",
    description: "Combat item with equipment-friendly defaults.",
    name: "New Weapon",
    type: "Weapon",
    rarity: "Common",
    tags: ["Weapon", "Equipment"],
    starterDescription: "<p>A weapon meant for combat use.</p>",
  },
  {
    id: "armor",
    label: "Armor",
    description: "Protective equipment with armor-style framing.",
    name: "New Armor",
    type: "Armor",
    rarity: "Common",
    tags: ["Armor", "Equipment"],
    starterDescription: "<p>Protective gear worn to reduce danger and improve survivability.</p>",
  },
  {
    id: "consumable",
    label: "Consumable",
    description: "Potion, food, scroll, bomb, or one-use resource.",
    name: "New Consumable",
    type: "Consumable",
    rarity: "Common",
    tags: ["Consumable"],
    starterDescription: "<p>An item meant to be consumed, expended, or used up.</p>",
  },
  {
    id: "source",
    label: "Source Item",
    description: "Material or crystal that stores usable source.",
    name: "New Source Item",
    type: "Material",
    rarity: "Uncommon",
    tags: ["Source Item", "Material"],
    starterDescription: "<p>An item that contains or represents source that can be spent.</p>",
  },
  {
    id: "tool",
    label: "Tool / Utility",
    description: "Problem-solving item, focus, utility gear, or kit.",
    name: "New Tool",
    type: "Tool",
    rarity: "Common",
    tags: ["Utility"],
    starterDescription: "<p>A practical item used to solve problems or support a task.</p>",
  },
  {
    id: "effect",
    label: "Effect Item",
    description: "Item with one or more player-facing effect text blocks.",
    name: "New Effect Item",
    type: "Relic",
    rarity: "Rare",
    tags: ["Effect"],
    starterDescription: "<p>An item whose most important value is the effect it applies or grants.</p>",
  },
];

const EDITOR_PANELS: Array<{ id: ItemEditorPanel; label: string; icon: React.ComponentType<{ size?: number }>; }> = [
  { id: "basics", label: "Basics", icon: WandSparkles },
  { id: "assignment", label: "Assignment", icon: Users },
  { id: "tags", label: "Tags", icon: Tags },
  { id: "fields", label: "Fields", icon: Layers3 },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "preview", label: "Preview", icon: Eye },
];

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

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countItemEffects(item: ManagedItem | null) {
  if (!item) return 0;
  return Object.keys(item.customFields || {}).filter((key) => key.startsWith("Effect::") && (item.customFields[key] || "").trim()).length;
}

function makeItemFromTemplate(template: ItemTemplateDef, itemTags: TagDefinition[]): ManagedItem {
  const existingTagNames = new Set(itemTags.map((tag) => tag.name));
  const tags = template.tags.filter((tag) => existingTagNames.has(tag));
  const customFields: Record<string, string> = {};
  if (tags.includes("Effect")) {
    customFields["Effect::0"] = "";
  }
  return {
    id: `mi-${Date.now()}`,
    name: template.name,
    rarity: template.rarity,
    type: template.type,
    tags,
    description: template.starterDescription,
    assignedTo: [],
    customFields,
  };
}

function getSuggestedTags(editingItem: ManagedItem | null, itemTags: TagDefinition[]) {
  if (!editingItem) return [] as TagDefinition[];
  const textBlob = `${editingItem.name} ${editingItem.type} ${stripHtml(editingItem.description)}`.toLowerCase();
  return itemTags.filter((tag) => {
    if (editingItem.tags.includes(tag.name)) return false;
    const tagText = `${tag.name} ${tag.description}`.toLowerCase();
    if (!tagText.trim()) return false;
    if (textBlob.includes(tag.name.toLowerCase())) return true;
    if (tag.name.toLowerCase().includes("weapon") && /weapon|blade|sword|axe|bow|staff/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("armor") && /armor|shield|helmet|plate|mail|cloak/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("consumable") && /consumable|potion|food|drink|scroll|bomb/.test(textBlob)) return true;
    if (tag.name.toLowerCase().includes("effect") && countItemEffects(editingItem) > 0) return true;
    if (tag.name.toLowerCase().includes("source") && /source|crystal|mana|fuel/.test(textBlob)) return true;
    return false;
  }).slice(0, 8);
}

export function DMItemManagerSection({ players, managedItems, itemTags, statusTags, onPersistItems }: DMItemManagerSectionProps) {
  const [itemFilterTab, setItemFilterTab] = useState<string>("all");
  const [itemSearch, setItemSearch] = useState("");
  const [editingItem, setEditingItem] = useState<ManagedItem | null>(null);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const [editorPanel, setEditorPanel] = useState<ItemEditorPanel>("basics");
  const [tagSearch, setTagSearch] = useState("");
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
    const nextTags = has ? editingItem.tags.filter((t) => t !== tagName) : [...editingItem.tags, tagName];
    const nextCustomFields = { ...editingItem.customFields };

    if (has) {
      Object.keys(nextCustomFields).forEach((key) => {
        if (key.startsWith(`${tagName}::`)) delete nextCustomFields[key];
      });
    }

    if (!has && tagName === "Effect") {
      const effectKeys = Object.keys(nextCustomFields).filter((key) => key.startsWith("Effect::"));
      if (effectKeys.length === 0) nextCustomFields["Effect::0"] = "";
    }

    if (has && tagName === "Effect") {
      Object.keys(nextCustomFields).forEach((key) => {
        if (key.startsWith("Effect::")) delete nextCustomFields[key];
      });
    }

    setEditingItem({ ...editingItem, tags: nextTags, customFields: nextCustomFields });
  };

  const startEditingItem = (item: ManagedItem) => {
    originalAssignedToRef.current = [...item.assignedTo];
    setEditingItem({ ...item, customFields: { ...item.customFields } });
    setIsAddingNewItem(false);
    setEditorPanel("basics");
    setTagSearch("");
  };

  const handleAddItem = (templateId: ItemTemplateId = "blank") => {
    const template = ITEM_TEMPLATES.find((entry) => entry.id === templateId) || ITEM_TEMPLATES[0];
    setEditingItem(makeItemFromTemplate(template, itemTags));
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
    setEditorPanel("basics");
    setTagSearch("");
  };

  const duplicateAsNew = () => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      id: `mi-${Date.now()}`,
      name: editingItem.name ? `${editingItem.name} Copy` : "Item Copy",
      assignedTo: [],
      duplicatedFrom: editingItem.name || "Unknown Item",
      customFields: { ...editingItem.customFields },
    });
    originalAssignedToRef.current = [];
    setIsAddingNewItem(true);
  };

  const handleCancelItemEdit = () => {
    setEditingItem(null);
    setIsAddingNewItem(false);
    setEditorPanel("basics");
    setTagSearch("");
  };

  const handleSaveItem = async () => {
    if (!editingItem || !editingItem.name.trim()) return;

    const trimmedItem: ManagedItem = {
      ...editingItem,
      name: editingItem.name.trim(),
      type: editingItem.type.trim(),
      description: editingItem.description,
      tags: Array.from(new Set(editingItem.tags)),
    };

    if (isAddingNewItem) {
      await onPersistItems([...managedItems, trimmedItem]);
    } else {
      const originalPlayers = originalAssignedToRef.current;
      const resolveIds = (arr: string[]) => arr.includes("all") ? players.map((p) => p.id) : arr;
      const oldIds = new Set(resolveIds(originalPlayers));
      const newIds = resolveIds(trimmedItem.assignedTo);
      const newlyAdded = newIds.filter((id) => !oldIds.has(id));
      let updated = managedItems.map((item) => (item.id === trimmedItem.id ? trimmedItem : item));

      for (const playerId of newlyAdded) {
        const duplicate: ManagedItem = {
          ...trimmedItem,
          id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          assignedTo: [playerId],
          customFields: { ...trimmedItem.customFields },
          duplicatedFrom: trimmedItem.name || "Unknown Item",
        };
        updated = [...updated, duplicate];
      }

      if (newlyAdded.length > 0) {
        const newlyAddedSet = new Set(newlyAdded);
        updated = updated.map((item) => {
          if (item.id === trimmedItem.id) {
            const kept = trimmedItem.assignedTo.includes("all")
              ? resolveIds(trimmedItem.assignedTo).filter((id) => !newlyAddedSet.has(id))
              : trimmedItem.assignedTo.filter((id) => !newlyAddedSet.has(id));
            return { ...item, assignedTo: kept };
          }
          return item;
        });
      }

      await onPersistItems(updated);
    }

    setEditingItem(null);
    setIsAddingNewItem(false);
  };

  const handleDeleteItem = async (id: string) => {
    const next = managedItems.filter((item) => item.id !== id);
    await onPersistItems(next);
    if (editingItem?.id === id) {
      setEditingItem(null);
      setIsAddingNewItem(false);
    }
  };

  const activeCustomFields = useMemo(
    () => editingItem ? getActiveCustomFields(editingItem, itemTags) : [],
    [editingItem, itemTags],
  );

  const effectKeys = useMemo(() => {
    if (!editingItem) return [] as string[];
    const keys = Object.keys(editingItem.customFields || {})
      .filter((key) => key.startsWith("Effect::"))
      .sort((a, b) => parseInt(a.split("::")[1]) - parseInt(b.split("::")[1]));
    if (editingItem.tags.includes("Effect") && keys.length === 0) return ["Effect::0"];
    return keys;
  }, [editingItem]);

  const filteredItems = useMemo(() => {
    const base = itemFilterTab === "all"
      ? managedItems
      : itemFilterTab === "ownerless"
        ? managedItems.filter((item) => item.assignedTo.length === 0)
        : managedItems.filter((item) => item.assignedTo.includes("all") || item.assignedTo.includes(itemFilterTab));

    const query = itemSearch.trim().toLowerCase();
    if (!query) return base;

    return base.filter((item) => {
      const ownerText = formatOwners(item.assignedTo, players).toLowerCase();
      return (
        item.name.toLowerCase().includes(query)
        || item.type.toLowerCase().includes(query)
        || item.tags.some((tag) => tag.toLowerCase().includes(query))
        || ownerText.includes(query)
        || stripHtml(item.description || "").toLowerCase().includes(query)
      );
    });
  }, [itemFilterTab, itemSearch, managedItems, players]);

  const filteredEditorTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return itemTags;
    return itemTags.filter((tag) => (`${tag.name} ${tag.description}`).toLowerCase().includes(query));
  }, [itemTags, tagSearch]);

  const suggestedTags = useMemo(() => getSuggestedTags(editingItem, itemTags), [editingItem, itemTags]);
  const editorSummary = useMemo(() => {
    if (!editingItem) return null;
    return {
      tagCount: editingItem.tags.length,
      fieldCount: activeCustomFields.length,
      effectCount: effectKeys.filter((key) => (editingItem.customFields[key] || "").trim()).length,
      ownerCount: editingItem.assignedTo.includes("all") ? players.length : editingItem.assignedTo.length,
    };
  }, [editingItem, activeCustomFields.length, effectKeys, players.length]);

  const renderTypedField = (
    key: string,
    fieldDef: TagField,
    value: string,
    onChange: (key: string, val: string) => void,
    labelEl: React.ReactNode,
  ) => renderTypedFieldShared(key, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button);

  const renderCustomFieldEditor = (cf: { tagName: string; fieldName: string; key: string; fieldDef: TagField }) => {
    if (!editingItem) return null;

    const labelEl = (
      <label className="text-[10px] block mb-1" style={S_ACCENT}>
        <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
      </label>
    );

    if (cf.tagName === "Equipment" && cf.fieldName === "Slot") {
      const equipSlots = [
        { id: "head", label: "Head" },
        { id: "face", label: "Face" },
        { id: "neck", label: "Neck" },
        { id: "jacket", label: "Jacket / Cloak" },
        { id: "armor", label: "Armor" },
        { id: "shirt", label: "Shirt" },
        { id: "armguards", label: "Armguards" },
        { id: "gloves", label: "Gloves" },
        { id: "weapon_l", label: "Weapon (L)" },
        { id: "weapon_r", label: "Weapon (R)" },
        { id: "belt", label: "Belt" },
        { id: "belt_slot", label: "Belt Slot" },
        { id: "leggings", label: "Leggings" },
        { id: "shoes", label: "Shoes" },
        { id: "ring", label: "Ring (any)" },
      ];
      return (
        <div key={cf.key}>
          {labelEl}
          <select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select slot</option>
            {equipSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
          </select>
        </div>
      );
    }

    if (cf.tagName === "Attribute Buff" && cf.fieldName === "Attribute") {
      const attrs = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
      return (
        <div key={cf.key}>
          {labelEl}
          <select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select attribute</option>
            {attrs.map((attr) => <option key={attr} value={attr}>{attr}</option>)}
          </select>
        </div>
      );
    }

    if ((cf.tagName === "Attribute Buff" || cf.tagName === "Skill Buff" || cf.tagName === "Resources Buff") && cf.fieldName === "Amount") {
      return (
        <div key={cf.key}>
          {labelEl}
          <input type="number" value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="e.g. +2 or -1" className={inputClass} style={inputStyle} />
        </div>
      );
    }

    if ((cf.tagName === "Skill Buff" || cf.tagName === "Disadvantageous") && cf.fieldName === "Skill") {
      const allSkills = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
      return (
        <div key={cf.key}>
          {labelEl}
          <select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select skill</option>
            {allSkills.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
          </select>
        </div>
      );
    }

    if (cf.tagName === "Resources Buff" && cf.fieldName === "Resource") {
      const allResources = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
      return (
        <div key={cf.key}>
          {labelEl}
          <select value={editingItem.customFields[cf.key] || ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select resource</option>
            {allResources.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
          </select>
        </div>
      );
    }

    if (cf.tagName === "Status Effect" && cf.fieldName === "Effect Name") {
      const existingEffects = statusTags.map((tag) => tag.name);
      const currentVal = editingItem.customFields[cf.key] || "";
      const isCustom = currentVal !== "" && !existingEffects.includes(currentVal);
      const showTextInput = isCustom || currentVal === "";
      return (
        <div key={cf.key}>
          {labelEl}
          <select value={isCustom ? "__custom__" : currentVal} onChange={(e) => updateItemCustomField(cf.key, e.target.value === "__custom__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">Select status effect</option>
            {existingEffects.map((effect) => <option key={effect} value={effect}>{effect}</option>)}
            <option value="__custom__">Custom name</option>
          </select>
          {showTextInput && (
            <input type="text" value={isCustom ? currentVal : ""} onChange={(e) => updateItemCustomField(cf.key, e.target.value)} placeholder="Or type a new status effect name..." className={`${inputClass} mt-1`} style={inputStyle} />
          )}
        </div>
      );
    }

    return renderTypedField(
      cf.key,
      cf.fieldDef,
      editingItem.customFields[cf.key] || cf.fieldDef.defaultValue || "",
      updateItemCustomField,
      labelEl,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Items</h2>
          <div className="text-[11px] mt-1" style={S_MUTED}>
            Use templates, tags, custom fields, and effect blocks to build items faster and with less manual setup.
          </div>
        </div>
        <button onClick={() => handleAddItem("blank")} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> Add Item
        </button>
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={S_ACCENT} />
          <div className="text-[11px]" style={S_SECTION_HDR}>QUICK START TEMPLATES</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {ITEM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleAddItem(template.id)}
              className={`${retro.raised} text-left p-3 hover:bg-[#1A1A48] transition-colors`}
              style={DM_PANEL_ALT}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px]" style={S_TEXT_BOLD}>{template.label}</span>
                <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(template.rarity))}>{template.rarity}</span>
              </div>
              <div className="text-[10px] mb-2" style={S_MUTED}>{template.description}</div>
              {template.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => <span key={tag} className="text-[8px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {editingItem && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[12px]" style={S_SECTION_HDR}>
                {isAddingNewItem ? "ADD NEW ITEM" : `EDITING: ${editingItem.name || "(unnamed)"}`}
              </div>
              {editorSummary && (
                <div className="text-[10px] mt-1 flex flex-wrap gap-3" style={S_MUTED}>
                  <span>{editorSummary.tagCount} tag{editorSummary.tagCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.fieldCount} custom field{editorSummary.fieldCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.effectCount} effect block{editorSummary.effectCount === 1 ? "" : "s"}</span>
                  <span>{editorSummary.ownerCount} owner{editorSummary.ownerCount === 1 ? "" : "s"}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isAddingNewItem && (
                <button onClick={duplicateAsNew} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={{ color: "#C4A0FF" }}>
                  <Copy size={12} /> Duplicate as New
                </button>
              )}
              <button onClick={handleCancelItemEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {EDITOR_PANELS.map((panel) => {
              const Icon = panel.icon;
              const active = editorPanel === panel.id;
              const hiddenForNoEffects = panel.id === "effects" && !editingItem.tags.includes("Effect") && effectKeys.length === 0;
              if (hiddenForNoEffects) return null;
              return (
                <button
                  key={panel.id}
                  onClick={() => setEditorPanel(panel.id)}
                  className={`${active ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[11px] flex items-center gap-1.5`}
                  style={dmTabStyle(active)}
                >
                  <Icon size={12} />
                  {panel.label}
                </button>
              );
            })}
          </div>

          {editorPanel === "basics" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Item Name</label>
                  <input type="text" value={editingItem.name} onChange={(e) => updateItemField("name", e.target.value)} placeholder="Enter item name..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Item Type</label>
                  <input type="text" value={editingItem.type} onChange={(e) => updateItemField("type", e.target.value)} placeholder="e.g. Weapon, Armor, Tool..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Rarity</label>
                  <select value={editingItem.rarity} onChange={(e) => updateItemField("rarity", e.target.value)} className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full`} style={{ color: rarityColor(editingItem.rarity) }}>
                    {rarities.map((rarity) => <option key={rarity} value={rarity} style={{ color: rarityColor(rarity) }}>{rarity}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                <RichTextEditor value={editingItem.description} onChange={(html) => updateItemField("description", html)} placeholder="Describe the item, its appearance, and what makes it notable..." minHeight={120} />
              </div>

              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="text-[10px] mb-2" style={S_SECTION_HDR}>STARTER TEMPLATES</div>
                <div className="text-[10px] mb-3" style={S_MUTED}>
                  Swap the current draft to a different starting template. This replaces the current unsaved draft contents.
                </div>
                <div className="flex flex-wrap gap-2">
                  {ITEM_TEMPLATES.map((template) => (
                    <button key={template.id} onClick={() => handleAddItem(template.id)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_ACCENT}>
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {editorPanel === "assignment" && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players</label>
                <div className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingItem.assignedTo.includes("all")} onChange={(e) => updateItemField("assignedTo", e.target.checked ? ["all"] : [])} className="accent-[#4A9A5A]" />
                      <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                    </label>
                    <button onClick={() => updateItemField("assignedTo", [])} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_TEXT}>Clear</button>
                  </div>
                  <div className="h-[1px] mb-3" style={DM_DIVIDER} />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {players.map((player) => (
                      <label key={player.id} className={`${retro.raised} bg-[#11113C] px-3 py-2 flex items-center gap-2 cursor-pointer`}>
                        <input
                          type="checkbox"
                          disabled={editingItem.assignedTo.includes("all")}
                          checked={editingItem.assignedTo.includes("all") || editingItem.assignedTo.includes(player.id)}
                          onChange={(e) => {
                            const current = editingItem.assignedTo.filter((id) => id !== "all");
                            if (e.target.checked) updateItemField("assignedTo", [...current, player.id]);
                            else updateItemField("assignedTo", current.filter((id) => id !== player.id));
                          }}
                          className="accent-[#4A7BFF]"
                        />
                        <span className="text-[12px]" style={dmAssignDim(editingItem.assignedTo.includes("all"))}>{player.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!editingItem.locked} onChange={(e) => updateItemField("locked", e.target.checked)} className="accent-[#FF6A6A]" />
                  <span className="text-[12px] flex items-center gap-1.5" style={dmLockColor(!!editingItem.locked)}>
                    <Lock size={12} />
                    {editingItem.locked ? "Locked. Players cannot edit this item." : "Unlocked. Players can edit this item."}
                  </span>
                </label>
              </div>
            </div>
          )}

          {editorPanel === "tags" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] gap-4">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Search Tags</label>
                  <div className="relative mb-3">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={S_MUTED} />
                    <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search item tags..." className={`${inputClass} pl-7`} style={inputStyle} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredEditorTags.map((tag) => {
                      const active = editingItem.tags.includes(tag.name);
                      const hasFields = tag.fields.length > 0;
                      return (
                        <button key={tag.id} onClick={() => toggleItemTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={dmActiveBtn(active)}>
                          {tag.name}
                          {hasFields && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                        </button>
                      );
                    })}
                    {itemTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No item tags exist yet. Create them in Manage Tags first.</span>}
                  </div>
                </div>

                <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SELECTED TAGS</div>
                  {editingItem.tags.length === 0 ? (
                    <div className="text-[11px]" style={S_MUTED}>No tags selected yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {editingItem.tags.map((tag) => <span key={tag} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                    </div>
                  )}

                  <div className="text-[10px] mb-2" style={S_SECTION_HDR}>SUGGESTED TAGS</div>
                  {suggestedTags.length === 0 ? (
                    <div className="text-[11px]" style={S_MUTED}>Suggestions appear based on the item name, type, description, and effect state.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedTags.map((tag) => (
                        <button key={tag.id} onClick={() => toggleItemTag(tag.name)} className={`${retro.button} px-2 py-1 text-[10px]`} style={S_ACCENT}>
                          Add {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {editorPanel === "fields" && (
            <div className="space-y-4">
              {activeCustomFields.length === 0 ? (
                <div className={`${retro.raised} bg-[#0E0E35] p-4 text-[11px]`} style={S_MUTED}>
                  This item does not currently have any active tag-driven custom fields. Add a tag with fields to unlock more structured item data.
                </div>
              ) : (
                <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="text-[10px] mb-3" style={S_SECTION_HDR}>TAG FIELDS</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {activeCustomFields.map((cf) => renderCustomFieldEditor(cf))}
                  </div>
                </div>
              )}
            </div>
          )}

          {editorPanel === "effects" && (
            <div className="space-y-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="text-[10px]" style={DM_EFFECT_HDR}>EFFECT DESCRIPTIONS</div>
                    <div className="text-[10px] mt-1" style={S_MUTED}>
                      Use multiple effect blocks when an item grants more than one player-facing rule or benefit.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const nextIdx = effectKeys.length > 0 ? Math.max(...effectKeys.map((key) => parseInt(key.split("::")[1]))) + 1 : 0;
                      updateItemCustomField(`Effect::${nextIdx}`, "");
                      if (!editingItem.tags.includes("Effect")) toggleItemTag("Effect");
                    }}
                    className={`${retro.button} px-2 py-1 text-[10px] flex items-center gap-1`}
                    style={DM_PURPLE}
                  >
                    <Plus size={10} /> Add Effect
                  </button>
                </div>

                {effectKeys.length === 0 ? (
                  <div className="text-[11px]" style={S_MUTED}>No effect blocks yet.</div>
                ) : (
                  <div className="space-y-3">
                    {effectKeys.map((key, index) => (
                      <div key={key} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className="text-[9px]" style={DM_EFFECT_LABEL}>Effect #{index + 1}</label>
                          {effectKeys.length > 1 && (
                            <button
                              onClick={() => {
                                if (!editingItem) return;
                                const customFields = { ...editingItem.customFields };
                                delete customFields[key];
                                setEditingItem({ ...editingItem, customFields });
                              }}
                              className="hover:opacity-80"
                            >
                              <X size={12} style={S_RED} />
                            </button>
                          )}
                        </div>
                        <RichTextEditor value={editingItem.customFields[key] || ""} onChange={(html) => updateItemCustomField(key, html)} placeholder="Describe the effect this item grants..." minHeight={80} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {editorPanel === "preview" && (
            <div className="space-y-4">
              <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="text-[16px]" style={S_TEXT_BOLD}>{editingItem.name || "Unnamed Item"}</div>
                      <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(editingItem.rarity))}>{editingItem.rarity}</span>
                      {editingItem.locked && <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}><Lock size={8} /> LOCKED</span>}
                    </div>
                    <div className="text-[11px]" style={S_MUTED}>{editingItem.type || "No type yet"} · Assigned to: {formatOwners(editingItem.assignedTo, players)}</div>
                  </div>
                </div>

                {editingItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {editingItem.tags.map((tag) => <span key={tag} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                  </div>
                )}

                {stripHtml(editingItem.description || "") ? (
                  <div className={`${retro.sunken} bg-[#0A0A28] p-3 mb-3`}>
                    <div className="text-[9px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                    <RichTextEditor value={editingItem.description} onChange={(html) => updateItemField("description", html)} minHeight={100} />
                  </div>
                ) : (
                  <div className="text-[11px] mb-3" style={S_MUTED}>No description written yet.</div>
                )}

                {activeCustomFields.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                    {activeCustomFields
                      .filter((cf) => (editingItem.customFields[cf.key] || "").trim())
                      .map((cf) => (
                        <span key={cf.key} className="text-[10px]">
                          <span style={S_MUTED}>{cf.fieldName}:</span> <span style={S_TEXT}>{editingItem.customFields[cf.key]}</span>
                        </span>
                      ))}
                  </div>
                )}

                {effectKeys.filter((key) => (editingItem.customFields[key] || "").trim()).length > 0 && (
                  <div className="space-y-2">
                    {effectKeys.filter((key) => (editingItem.customFields[key] || "").trim()).map((key, index) => (
                      <div key={key} className={`${retro.sunken} bg-[#0A0A28] p-3`}>
                        {effectKeys.length > 1 && <div className="text-[9px] mb-1" style={{ color: "#7A6ABB", fontWeight: 600 }}>Effect #{index + 1}</div>}
                        <div className="text-[11px]" style={S_TEXT}>{stripHtml(editingItem.customFields[key])}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4 flex-wrap">
            <button onClick={handleSaveItem} disabled={!editingItem.name.trim()} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={editingItem.name.trim() ? S_GREEN_BTN : { color: "#5A6A8A", border: "1px solid #2A2A4A", background: "#121233" }}>
              <Save size={14} /> {isAddingNewItem ? "Add Item" : "Save Changes"}
            </button>
            <button onClick={handleCancelItemEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
          </div>
        </div>
      )}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[12px]" style={S_SECTION_HDR}>ITEM LIBRARY ({filteredItems.length})</div>
            <div className="text-[10px] mt-1" style={S_MUTED}>Browse templates, player items, and duplicated variants.</div>
          </div>
          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={S_MUTED} />
            <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items..." className={`${inputClass} pl-7`} style={inputStyle} />
          </div>
        </div>

        <div className="flex items-center gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#2A2A5B #0C0C2E" }}>
          {[{ id: "all", label: "All" }, { id: "ownerless", label: "Templates" }, ...players.map((player) => ({ id: player.id, label: player.name }))].map((tab) => {
            const count = tab.id === "all"
              ? managedItems.length
              : tab.id === "ownerless"
                ? managedItems.filter((item) => item.assignedTo.length === 0).length
                : managedItems.filter((item) => item.assignedTo.includes("all") || item.assignedTo.includes(tab.id)).length;
            return (
              <button key={tab.id} onClick={() => setItemFilterTab(tab.id)} className={`${itemFilterTab === tab.id ? retro.sunken + " bg-[#0E0E35]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-1.5 text-[10px] shrink-0 transition-colors`} style={dmTabStyle(itemFilterTab === tab.id)}>
                {tab.label}<span className="ml-1 text-[8px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No items match this view.</div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const ownerStr = formatOwners(item.assignedTo, players);
              const itemCustomFields = getActiveCustomFields(item, itemTags).filter((cf) => (item.customFields[cf.key] || "").trim());
              const previewText = stripHtml(item.description || "");
              return (
                <div key={item.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[13px]" style={S_TEXT_BOLD}>{item.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5" style={dmRarityBadge(rarityColor(item.rarity))}>{item.rarity}</span>
                        {item.locked && <span className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5" style={DM_LOCKED_BADGE}><Lock size={8} /> LOCKED</span>}
                      </div>
                      <div className="text-[11px]" style={S_MUTED}>{item.type || "No type"} · Assigned to: {ownerStr}</div>
                      {item.duplicatedFrom && (
                        <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#C4A0FF" }}>
                          <Copy size={9} /> Duplicated from: <span style={{ color: "#E0C0FF" }}>{item.duplicatedFrom}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          const currentIds = new Set(item.assignedTo.includes("all") ? players.map((player) => player.id) : item.assignedTo);
                          const missing = players.filter((player) => !currentIds.has(player.id));
                          if (missing.length === 0) return;
                          const newItems = missing.map((player) => ({
                            ...item,
                            id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            assignedTo: [player.id],
                            customFields: { ...item.customFields },
                            duplicatedFrom: item.name || "Unknown Item",
                          }));
                          await onPersistItems([...managedItems, ...newItems]);
                        }}
                        className={`${retro.button} px-3 py-1 text-[11px]`}
                        style={{ color: "#C4A0FF" }}
                        title="Create a copy for every player who does not have this item"
                      >
                        <Copy size={12} className="inline mr-1" /> Duplicate to All
                      </button>
                      <button onClick={() => startEditingItem(item)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}><Edit size={12} className="inline mr-1" />Edit</button>
                      <button onClick={() => handleDeleteItem(item.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}><Trash2 size={12} className="inline mr-1" />Remove</button>
                    </div>
                  </div>

                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.tags.map((tag) => <span key={tag} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{tag}</span>)}
                    </div>
                  )}

                  {previewText && <div className="text-[10px] mb-2" style={S_SUBTLE}>{previewText.length > 180 ? `${previewText.slice(0, 177)}...` : previewText}</div>}

                  {itemCustomFields.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {itemCustomFields.map((cf) => (
                        <span key={cf.key} className="text-[10px]">
                          <span style={S_MUTED}>{cf.fieldName}:</span> <span style={S_TEXT}>{item.customFields[cf.key]}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
