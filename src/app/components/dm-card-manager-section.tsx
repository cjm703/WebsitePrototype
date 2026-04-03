import React, { useState, useEffect, useMemo, useCallback } from "react";
import { retro } from "./retro-styles";
import { RichTextEditor } from "./rich-text-editor";
import { renderTypedField as renderTypedFieldShared } from "./tag-field-renderer";
import { loadDMPlayerLevelCategories, saveDMPlayerLevelCategories } from "@/lib/player-state-api";
import type { PlayerData, TagDefinition, ManagedCard, TagField } from "./types";
import { type NodeTree } from "./node-trees";
import { CreditCard, Zap, Plus, Save, X, Edit, Trash2, GitBranch, User, Copy, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import {
  DM_TAG_BADGE,
  DM_DIVIDER,
  DM_ACTION_BADGE,
  DM_LEVEL_BADGE,
  DM_NODE_ICON,
  dmAssignDim,
  S_MUTED,
  S_TEXT,
  S_ACCENT,
  S_RED,
  S_SUBTLE,
  S_GREEN_BTN,
  S_SECTION_HDR,
  S_ACCENT_HDR,
  S_TEXT_BOLD,
} from "./dm-styles";
import { DISPLAY_CONTENTS } from "./shared-styles";

interface DMCardManagerSectionProps {
  players: PlayerData[];
  managedCards: ManagedCard[];
  cardTags: TagDefinition[];
  nodeTrees: NodeTree[];
  onPersistCards: (next: ManagedCard[]) => Promise<void>;
  onPersistNodeTrees: (next: NodeTree[]) => Promise<void>;
  setDmError: React.Dispatch<React.SetStateAction<string | null>>;
}

type LevelCategory = { id: string; name: string; order: number; cardIds: string[]; description?: string };

const cfKey = (tagName: string, fieldName: string) => `${tagName}::${fieldName}`;
const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;
const inputStyle = S_TEXT;
const labelStyle = S_MUTED;

function formatOwners(assignedTo: string[], players: { id: string; name: string }[]) {
  if (assignedTo.includes("all")) return "All Players";
  if (assignedTo.length === 0) return "Unassigned";
  return assignedTo.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

function getSaveError(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
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

export function DMCardManagerSection({
  players,
  managedCards,
  cardTags,
  nodeTrees,
  onPersistCards,
  onPersistNodeTrees,
  setDmError,
}: DMCardManagerSectionProps) {
  const [dmCardsSubTab, setDmCardsSubTab] = useState<"cards" | "levelabilities">("cards");
  const [editingCard, setEditingCard] = useState<ManagedCard | null>(null);
  const [isAddingNewCard, setIsAddingNewCard] = useState(false);
  const [laSelectedPlayerId, setLaSelectedPlayerId] = useState<string>("");
  const [levelCategories, setLevelCategories] = useState<LevelCategory[]>([]);
  const [laEditingLevel, setLaEditingLevel] = useState<string | null>(null);
  const [laNewLevelName, setLaNewLevelName] = useState("");
  const [laAddingLevel, setLaAddingLevel] = useState(false);
  const [laCollapsedLevels, setLaCollapsedLevels] = useState<Set<string>>(new Set());
  const [laEditingDesc, setLaEditingDesc] = useState<string | null>(null);
  const [laCopyConfirm, setLaCopyConfirm] = useState(false);

  const renderTypedField = useCallback((
    key: string,
    fieldDef: TagField,
    value: string,
    onChange: (key: string, val: string) => void,
    labelEl: React.ReactNode,
  ) => renderTypedFieldShared(key, fieldDef, value, onChange, labelEl, inputClass, inputStyle, retro.button), []);

  useEffect(() => {
    if (dmCardsSubTab === "levelabilities" && !laSelectedPlayerId && players.length > 0) {
      setLaSelectedPlayerId(players[0].id);
    }
  }, [dmCardsSubTab, laSelectedPlayerId, players]);

  const saveLevelCategories = useCallback(async (cats: LevelCategory[]) => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      await saveDMPlayerLevelCategories(laSelectedPlayerId, cats);
      setLevelCategories(cats);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save level categories"));
      throw err;
    }
  }, [laSelectedPlayerId, setDmError]);

  const copyLevelCategoriesToAllPlayers = useCallback(async () => {
    if (!laSelectedPlayerId) return;
    try {
      setDmError(null);
      const currentCats = await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[];
      for (const p of players) {
        if (p.id !== laSelectedPlayerId) {
          await saveDMPlayerLevelCategories(p.id, JSON.parse(JSON.stringify(currentCats)));
        }
      }
      setLaCopyConfirm(false);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to copy level categories to all players"));
    }
  }, [laSelectedPlayerId, players, setDmError]);

  useEffect(() => {
    let cancelled = false;
    async function loadLevelCategories() {
      if (!laSelectedPlayerId) return;
      try {
        const existing = await loadDMPlayerLevelCategories(laSelectedPlayerId) as LevelCategory[];
        let cats = existing;
        if (cats.length === 0) {
          const p = players.find((pl) => pl.id === laSelectedPlayerId);
          if (p && p.level > 0) {
            cats = Array.from({ length: p.level }, (_, i) => ({
              id: `lvl-${Date.now()}-${i}`,
              name: `Level ${i + 1}`,
              order: p.level - 1 - i,
              cardIds: [],
              description: "",
            }));
            await saveDMPlayerLevelCategories(laSelectedPlayerId, cats);
          }
        }
        if (cancelled) return;
        setLevelCategories(cats);
        setLaEditingLevel(null);
        setLaAddingLevel(false);
        setLaNewLevelName("");
        setLaCollapsedLevels(new Set());
        setLaEditingDesc(null);
        setLaCopyConfirm(false);
      } catch (err) {
        if (!cancelled) {
          setDmError(getSaveError(err, "Failed to load level categories"));
        }
      }
    }
    void loadLevelCategories();
    return () => { cancelled = true; };
  }, [laSelectedPlayerId, players, setDmError]);

  const handleAddCard = () => {
    setEditingCard({
      id: `mc-${Date.now()}`,
      name: "",
      type: "",
      actionCost: "",
      tags: [],
      effect: "",
      assignedTo: [],
      customFields: {},
      nodeTreeId: "",
      nodeId: "",
    });
    setIsAddingNewCard(true);
  };

  const handleSaveCard = async () => {
    if (!editingCard) return;
    try {
      setDmError(null);
      const nextCards = isAddingNewCard
        ? [...managedCards, editingCard]
        : managedCards.map((c) => (c.id === editingCard.id ? editingCard : c));
      await onPersistCards(nextCards);

      let treesChanged = false;
      const nextTrees = nodeTrees.map((tree) => {
        const nextNodes = tree.nodes.map((node) => {
          const hasCard = node.cardIds.includes(editingCard.id);
          const shouldHave = editingCard.nodeTreeId === tree.id && editingCard.nodeId === node.id;
          if (shouldHave && !hasCard) {
            if (node.cardIds.length >= 3) return node;
            treesChanged = true;
            return { ...node, cardIds: [...node.cardIds, editingCard.id] };
          }
          if (!shouldHave && hasCard) {
            treesChanged = true;
            return { ...node, cardIds: node.cardIds.filter((cid) => cid !== editingCard.id) };
          }
          return node;
        });
        return { ...tree, nodes: nextNodes };
      });

      if (treesChanged) {
        await onPersistNodeTrees(nextTrees);
      }

      setEditingCard(null);
      setIsAddingNewCard(false);
    } catch (err) {
      setDmError(getSaveError(err, "Failed to save card"));
    }
  };

  const handleDeleteCard = async (id: string) => {
    try {
      setDmError(null);
      const next = managedCards.filter((c) => c.id !== id);
      await onPersistCards(next);
      if (editingCard?.id === id) {
        setEditingCard(null);
        setIsAddingNewCard(false);
      }
    } catch (err) {
      setDmError(getSaveError(err, "Failed to delete card"));
    }
  };

  const handleCancelCardEdit = () => {
    setEditingCard(null);
    setIsAddingNewCard(false);
  };

  const updateCardField = <K extends keyof ManagedCard>(key: K, value: ManagedCard[K]) => {
    if (editingCard) setEditingCard({ ...editingCard, [key]: value });
  };

  const toggleCardTag = (tagName: string) => {
    if (!editingCard) return;
    const has = editingCard.tags.includes(tagName);
    updateCardField("tags", has ? editingCard.tags.filter((t) => t !== tagName) : [...editingCard.tags, tagName]);
  };

  const updateCardCustomField = (key: string, value: string) => {
    if (!editingCard) return;
    setEditingCard({ ...editingCard, customFields: { ...editingCard.customFields, [key]: value } });
  };

  const activeCardCustomFields = useMemo(
    () => (editingCard ? getActiveCustomFields(editingCard, cardTags) : []),
    [editingCard, cardTags],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Cards</h2>

      <div className="flex gap-2 mb-2">
        {([
          { id: "cards" as const, label: "Player Cards", icon: CreditCard, accent: "#4A7BFF" },
          { id: "levelabilities" as const, label: "Level Abilities", icon: Zap, accent: "#FFD700" },
        ]).map((sub) => (
          <button
            key={sub.id}
            onClick={() => setDmCardsSubTab(sub.id)}
            className={`${dmCardsSubTab === sub.id ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-4 py-2 text-[12px] flex items-center gap-1.5 transition-colors`}
            style={{ color: dmCardsSubTab === sub.id ? sub.accent : "#8A9ABB", fontWeight: dmCardsSubTab === sub.id ? 600 : 400 }}
          >
            <sub.icon size={14} /> {sub.label}
          </button>
        ))}
      </div>

      {dmCardsSubTab === "cards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px]" style={S_SECTION_HDR}>PLAYER CARDS</div>
            <button onClick={handleAddCard} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Plus size={14} /> Add Card
            </button>
          </div>

          {editingCard && (
            <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-[12px]" style={S_SECTION_HDR}>
                  {isAddingNewCard ? "ADD NEW CARD" : `EDITING: ${editingCard.name || "(unnamed)"}`}
                </div>
                <button onClick={handleCancelCardEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Card Name:</label>
                  <input type="text" value={editingCard.name} onChange={(e) => updateCardField("name", e.target.value)} placeholder="Enter card name..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Card Type:</label>
                  <input type="text" value={editingCard.type} onChange={(e) => updateCardField("type", e.target.value)} placeholder="e.g., Combat, Utility..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Action Cost:</label>
                  <input type="text" value={editingCard.actionCost} onChange={(e) => updateCardField("actionCost", e.target.value)} placeholder="e.g., 1 Action, Instant..." className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Level (Source Cost):</label>
                  <input type="number" min="0" value={editingCard.customFields["Level"] || ""} onChange={(e) => updateCardCustomField("Level", e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] block mb-1" style={labelStyle}>Source Type:</label>
                  <input type="text" value={editingCard.customFields["Source Type"] || ""} onChange={(e) => updateCardCustomField("Source Type", e.target.value)} placeholder="e.g., Arcane, Divine, Martial..." className={inputClass} style={inputStyle} />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[10px] block mb-1" style={labelStyle}>Assign to Players:</label>
                <div className={`${retro.sunken} bg-[#0A0A28] p-3 w-full md:w-2/3`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={editingCard.assignedTo.includes("all")} onChange={(e) => {
                      if (e.target.checked) updateCardField("assignedTo", ["all"]);
                      else updateCardField("assignedTo", []);
                    }} className="accent-[#4A9A5A]" />
                    <span className="text-[12px]" style={S_GREEN_BTN}>All Players</span>
                  </label>
                  <div className="h-[1px] mb-2" style={DM_DIVIDER} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {players.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" disabled={editingCard.assignedTo.includes("all")} checked={editingCard.assignedTo.includes("all") || editingCard.assignedTo.includes(p.id)} onChange={(e) => {
                          const current = editingCard.assignedTo.filter((id) => id !== "all");
                          if (e.target.checked) updateCardField("assignedTo", [...current, p.id]);
                          else updateCardField("assignedTo", current.filter((id) => id !== p.id));
                        }} className="accent-[#4A7BFF]" />
                        <span className="text-[12px]" style={dmAssignDim(editingCard.assignedTo.includes("all"))}>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[10px] block mb-1" style={labelStyle}>Node Tree Assignment (optional):</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] block mb-1" style={S_MUTED}>Node Tree:</label>
                    <select
                      value={editingCard.nodeTreeId || ""}
                      onChange={(e) => {
                        updateCardField("nodeTreeId" as keyof ManagedCard, e.target.value as any);
                        updateCardField("nodeId" as keyof ManagedCard, "" as any);
                      }}
                      className={`${inputClass} cursor-pointer`} style={inputStyle}
                    >
                      <option value="">-- None --</option>
                      {nodeTrees.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] block mb-1" style={S_MUTED}>Node:</label>
                    <select
                      value={editingCard.nodeId || ""}
                      onChange={(e) => updateCardField("nodeId" as keyof ManagedCard, e.target.value as any)}
                      className={`${inputClass} cursor-pointer`} style={inputStyle}
                      disabled={!editingCard.nodeTreeId}
                    >
                      <option value="">-- None --</option>
                      {editingCard.nodeTreeId &&
                        nodeTrees.find((t) => t.id === editingCard.nodeTreeId)?.nodes.map((n) => (
                          <option key={n.id} value={n.id}>{n.label}</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[10px] block mb-2" style={labelStyle}>Tags (click to toggle):</label>
                <div className="flex flex-wrap gap-1.5">
                  {cardTags.map((tag) => {
                    const active = editingCard.tags.includes(tag.name);
                    return (
                      <button key={tag.id} onClick={() => toggleCardTag(tag.name)} className="text-[10px] px-2.5 py-1 transition-colors flex items-center gap-1" style={{
                        color: active ? "#4A7BFF" : "#7A8AAA",
                        background: active ? "#1A2A5A" : "#0E0E30",
                        border: active ? "1px solid #2A3A6A" : "1px solid #1A1A3B",
                      }}>
                        {tag.name}
                        {tag.fields.length > 0 && <span className="text-[8px] opacity-70">+{tag.fields.length}</span>}
                      </button>
                    );
                  })}
                  {cardTags.length === 0 && <span className="text-[11px]" style={S_MUTED}>No card tags defined. Create tags in "Manage Tags" first.</span>}
                </div>
              </div>

              {activeCardCustomFields.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] mb-2" style={S_SECTION_HDR}>TAG FIELDS</div>
                  <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeCardCustomFields.map((cf) => {
                        const cfLabel = (
                          <label className="text-[10px] block mb-1" style={S_ACCENT}>
                            <span style={S_MUTED}>{cf.tagName} ›</span> {cf.fieldName}:
                          </label>
                        );

                        if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Type") {
                          return (
                            <div key={cf.key}>
                              {cfLabel}
                              <select value={editingCard.customFields[cf.key] || ""} onChange={(e) => {
                                updateCardCustomField(cf.key, e.target.value);
                                updateCardCustomField(cfKey("Timed Effect", "Buff Target"), "");
                              }} className={inputClass} style={inputStyle}>
                                <option value="">— None —</option>
                                <option value="attribute">Attribute</option>
                                <option value="skill">Skill</option>
                                <option value="resource">Resource</option>
                              </select>
                            </div>
                          );
                        }

                        if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Target") {
                          const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                          const ATTRS_TE = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL"];
                          const ALL_SKILLS_TE = ["Athletics", "Grappling", "Acrobatics", "Sleight of Hand", "Stealth", "Endurance", "Shock", "History", "Investigation", "Arcana", "Religion", "Medicine", "Nature", "Technology/Tinkering", "Perception", "Insight", "Survival", "Persuasion", "Charm", "Control", "Clear Mind"];
                          const ALL_RESOURCES_TE = ["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                          const options = buffTypeVal === "attribute" ? ATTRS_TE : buffTypeVal === "skill" ? ALL_SKILLS_TE : buffTypeVal === "resource" ? ALL_RESOURCES_TE : [];
                          const currentVal = editingCard.customFields[cf.key] || "";
                          const isValid = !currentVal || options.includes(currentVal);
                          if (!buffTypeVal) {
                            return (
                              <div key={cf.key}>
                                {cfLabel}
                                <input type="text" disabled placeholder="Select a Buff Type first..." className={inputClass} style={{ ...inputStyle, opacity: 0.4 }} />
                              </div>
                            );
                          }
                          return (
                            <div key={cf.key}>
                              {cfLabel}
                              <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                <option value="">— Select {buffTypeVal === "attribute" ? "Attribute" : buffTypeVal === "skill" ? "Skill" : "Resource"} —</option>
                                {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
                                {options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                              {!isValid && (
                                <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                  ⚠ "{currentVal}" won't apply — pick a valid {buffTypeVal} from the list
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (cf.tagName === "Timed Effect" && cf.fieldName === "Buff Value") {
                          const buffTypeVal = editingCard.customFields[cfKey("Timed Effect", "Buff Type")] || "";
                          return (
                            <div key={cf.key}>
                              {cfLabel}
                              <input type="text" value={editingCard.customFields[cf.key] || ""} onChange={(e) => updateCardCustomField(cf.key, e.target.value)} placeholder={buffTypeVal ? "e.g. +2, P, -1" : "Select Buff Type first..."} disabled={!buffTypeVal} className={inputClass} style={{ ...inputStyle, ...(!buffTypeVal ? { opacity: 0.4 } : {}) }} title="Buff value — use P for Potency substitution" />
                            </div>
                          );
                        }

                        if (cf.tagName === "Buff" && cf.fieldName === "Stat") {
                          const ALL_BUFF_STATS = ["STR", "AGI", "CON", "KNOW", "WIS", "WILL", "Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"];
                          const currentVal = editingCard.customFields[cf.key] || "";
                          const isValid = !currentVal || ALL_BUFF_STATS.includes(currentVal);
                          return (
                            <div key={cf.key}>
                              {cfLabel}
                              <select value={isValid ? currentVal : "__invalid__"} onChange={(e) => updateCardCustomField(cf.key, e.target.value === "__invalid__" ? "" : e.target.value)} className={inputClass} style={inputStyle}>
                                <option value="">— Select Stat —</option>
                                {!isValid && <option value="__invalid__" disabled style={S_RED}>⚠ "{currentVal}" (not recognized)</option>}
                                <optgroup label="Attributes">
                                  {["STR", "AGI", "CON", "KNOW", "WIS", "WILL"].map((a) => <option key={a} value={a}>{a}</option>)}
                                </optgroup>
                                <optgroup label="Resources">
                                  {["Max HP", "Armor Class", "Speed", "Movement", "Damage Reduction", "Temp HP", "Max Weight", "Total Wounds", "Max Exhaustion"].map((r) => <option key={r} value={r}>{r}</option>)}
                                </optgroup>
                              </select>
                              {!isValid && (
                                <div className="text-[9px] mt-1 flex items-center gap-1" style={S_RED}>
                                  ⚠ "{currentVal}" won't be recognized — pick from the list
                                </div>
                              )}
                            </div>
                          );
                        }

                        return renderTypedField(
                          cf.key,
                          cf.fieldDef,
                          editingCard.customFields[cf.key] || cf.fieldDef.defaultValue || "",
                          updateCardCustomField,
                          cfLabel,
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="text-[10px] block mb-1" style={labelStyle}>Card Effect:</label>
                <RichTextEditor value={editingCard.effect} onChange={(html) => updateCardField("effect", html)} placeholder="Enter card effect description..." minHeight={80} />
              </div>

              <div className="flex gap-2">
                <button onClick={handleSaveCard} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
                  <Save size={14} /> {isAddingNewCard ? "Add Card" : "Save Changes"}
                </button>
                <button onClick={handleCancelCardEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
              </div>
            </div>
          )}

          <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
            <div className="text-[12px] mb-3" style={S_SECTION_HDR}>ALL CARDS ({managedCards.length})</div>
            {managedCards.length === 0 ? (
              <div className="text-[12px] text-center py-6" style={S_MUTED}>No cards created yet.</div>
            ) : (
              <div className="space-y-2">
                {managedCards.map((card) => {
                  const ownerStr = formatOwners(card.assignedTo, players);
                  const cardCustomFields = getActiveCustomFields(card, cardTags).filter((cf) => card.customFields[cf.key]);
                  return (
                    <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px]" style={S_TEXT_BOLD}>{card.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5" style={DM_ACTION_BADGE}>{card.actionCost}</span>
                            {card.customFields["Level"] && parseInt(card.customFields["Level"]) > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5" style={DM_LEVEL_BADGE}>Lv.{card.customFields["Level"]}</span>
                            )}
                            {card.customFields["Source Type"] && (
                              <span className="text-[9px] px-1.5 py-0.5" style={{ color: "#9A7ABB", border: "1px solid #9A7ABB40", background: "#9A7ABB15" }}>{card.customFields["Source Type"]}</span>
                            )}
                          </div>
                          <div className="text-[11px]" style={S_MUTED}>
                            {card.type} · Assigned to: {ownerStr}
                            {card.nodeTreeId && (() => {
                              const nt = nodeTrees.find((t) => t.id === card.nodeTreeId);
                              const nd = nt?.nodes.find((n) => n.id === card.nodeId);
                              return nt ? (
                                <span style={DISPLAY_CONTENTS}>
                                  {" "}· <GitBranch size={9} className="inline" style={DM_NODE_ICON} /> {nt.name}{nd ? ` / ${nd.label}` : ""}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={async () => { setEditingCard({ ...card, customFields: { ...card.customFields } }); setIsAddingNewCard(false); }} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}>
                            <Edit size={12} className="inline mr-1" />Edit
                          </button>
                          <button onClick={() => handleDeleteCard(card.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}>
                            <Trash2 size={12} className="inline mr-1" />Remove
                          </button>
                        </div>
                      </div>
                      {card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {card.tags.map((t) => (
                            <span key={t} className="text-[9px] px-1.5 py-0.5" style={DM_TAG_BADGE}>{t}</span>
                          ))}
                        </div>
                      )}
                      {cardCustomFields.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {cardCustomFields.map((cf) => (
                            <span key={cf.key} className="text-[10px]">
                              <span style={S_MUTED}>{cf.fieldName}:</span>{" "}
                              <span style={S_TEXT}>{card.customFields[cf.key]}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {card.effect && (
                        <div className="text-[11px] mt-1" style={S_SUBTLE}>{card.effect}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {dmCardsSubTab === "levelabilities" && (() => {
        const sortedLevels = [...levelCategories].sort((a, b) => a.order - b.order);
        const selectedPlayer = players.find((p) => p.id === laSelectedPlayerId);
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[12px]" style={S_SECTION_HDR}>LEVEL ABILITY CATEGORIES</div>
            </div>
            <p className="text-[10px]" style={S_SUBTLE}>
              Create level categories per player and assign cards to them. Each player has their own set of level categories. Select a player below to manage their Level Abilities.
            </p>

            {players.length === 0 ? (
              <div className="text-[12px] text-center py-6" style={S_MUTED}>No players created yet. Add players in the Manage Players section first.</div>
            ) : (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {players.map((p) => {
                    const isActive = laSelectedPlayerId === p.id;
                    const totalCards = isActive ? levelCategories.reduce((sum, c) => sum + c.cardIds.length, 0) : 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setLaSelectedPlayerId(p.id)}
                        className={`${isActive ? retro.sunken + " bg-[#0C0C2E]" : retro.raised + " bg-[#161648] hover:bg-[#1E1E58]"} px-3 py-2 text-[11px] flex items-center gap-1.5 transition-colors`}
                        style={{ color: isActive ? "#FFD700" : "#8A9ABB", fontWeight: isActive ? 600 : 400, borderBottom: isActive ? "2px solid #FFD700" : "2px solid transparent" }}
                      >
                        <User size={12} />
                        {p.name}
                        {isActive && (
                          <span className="text-[9px] px-1 py-0.5 ml-0.5" style={{ background: "#0A0A28", color: "#FFD700", border: "1px solid #FFD70044" }}>
                            {levelCategories.length} lvl · {totalCards} cards
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedPlayer && (
                  <div className="flex items-center gap-2 mb-3">
                    {!laCopyConfirm ? (
                      <button
                        onClick={() => setLaCopyConfirm(true)}
                        className={`${retro.button} px-3 py-1.5 text-[10px] flex items-center gap-1.5`}
                        style={{ color: "#C4A0FF", border: "1px solid #C4A0FF33" }}
                        title={`Copy ${selectedPlayer.name}'s level categories to all other players`}
                      >
                        <Copy size={11} /> Copy {selectedPlayer.name}'s Levels to All Players
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: "#FF9A4A" }}>
                          This will overwrite all other players' level categories with {selectedPlayer.name}'s. Continue?
                        </span>
                        <button onClick={copyLevelCategoriesToAllPlayers} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_GREEN_BTN}>Yes, Copy</button>
                        <button onClick={() => setLaCopyConfirm(false)} className={`${retro.button} px-3 py-1.5 text-[10px]`} style={S_RED}>Cancel</button>
                      </div>
                    )}
                  </div>
                )}

                <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
                  {laAddingLevel ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={laNewLevelName}
                        onChange={(e) => setLaNewLevelName(e.target.value)}
                        placeholder="Level name (e.g. Level 1, Tier 2...)"
                        className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                        style={{ color: "#FFD700" }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && laNewLevelName.trim()) {
                            const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                            void saveLevelCategories([...levelCategories, newCat]);
                            setLaNewLevelName("");
                            setLaAddingLevel(false);
                          }
                        }}
                        autoFocus
                      />
                      <button onClick={async () => {
                        if (laNewLevelName.trim()) {
                          const newCat = { id: `lvl-${Date.now()}`, name: laNewLevelName.trim(), order: levelCategories.length, cardIds: [] as string[], description: "" };
                          await saveLevelCategories([...levelCategories, newCat]);
                          setLaNewLevelName("");
                          setLaAddingLevel(false);
                        }
                      }} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_GREEN_BTN}><Plus size={12} /> Add</button>
                      <button onClick={() => { setLaAddingLevel(false); setLaNewLevelName(""); }} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_RED}><X size={12} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setLaAddingLevel(true)} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={{ color: "#FFD700", border: "1px solid #FFD70044" }}>
                      <Plus size={14} /> Add Level Category
                    </button>
                  )}
                </div>

                {selectedPlayer && sortedLevels.length === 0 ? (
                  <div className="text-[12px] text-center py-8" style={S_MUTED}>No level categories created for {selectedPlayer.name} yet. Add one above to get started.</div>
                ) : selectedPlayer && (
                  <div className="space-y-3">
                    {(() => {
                      const playerAssignedCards = managedCards.filter((c) => c.assignedTo.includes(laSelectedPlayerId) || c.assignedTo.includes("all"));
                      const totalCards = managedCards.length;
                      const playerCardCount = playerAssignedCards.length;
                      const unassignedToLevelCount = playerAssignedCards.filter((c) => !levelCategories.some((lc) => lc.cardIds.includes(c.id))).length;
                      return (<>
                        <div className="flex items-center gap-3 flex-wrap px-1 mb-1">
                          <span className="text-[10px] px-2 py-1" style={{ background: "#0A0A28", color: "#7A8AAA", border: "1px solid #1A1A4B" }}>
                            <CreditCard size={10} className="inline mr-1 -mt-0.5" />{playerCardCount} of {totalCards} cards assigned to {selectedPlayer?.name}
                          </span>
                          {unassignedToLevelCount > 0 && (
                            <span className="text-[10px] px-2 py-1" style={{ background: "#1A0A0A", color: "#FF9A5A", border: "1px solid #4B2A1A" }}>
                              {unassignedToLevelCount} card{unassignedToLevelCount !== 1 ? "s" : ""} not in any level
                            </span>
                          )}
                        </div>
                        {sortedLevels.map((level, levelIdx) => {
                          const isCollapsed = laCollapsedLevels.has(level.id);
                          const levelCards = playerAssignedCards.filter((c) => level.cardIds.includes(c.id));
                          const assignedCardIds = new Set(levelCategories.flatMap((lc) => lc.cardIds));
                          const availableCards = playerAssignedCards.filter((c) => !assignedCardIds.has(c.id));
                          return (
                            <div key={level.id} className={`${retro.sunken} bg-[#0C0C2E]`}>
                              <div
                                className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[#0E0E35] transition-colors"
                                style={{ borderBottom: isCollapsed ? "none" : "1px solid #1A1A4B" }}
                                onClick={() => setLaCollapsedLevels((prev) => { const n = new Set(prev); if (n.has(level.id)) n.delete(level.id); else n.add(level.id); return n; })}
                              >
                                <ChevronRight size={14} style={{ color: "#FFD700", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.2s ease" }} />
                                {laEditingLevel === level.id ? (
                                  <input
                                    value={level.name}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, name: e.target.value } : lc))}
                                    onBlur={() => setLaEditingLevel(null)}
                                    onKeyDown={async (e) => { if (e.key === "Enter") setLaEditingLevel(null); }}
                                    className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[13px] flex-1 outline-none`}
                                    style={{ color: "#FFD700" }}
                                    autoFocus
                                  />
                                ) : (
                                  <span className="text-[13px] flex-1" style={{ color: "#FFD700", fontWeight: 600 }}>{level.name}</span>
                                )}
                                <span className="text-[9px] px-1.5 py-0.5" style={{ background: "#0A0A28", color: "#7A8AAA", border: "1px solid #1A1A4B" }}>
                                  {levelCards.length} card{levelCards.length !== 1 ? "s" : ""}
                                </span>
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  {levelIdx > 0 && (
                                    <button onClick={async () => {
                                      const prev = sortedLevels[levelIdx - 1];
                                      await saveLevelCategories(levelCategories.map((l) => l.id === level.id ? { ...l, order: prev.order } : l.id === prev.id ? { ...l, order: level.order } : l));
                                    }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move up"><ChevronUp size={12} /></button>
                                  )}
                                  {levelIdx < sortedLevels.length - 1 && (
                                    <button onClick={async () => {
                                      const next = sortedLevels[levelIdx + 1];
                                      await saveLevelCategories(levelCategories.map((l) => l.id === level.id ? { ...l, order: next.order } : l.id === next.id ? { ...l, order: level.order } : l));
                                    }} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#7A8AAA" }} title="Move down"><ChevronDown size={12} /></button>
                                  )}
                                  <button onClick={() => setLaEditingLevel(level.id)} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#4A7BFF" }} title="Rename"><Edit size={12} /></button>
                                  <button onClick={() => void saveLevelCategories(levelCategories.filter((lc) => lc.id !== level.id))} className="hover:brightness-150 px-1 py-0.5" style={{ color: "#FF5A5A" }} title="Delete category"><Trash2 size={12} /></button>
                                </div>
                              </div>

                              {!isCollapsed && (
                                <div className="px-4 pb-4 pt-2 space-y-3">
                                  <div>
                                    <div className="text-[10px] mb-1" style={S_SECTION_HDR}>DESCRIPTION</div>
                                    {laEditingDesc === level.id ? (
                                      <div className="space-y-2">
                                        <textarea
                                          value={level.description || ""}
                                          onChange={(e) => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, description: e.target.value } : lc))}
                                          placeholder="Add a description for this level category..."
                                          className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none resize-y min-h-[60px]`}
                                          style={{ color: "#C0D0F0" }}
                                          rows={3}
                                        />
                                        <button onClick={() => setLaEditingDesc(null)} className={`${retro.button} px-3 py-1 text-[10px]`} style={S_ACCENT}>Done</button>
                                      </div>
                                    ) : (
                                      <div className="text-[11px] cursor-pointer px-2 py-1.5 hover:bg-[#0A0A28] transition-colors" style={{ color: level.description ? "#C0D0F0" : "#4A5A7A", border: "1px dashed #1A1A4B" }} onClick={() => setLaEditingDesc(level.id)}>
                                        {level.description || "Click to add a description..."}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ASSIGNED CARDS ({levelCards.length})</div>
                                    {levelCards.length === 0 ? (
                                      <div className="text-[11px] py-2" style={S_MUTED}>No cards assigned to this level yet.</div>
                                    ) : (
                                      <div className="space-y-1">
                                        {levelCards.map((card) => (
                                          <div key={card.id} className={`${retro.raised} bg-[#0E0E35] p-2 flex items-center justify-between`}>
                                            <div>
                                              <span className="text-[12px]" style={S_TEXT_BOLD}>{card.name}</span>
                                              <span className="text-[10px] ml-2" style={S_MUTED}>{card.type} · {card.actionCost}</span>
                                              {card.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                  {card.tags.map((t) => <span key={t} className="text-[8px] px-1 py-0.5" style={DM_TAG_BADGE}>{t}</span>)}
                                                </div>
                                              )}
                                            </div>
                                            <button onClick={() => void saveLevelCategories(levelCategories.map((lc) => lc.id === level.id ? { ...lc, cardIds: lc.cardIds.filter((cid) => cid !== card.id) } : lc))} className={`${retro.button} px-2 py-1 text-[10px] shrink-0`} style={S_RED}>
                                              <X size={10} className="inline mr-0.5" />Remove
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {availableCards.length > 0 && (
                                    <div>
                                      <div className="text-[10px] mb-1" style={S_SECTION_HDR}>ADD CARD</div>
                                      <select className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[11px] w-full outline-none`} style={{ color: "#C0D0F0" }} value="" onChange={(e) => {
                                        if (!e.target.value) return;
                                        const cardId = e.target.value;
                                        void saveLevelCategories(levelCategories.map((lc) => ({
                                          ...lc,
                                          cardIds: lc.id === level.id ? [...lc.cardIds.filter((cid) => cid !== cardId), cardId] : lc.cardIds.filter((cid) => cid !== cardId),
                                        })));
                                      }}>
                                        <option value="">+ Assign a card to {level.name}...</option>
                                        {availableCards.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>);
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
