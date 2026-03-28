import React, { useState } from "react";
import { retro } from "./retro-styles";
import {
  Plus, Save, Edit, Tag, ChevronDown, ChevronRight, Trash2,
} from "lucide-react";
import { TagFieldEditorRow, TYPE_ICONS, FIELD_TYPES } from "./tag-field-renderer";
import {
  S_MUTED, S_DIM, S_TEXT, S_ACCENT, S_RED, S_SUBTLE, S_SECTION_HDR, S_GREEN_BTN,
} from "./dm-styles";
import { DISPLAY_CONTENTS } from "./shared-styles";
import type { TagField, TagDefinition } from "./types";

type TagSubPage = "items" | "cards" | "info" | "status" | "wiki";



const labelStyle = { color: "#5A6A8A" } as const;
const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = { color: "#C0D0F0" } as const;

interface DMTagsSectionProps {
  itemTags: TagDefinition[];
  cardTags: TagDefinition[];
  infoTags: TagDefinition[];
  statusTags: TagDefinition[];
  wikiTags: TagDefinition[];
  onSaveItemTags: (next: TagDefinition[]) => Promise<void>;
  onSaveCardTags: (next: TagDefinition[]) => Promise<void>;
  onSaveInfoTags: (next: TagDefinition[]) => Promise<void>;
  onSaveStatusTags: (next: TagDefinition[]) => Promise<void>;
  onSaveWikiTags: (next: TagDefinition[]) => Promise<void>;
}

export function DMTagsSection({
  itemTags,
  cardTags,
  infoTags,
  statusTags,
  wikiTags,
  onSaveItemTags,
  onSaveCardTags,
  onSaveInfoTags,
  onSaveStatusTags,
  onSaveWikiTags,
}: DMTagsSectionProps) {
  const [tagSubPage, setTagSubPage] = useState<TagSubPage>("items");
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<TagDefinition | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagDesc, setNewTagDesc] = useState("");

  const getActiveTagList = (): [TagDefinition[], (next: TagDefinition[]) => Promise<void>] => {
    if (tagSubPage === "items") return [itemTags, onSaveItemTags];
    if (tagSubPage === "cards") return [cardTags, onSaveCardTags];
    if (tagSubPage === "status") return [statusTags, onSaveStatusTags];
    if (tagSubPage === "wiki") return [wikiTags, onSaveWikiTags];
    return [infoTags, onSaveInfoTags];
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) return;
    const [tags, saveTags] = getActiveTagList();
    const newTag: TagDefinition = {
      id: `tag-${Date.now()}`,
      name: newTagName.trim(),
      description: newTagDesc.trim() || "No description provided.",
      fields: [],
    };
    await saveTags([...tags, newTag]);
    setNewTagName("");
    setNewTagDesc("");
  };

  const handleDeleteTag = async (id: string) => {
    const [tags, saveTags] = getActiveTagList();
    await saveTags(tags.filter((t) => t.id !== id));
    if (expandedTagId === id) setExpandedTagId(null);
    if (editingTag?.id === id) setEditingTag(null);
  };

  const handleStartEditTag = (tag: TagDefinition) => {
    setEditingTag({ ...tag, fields: tag.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })) });
    setExpandedTagId(tag.id);
  };

  const handleSaveTag = async () => {
    if (!editingTag) return;
    const [tags, saveTags] = getActiveTagList();
    await saveTags(tags.map((t) => (t.id === editingTag.id ? editingTag : t)));
    setEditingTag(null);
  };

  const handleCancelTagEdit = () => { setEditingTag(null); };

  const updateEditingTagField = (key: "name" | "description", value: string) => {
    if (editingTag) setEditingTag({ ...editingTag, [key]: value });
  };

  const addFieldToEditingTag = () => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: [...editingTag.fields, { id: `tf-${Date.now()}`, name: "", type: "text" }],
    });
  };

  const updateEditingTagFieldName = (fieldId: string, name: string) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.map((f) => (f.id === fieldId ? { ...f, name } : f)),
    });
  };

  const updateEditingTagFieldProp = (fieldId: string, updates: Partial<TagField>) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    });
  };

  const removeFieldFromEditingTag = (fieldId: string) => {
    if (!editingTag) return;
    setEditingTag({
      ...editingTag,
      fields: editingTag.fields.filter((f) => f.id !== fieldId),
    });
  };

  const moveFieldUp = (fieldId: string) => {
    if (!editingTag) return;
    const idx = editingTag.fields.findIndex(f => f.id === fieldId);
    if (idx <= 0) return;
    const fields = [...editingTag.fields];
    [fields[idx - 1], fields[idx]] = [fields[idx], fields[idx - 1]];
    setEditingTag({ ...editingTag, fields });
  };

  const moveFieldDown = (fieldId: string) => {
    if (!editingTag) return;
    const idx = editingTag.fields.findIndex(f => f.id === fieldId);
    if (idx < 0 || idx >= editingTag.fields.length - 1) return;
    const fields = [...editingTag.fields];
    [fields[idx], fields[idx + 1]] = [fields[idx + 1], fields[idx]];
    setEditingTag({ ...editingTag, fields });
  };

  const [activeTags] = getActiveTagList();
  const subPages: { id: TagSubPage; label: string }[] = [
    { id: "items", label: "Item Tags" },
    { id: "cards", label: "Card Tags" },
    { id: "info", label: "Info Tags" },
    { id: "status", label: "Status Effect Tags" },
    { id: "wiki", label: "Wiki Tags" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-[16px]" style={{ ...S_ACCENT, fontWeight: 600 }}>Manage Tags</h2>
      <p className="text-[12px]" style={S_SUBTLE}>
        Define reusable tags for items, cards, and information. Tags can also define additional fields that appear when applied.
      </p>

      <div className="flex gap-2">
        {subPages.map((sp) => (
          <button
            key={sp.id}
            onClick={() => { setTagSubPage(sp.id); setExpandedTagId(null); setEditingTag(null); setNewTagName(""); setNewTagDesc(""); }}
            className={`${tagSubPage === sp.id ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-4 py-2 text-[12px] transition-colors`}
            style={{ color: tagSubPage === sp.id ? "#4A7BFF" : "#C0D0F0", fontWeight: tagSubPage === sp.id ? 600 : 400 }}
          >
            {sp.label}
          </button>
        ))}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="text-[12px] mb-3" style={S_SECTION_HDR}>
          CREATE NEW {tagSubPage.toUpperCase()} TAG
        </div>

        {(tagSubPage === "items" || tagSubPage === "cards") && (
          <div className="mb-3">
            <div className="text-[9px] mb-1.5" style={{ color: "#5A6A8A", fontWeight: 600 }}>QUICK TEMPLATES</div>
            <div className="flex flex-wrap gap-1.5">
              {tagSubPage === "items" && (
                <div style={DISPLAY_CONTENTS}>
                  <button
                    onClick={() => { setNewTagName("Source"); setNewTagDesc("Marks this item as a source item. Source items appear in the Source Items panel."); }}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                  >
                    Source
                  </button>
                  <button
                    onClick={() => { setNewTagName("Source Type: "); setNewTagDesc("Designates the source type for this item. Used for matching when cards consume source by type."); }}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: "#FF7A5A", border: "1px solid #FF7A5A33" }}
                  >
                    Source Type: ...
                  </button>
                </div>
              )}
              {tagSubPage === "cards" && (
                <div style={DISPLAY_CONTENTS}>
                  <button
                    onClick={() => { setNewTagName("Source Type: "); setNewTagDesc("This card consumes the specified source type when used. The card's Level determines how much source is consumed."); }}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: "#FF7A5A", border: "1px solid #FF7A5A33" }}
                  >
                    Source Type: ...
                  </button>
                  <button
                    onClick={() => { setNewTagName("Target: Self"); setNewTagDesc("This ability targets the user. Buff/debuff effects from timed effects will apply to your stats."); }}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: "#4ACA6A", border: "1px solid #4ACA6A33" }}
                  >
                    Target: Self
                  </button>
                  <button
                    onClick={() => { setNewTagName("Target: Enemy"); setNewTagDesc("This ability targets an enemy. Timed effects are tracked for duration but their buff/debuff values will NOT affect your stats."); }}
                    className={`${retro.button} px-2 py-1 text-[10px]`}
                    style={{ color: "#FF6A6A", border: "1px solid #FF6A6A33" }}
                  >
                    Target: Enemy
                  </button>
                </div>
              )}
            </div>
            <div className="text-[9px] mt-1" style={S_DIM}>
              Click a template to pre-fill the name. For &quot;Source Type: ...&quot;, finish the name with your type (e.g. &quot;Source Type: Lightning&quot;).
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] block mb-1" style={labelStyle}>Tag Name:</label>
            <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Enter tag name..." className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={labelStyle}>Description:</label>
            <input type="text" value={newTagDesc} onChange={(e) => setNewTagDesc(e.target.value)} placeholder="Brief description of this tag..." className={inputClass} style={inputStyle} />
          </div>
        </div>
        <button onClick={() => { void handleAddTag(); }} className={`${retro.button} px-5 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> Add Tag
        </button>
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="text-[12px] mb-3" style={S_SECTION_HDR}>
          {tagSubPage === "items" ? "ITEM" : tagSubPage === "cards" ? "CARD" : tagSubPage === "status" ? "STATUS EFFECT" : "INFO"} TAGS ({activeTags.length})
        </div>

        {activeTags.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No tags defined for this category yet.</div>
        ) : (
          <div className="space-y-1">
            {activeTags.map((tag) => {
              const isExpanded = expandedTagId === tag.id;
              const isEditingThis = editingTag?.id === tag.id;
              return (
                <div key={tag.id}>
                  <div
                    className={`flex items-center justify-between py-2.5 px-3 cursor-pointer transition-colors ${isExpanded ? "bg-[#0E0E35]" : "hover:bg-[#0A0A30]"}`}
                    style={{ borderBottom: "1px solid #1A1A4B" }}
                    onClick={() => { if (!isEditingThis) { setExpandedTagId(isExpanded ? null : tag.id); setEditingTag(null); } }}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded
                        ? <ChevronDown size={12} style={S_ACCENT} />
                        : <ChevronRight size={12} style={S_MUTED} />
                      }
                      <span className="text-[10px] px-2 py-0.5 flex items-center gap-1" style={{ background: "#1A1A4B", color: "#7A8AAA", border: "1px solid #2A2A5B" }}>
                        <Tag size={8} />
                        {tag.name}
                      </span>
                      {tag.fields.length > 0 && (
                        <span className="text-[9px]" style={S_MUTED}>
                          {tag.fields.length} field{tag.fields.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartEditTag(tag); }}
                        className="text-[10px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#4A7BFF", border: "1px solid #2A2A5B" }}
                      >
                        <Edit size={10} className="inline mr-1" />Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleDeleteTag(tag.id); }}
                        className="text-[10px] px-2 py-0.5 hover:opacity-80"
                        style={{ color: "#FF6A6A", border: "1px solid #2A2A5B" }}
                      >
                        <Trash2 size={10} className="inline mr-1" />Delete
                      </button>
                    </div>
                  </div>

                  {isExpanded && !isEditingThis && (
                    <div className="px-8 py-3 bg-[#0A0A2E]" style={{ borderBottom: "1px solid #1A1A4B" }}>
                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                      <p className="text-[12px] mb-3" style={S_TEXT}>{tag.description}</p>
                      {tag.fields.length > 0 && (
                        <div style={DISPLAY_CONTENTS}>
                          <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ADDITIONAL FIELDS</div>
                          <div className="space-y-2">
                            {tag.fields.map((f) => {
                              const fType = f.type || "text";
                              const typeLabel = FIELD_TYPES.find(t => t.value === fType)?.label || "Text";
                              return (
                                <div key={f.id} className="px-3 py-2" style={{ background: "#0A0A28", border: "1px solid #1A1A4B" }}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span style={{ color: "#5A6A8A", fontSize: 10 }}>{TYPE_ICONS[fType] || "Aa"}</span>
                                    <span className="text-[11px]" style={{ color: "#4A7BFF", fontWeight: 600 }}>{f.name}</span>
                                    <span className="text-[9px] px-1 py-0.5" style={{ background: "#161648", color: "#7A8AAA", border: "1px solid #2A2A5B" }}>{typeLabel}</span>
                                    {f.required && <span className="text-[8px] px-1 py-0.5" style={{ background: "#FF9A4A22", color: "#FF9A4A", border: "1px solid #FF9A4A33" }}>Required</span>}
                                    {f.allowCustom && <span className="text-[8px] px-1 py-0.5" style={{ background: "#7AA0FF22", color: "#7AA0FF", border: "1px solid #7AA0FF33" }}>Custom OK</span>}
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[9px]">
                                    {f.placeholder && <span><span style={{ color: "#4A5A7A" }}>Placeholder:</span> <span style={{ color: "#8A9ABB" }}>{f.placeholder}</span></span>}
                                    {f.defaultValue && <span><span style={{ color: "#4A5A7A" }}>Default:</span> <span style={{ color: "#8A9ABB" }}>{f.defaultValue}</span></span>}
                                    {f.min != null && <span><span style={{ color: "#4A5A7A" }}>Min:</span> <span style={{ color: "#8A9ABB" }}>{f.min}</span></span>}
                                    {f.max != null && <span><span style={{ color: "#4A5A7A" }}>Max:</span> <span style={{ color: "#8A9ABB" }}>{f.max}</span></span>}
                                    {f.options && f.options.length > 0 && <span><span style={{ color: "#4A5A7A" }}>Options:</span> <span style={{ color: "#8A9ABB" }}>{f.options.filter(o => o).join(", ")}</span></span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {tag.fields.length === 0 && (
                        <div className="text-[10px]" style={S_MUTED}>
                          No additional fields. Click &quot;Edit&quot; to add fields that appear when this tag is applied.
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && isEditingThis && editingTag && (
                    <div className="px-4 py-4 bg-[#0A0A2E]" style={{ borderBottom: "1px solid #1A1A4B" }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Tag Name:</label>
                          <input type="text" value={editingTag.name} onChange={(e) => updateEditingTagField("name", e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Description:</label>
                          <input type="text" value={editingTag.description} onChange={(e) => updateEditingTagField("description", e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px]" style={S_SECTION_HDR}>
                            ADDITIONAL FIELDS ({editingTag.fields.length})
                          </div>
                          <button onClick={addFieldToEditingTag} className="text-[10px] px-2 py-0.5 hover:opacity-80 flex items-center gap-1" style={{ color: "#4A9A5A", border: "1px solid #2A2A5B" }}>
                            <Plus size={10} /> Add Field
                          </button>
                        </div>
                        <p className="text-[10px] mb-3" style={S_MUTED}>
                          Fields added here will create extra input areas on items/cards/info that use this tag. Configure each field's type, placeholder, and validation.
                        </p>
                        {editingTag.fields.length === 0 ? (
                          <div className="text-[11px] text-center py-3" style={S_MUTED}>No fields defined.</div>
                        ) : (
                          <div className="space-y-3">
                            {editingTag.fields.map((field, fieldIdx) => (
                              <TagFieldEditorRow
                                key={field.id}
                                field={field}
                                inputStyle={inputStyle}
                                onUpdateName={updateEditingTagFieldName}
                                onUpdateProp={updateEditingTagFieldProp}
                                onRemove={removeFieldFromEditingTag}
                                onMoveUp={moveFieldUp}
                                onMoveDown={moveFieldDown}
                                isFirst={fieldIdx === 0}
                                isLast={fieldIdx === editingTag.fields.length - 1}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => { void handleSaveTag(); }} className={`${retro.button} px-5 py-1.5 text-[11px] flex items-center gap-1`} style={S_GREEN_BTN}>
                          <Save size={12} /> Save Tag
                        </button>
                        <button onClick={handleCancelTagEdit} className={`${retro.button} px-5 py-1.5 text-[11px]`} style={S_TEXT}>Cancel</button>
                      </div>
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