import React from "react";
import { ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { retro } from "./retro-styles";
import { DISPLAY_CONTENTS } from "./shared-styles";

export type { TagField as TagFieldDef } from "./types";
import type { TagField as TagFieldDef } from "./types";

// ========================
// Shared tag field type definitions and renderer
// Used by dm-area.tsx and personal-files.tsx
// ========================

export const ALL_SKILLS = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
export const ALL_ATTRS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
export const ALL_RESOURCES = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
export const ALL_SLOTS = [
  { id: "head", label: "Head" }, { id: "face", label: "Face" }, { id: "neck", label: "Neck" },
  { id: "jacket", label: "Jacket / Cloak" }, { id: "armor", label: "Armor" }, { id: "shirt", label: "Shirt" },
  { id: "armguards", label: "Armguards" }, { id: "gloves", label: "Gloves" },
  { id: "weapon_l", label: "Weapon (L)" }, { id: "weapon_r", label: "Weapon (R)" },
  { id: "belt", label: "Belt" }, { id: "belt_slot", label: "Belt Slot" },
  { id: "leggings", label: "Leggings" }, { id: "shoes", label: "Shoes" },
  { id: "ring", label: "Ring (any)" },
];

export const FIELD_TYPES: { value: TagFieldDef["type"]; label: string; icon: string; desc: string }[] = [
  { value: "text", label: "Text", icon: "Aa", desc: "Free-text input" },
  { value: "number", label: "Number", icon: "#", desc: "Numbers only" },
  { value: "dropdown", label: "Dropdown", icon: "\u25BC", desc: "Pick from a list" },
  { value: "textarea", label: "Long Text", icon: "\u00B6", desc: "Multi-line text" },
  { value: "toggle", label: "Toggle", icon: "\u2298", desc: "Yes / No switch" },
  { value: "dice", label: "Dice", icon: "\u2684", desc: "Dice notation (e.g. 2d6+3)" },
  { value: "attribute", label: "Attribute", icon: "\u2B21", desc: "Pick an attribute" },
  { value: "skill", label: "Skill", icon: "\u2605", desc: "Pick a skill" },
  { value: "resource", label: "Resource", icon: "\u2666", desc: "Pick a resource" },
  { value: "slot", label: "Equip Slot", icon: "\u26CA", desc: "Pick an equipment slot" },
];

export const TYPE_ICONS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map(t => [t.value!, t.icon]));

/**
 * Renders a type-aware input for a tag custom field.
 */
export function renderTypedField(
  cfKey: string,
  fieldDef: TagFieldDef,
  value: string,
  onChange: (key: string, val: string) => void,
  labelEl: React.ReactNode,
  inputClass: string,
  inputStyle: React.CSSProperties,
  buttonClass?: string,
): React.ReactNode {
  const ft = fieldDef.type || "text";
  const ph = fieldDef.placeholder || `Enter ${fieldDef.name.toLowerCase()}...`;
  const req = fieldDef.required;
  const isEmpty = !value;
  const reqWarn = req && isEmpty;

  const labelWithReq = (
    <div style={DISPLAY_CONTENTS}>
      {labelEl}
      {reqWarn && <span className="text-[8px] ml-1" style={{ color: "#FF9A4A" }}>*required</span>}
    </div>
  );

  const warnBorder = reqWarn ? { borderColor: "#FF9A4A44" } : {};

  switch (ft) {
    case "number":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <input type="number" value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            placeholder={ph} min={fieldDef.min} max={fieldDef.max}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }} />
        </div>
      );
    case "dropdown": {
      const opts = (fieldDef.options || []).filter(o => o);
      if (fieldDef.allowCustom) {
        const dlId = `dl-${cfKey.replace(/[^a-zA-Z0-9]/g, "-")}`;
        const isCustom = value && !opts.includes(value);
        return (
          <div key={cfKey}>
            {labelWithReq}
            <div className="relative">
              <input
                type="text"
                list={dlId}
                value={value}
                onChange={(e) => onChange(cfKey, e.target.value)}
                placeholder={fieldDef.placeholder || "Select or type custom..."}
                className={inputClass}
                style={{ ...inputStyle, paddingRight: 24, ...warnBorder }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: "#5A6A8A" }}>{"\u25BC"}</span>
              <datalist id={dlId}>
                {opts.map(o => <option key={o} value={o} />)}
              </datalist>
            </div>
            {isCustom && (
              <div className="text-[8px] mt-0.5" style={{ color: "#7A8ABB" }}>
                Custom value
              </div>
            )}
          </div>
        );
      }
      return (
        <div key={cfKey}>
          {labelWithReq}
          <select value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }}>
            <option value="">{"\u2014"} Select {"\u2014"}</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    case "textarea":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <textarea value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            placeholder={ph} rows={3}
            className={`${inputClass} resize-y`} style={{ ...inputStyle, minHeight: 60, ...warnBorder }} />
        </div>
      );
    case "toggle":
      return (
        <div key={cfKey}>
          {labelEl}
          <button
            onClick={() => onChange(cfKey, value === "Yes" ? "No" : "Yes")}
            className={`${buttonClass || retro.button} px-4 py-2 text-[12px] w-full flex items-center justify-center gap-2`}
            style={{ color: value === "Yes" ? "#4ADE80" : "#FF6A6A", border: `1px solid ${value === "Yes" ? "#4ADE8044" : "#FF6A6A44"}`, background: value === "Yes" ? "#4ADE8010" : "#FF6A6A10" }}
          >
            {value === "Yes" ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {value === "Yes" ? "Yes" : "No"}
          </button>
        </div>
      );
    case "dice":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <div className="relative">
            <input type="text" value={value} onChange={(e) => onChange(cfKey, e.target.value)}
              placeholder={ph || "e.g. 2d6+3"} className={inputClass} style={{ ...inputStyle, paddingRight: 28, ...warnBorder }} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[14px] pointer-events-none" style={{ color: "#5A6A8A" }}>{"\u2684"}</span>
          </div>
        </div>
      );
    case "attribute":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <select value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }}>
            <option value="">{"\u2014"} Select Attribute {"\u2014"}</option>
            {ALL_ATTRS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      );
    case "skill":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <select value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }}>
            <option value="">{"\u2014"} Select Skill {"\u2014"}</option>
            {ALL_SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      );
    case "resource":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <select value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }}>
            <option value="">{"\u2014"} Select Resource {"\u2014"}</option>
            {ALL_RESOURCES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      );
    case "slot":
      return (
        <div key={cfKey}>
          {labelWithReq}
          <select value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            className={inputClass} style={{ ...inputStyle, ...warnBorder }}>
            <option value="">{"\u2014"} Select Slot {"\u2014"}</option>
            {ALL_SLOTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      );
    default:
      return (
        <div key={cfKey}>
          {labelWithReq}
          <input type="text" value={value} onChange={(e) => onChange(cfKey, e.target.value)}
            placeholder={ph} className={inputClass} style={{ ...inputStyle, ...warnBorder }} />
        </div>
      );
  }
}

/**
 * Tag field editor row - renders the full configurator for a single field in the tag editor.
 */
export function TagFieldEditorRow({
  field,
  inputStyle,
  onUpdateName,
  onUpdateProp,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: TagFieldDef;
  inputStyle: React.CSSProperties;
  onUpdateName: (id: string, name: string) => void;
  onUpdateProp: (id: string, updates: Partial<TagFieldDef>) => void;
  onRemove: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const ft = field.type || "text";
  return (
    <div className={`${retro.sunken} bg-[#08081E] p-3`}>
      <div className="flex items-center gap-2 mb-2">
        {onMoveUp && onMoveDown && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              onClick={() => onMoveUp(field.id)}
              disabled={isFirst}
              className="hover:opacity-80 p-0.5"
              style={{ color: isFirst ? "#2A2A5B" : "#7A8AAA" }}
              title="Move up"
            >▲</button>
            <button
              onClick={() => onMoveDown(field.id)}
              disabled={isLast}
              className="hover:opacity-80 p-0.5"
              style={{ color: isLast ? "#2A2A5B" : "#7A8AAA" }}
              title="Move down"
            >▼</button>
          </div>
        )}
        <input
          type="text"
          value={field.name}
          onChange={(e) => onUpdateName(field.id, e.target.value)}
          placeholder="Field name (e.g., Damage, Range...)"
          className={`${retro.sunken} bg-[#0A0A28] px-3 py-1.5 text-[12px] flex-1 outline-none`}
          style={inputStyle}
        />
        <button onClick={() => onRemove(field.id)} className="hover:opacity-80 shrink-0 p-1" style={{ color: "#FF6A6A" }} title="Remove field">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="text-[9px] block mb-1" style={{ color: "#5A6A8A" }}>TYPE</label>
          <select
            value={ft}
            onChange={(e) => {
              const newType = e.target.value as TagFieldDef["type"];
              const updates: Partial<TagFieldDef> = { type: newType };
              if (newType === "dropdown" && (!field.options || field.options.length === 0)) {
                updates.options = ["Option 1"];
              }
              if (newType !== "dropdown") updates.options = undefined;
              if (newType !== "dropdown") updates.allowCustom = undefined;
              if (newType !== "number") { updates.min = undefined; updates.max = undefined; }
              onUpdateProp(field.id, updates);
            }}
            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-full outline-none`}
            style={{ color: "#C0D0F0" }}
          >
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
          <div className="text-[8px] mt-0.5" style={{ color: "#4A5A7A" }}>
            {FIELD_TYPES.find(t => t.value === ft)?.desc}
          </div>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-[9px] block mb-1" style={{ color: "#5A6A8A" }}>PLACEHOLDER</label>
          <input
            type="text"
            value={field.placeholder || ""}
            onChange={(e) => onUpdateProp(field.id, { placeholder: e.target.value || undefined })}
            placeholder="Hint text..."
            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-full outline-none`}
            style={{ color: "#8A9ABB" }}
          />
        </div>
        <div className="flex-1 min-w-[90px]">
          <label className="text-[9px] block mb-1" style={{ color: "#5A6A8A" }}>DEFAULT</label>
          <input
            type="text"
            value={field.defaultValue || ""}
            onChange={(e) => onUpdateProp(field.id, { defaultValue: e.target.value || undefined })}
            placeholder={"\u2014"}
            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-full outline-none`}
            style={{ color: "#8A9ABB" }}
          />
        </div>
        <div className="flex items-center gap-3 pt-3">
          <label className="flex items-center gap-1 cursor-pointer text-[9px]" style={{ color: field.required ? "#FF9A4A" : "#4A5A7A" }}>
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onUpdateProp(field.id, { required: e.target.checked || undefined })}
              style={{ accentColor: "#FF9A4A" }}
            />
            Required
          </label>
        </div>
      </div>
      {ft === "number" && (
        <div className="flex items-center gap-3 mt-2">
          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: "#5A6A8A" }}>MIN</label>
            <input
              type="number"
              value={field.min ?? ""}
              onChange={(e) => onUpdateProp(field.id, { min: e.target.value !== "" ? Number(e.target.value) : undefined })}
              placeholder={"\u2014"}
              className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-16 outline-none`}
              style={{ color: "#8A9ABB" }}
            />
          </div>
          <div>
            <label className="text-[9px] block mb-0.5" style={{ color: "#5A6A8A" }}>MAX</label>
            <input
              type="number"
              value={field.max ?? ""}
              onChange={(e) => onUpdateProp(field.id, { max: e.target.value !== "" ? Number(e.target.value) : undefined })}
              placeholder={"\u2014"}
              className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] w-16 outline-none`}
              style={{ color: "#8A9ABB" }}
            />
          </div>
        </div>
      )}
      {ft === "dropdown" && (
        <div className="mt-2">
          <label className="text-[9px] block mb-1" style={{ color: "#5A6A8A" }}>DROPDOWN OPTIONS</label>
          <div className="space-y-1">
            {(field.options || []).map((opt, oi) => (
              <div key={oi} className="flex items-center gap-1">
                <span className="text-[9px] shrink-0 w-4 text-right" style={{ color: "#4A5A7A" }}>{oi + 1}.</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(field.options || [])];
                    newOpts[oi] = e.target.value;
                    onUpdateProp(field.id, { options: newOpts });
                  }}
                  className={`${retro.sunken} bg-[#0A0A28] px-2 py-0.5 text-[11px] flex-1 outline-none`}
                  style={{ color: "#C0D0F0" }}
                  placeholder={`Option ${oi + 1}...`}
                />
                <button
                  onClick={() => {
                    const newOpts = (field.options || []).filter((_, i) => i !== oi);
                    onUpdateProp(field.id, { options: newOpts.length > 0 ? newOpts : ["Option 1"] });
                  }}
                  className="shrink-0 p-0.5 hover:opacity-80"
                  style={{ color: "#FF6A6A66" }}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => onUpdateProp(field.id, { options: [...(field.options || []), ""] })}
            className="text-[9px] mt-1 px-2 py-0.5 hover:opacity-80"
            style={{ color: "#4A9A5A", border: "1px solid #2A2A5B" }}
          >
            + Add Option
          </button>
          <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: "1px solid #1A1A4B" }}>
            <label className="flex items-center gap-1.5 cursor-pointer text-[9px]" style={{ color: field.allowCustom ? "#7AA0FF" : "#4A5A7A" }}>
              <input
                type="checkbox"
                checked={!!field.allowCustom}
                onChange={(e) => onUpdateProp(field.id, { allowCustom: e.target.checked || undefined })}
                style={{ accentColor: "#7AA0FF" }}
              />
              Allow Custom Entry
            </label>
            <span className="text-[8px]" style={{ color: "#3A4A6A" }}>
              {field.allowCustom ? "Users can type values not in the list" : "Users must pick from the list"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}