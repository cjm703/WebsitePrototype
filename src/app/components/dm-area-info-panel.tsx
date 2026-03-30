import React, { useMemo, useState } from "react";
import {
  Plus,
  X,
  Edit,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  FileText,
  FolderTree,
  Eye,
  LayoutTemplate,
  Settings2,
  Layers3,
} from "lucide-react";
import { RichTextEditor } from "./rich-text-editor";
import { renderInfoDisplayMode } from "./personal-files-information-renderers";

const INFO_SUBTAB_SORT_OPTIONS = [
  { value: "custom", label: "Manual Order" },
  { value: "title", label: "Title (A-Z)" },
  { value: "category", label: "Category" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
] as const;

const INFO_UNASSIGNED_FILTER = "__unassigned__";

const DISPLAY_MODE_OPTIONS = [
  { value: "digital", label: "Digital Document", help: "Computer-style page with scanline and glow presentation." },
  { value: "paper", label: "Paper Document", help: "Physical-paper style page with margin and serif presentation." },
  { value: "item:stone_tablet", label: "Stone Tablet", help: "Item-focused page rendered as an inscribed stone tablet." },
] as const;

function stripHtml(value: string) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

const previewTheme = {
  accentColor: "#4A7BFF",
  textColor: "#D7E4FF",
  labelColor: "#8FA2D9",
  panelBorder: "#232B5B",
  panelBg: "#0A0D1A",
  cardBg: "#0E1222",
};

function modeLabel(value: string | undefined) {
  return DISPLAY_MODE_OPTIONS.find((opt) => opt.value === value)?.label || "Digital Document";
}

function modeHelp(value: string | undefined) {
  return DISPLAY_MODE_OPTIONS.find((opt) => opt.value === value)?.help || "";
}

function ownerLabel(ids: string[] | undefined, players: any[]) {
  if (!ids || ids.length === 0) return "Unassigned";
  if (ids.includes("all")) return "All Players";
  return ids.map((id) => players.find((p) => p.id === id)?.name || "Unknown").join(", ");
}

export function DMInfoManagerSection(props: any) {
  const {
    retro,
    players,
    managedInfos,
    editingInfo,
    isAddingNewInfo,
    infoTags,
    infoSubTabs,
    newInfoSubTabName,
    setNewInfoSubTabName,
    infoManagerSubTabFilter,
    setInfoManagerSubTabFilter,
    infoBulkAssignTarget,
    setInfoBulkAssignTarget,
    infoBulkSelection,
    setInfoBulkSelection,
    editingInfoSubTabId,
    setEditingInfoSubTabId,
    editingInfoSubTabName,
    setEditingInfoSubTabName,
    followUpInfoId,
    setFollowUpInfoId,
    followUpText,
    setFollowUpText,
    setDmError,
    labelStyle,
    inputClass,
    inputStyle,
    renderTypedField,
    getActiveCustomFields,
    getInfoSubTabNameError,
    getInfoSubTabColorError,
    normalizeInfoSubTabDraft,
    ensureSingleDefaultInfoSubTab,
    persistInfoSubTabs,
    moveInfoSubTab,
    deleteInfoSubTab,
    handleAddInfo,
    handleSaveInfo,
    handleDeleteInfo,
    handleCancelInfoEdit,
    updateInfoField,
    toggleInfoTag,
    updateInfoCustomField,
    persistInfos,
    setEditingInfo,
    S_ACCENT_HDR,
    S_SECTION_HDR,
    S_MUTED,
    S_DIM,
    S_TEXT,
    S_WARN,
    S_GREEN_BTN,
    S_SUBTLE,
    S_RED,
    DM_PANEL,
    DM_PANEL_ALT,
    DM_TAG_BADGE,
  } = props;

  const [editorTab, setEditorTab] = useState<"content" | "display" | "preview">("content");

  const activeInfoCustomFields = editingInfo ? getActiveCustomFields(editingInfo, infoTags) : [];
  const sortedSubTabs = [...infoSubTabs].sort((a: any, b: any) => a.order - b.order);

  const filteredInfos = managedInfos.filter((info: any) => {
    if (infoManagerSubTabFilter === "all") return true;
    if (infoManagerSubTabFilter === INFO_UNASSIGNED_FILTER) return !info.infoSubTab;
    return info.infoSubTab === infoManagerSubTabFilter;
  });

  const selectedBulkCount = Object.values(infoBulkSelection).filter(Boolean).length;

  const previewInfo = useMemo(() => {
    if (!editingInfo) return null;
    return {
      ...editingInfo,
      title: editingInfo.title || "Untitled Information",
      content: editingInfo.content || editingInfo.description || "<p>This preview will show how the page renders for the player.</p>",
      displayMode: (editingInfo as any).displayMode || "digital",
      displayData: (editingInfo as any).displayData || {},
    };
  }, [editingInfo]);

  const getInheritedAssignedTo = (subTabId: string) => {
    const subTab = infoSubTabs.find((st: any) => st.id === subTabId);
    const assignedTo = Array.isArray(subTab?.assignedTo) ? subTab.assignedTo : [];
    return assignedTo;
  };

  const applyBulkAssign = async () => {
    const selectedIds = new Set(Object.entries(infoBulkSelection).filter(([, checked]) => checked).map(([id]) => id));
    if (selectedIds.size === 0) return;

    const inherited = getInheritedAssignedTo(infoBulkAssignTarget);
    const next = managedInfos.map((info: any) =>
      selectedIds.has(info.id)
        ? {
            ...info,
            infoSubTab: infoBulkAssignTarget,
            assignedTo: inherited.length ? inherited : info.assignedTo,
          }
        : info
    );
    await persistInfos(next);
    setInfoBulkSelection({});
  };

  const addFollowUp = async (infoId: string) => {
    const text = followUpText.trim();
    if (!text) return;
    const next = managedInfos.map((info: any) =>
      info.id === infoId
        ? {
            ...info,
            followUps: [
              ...(info.followUps || []),
              {
                id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: "",
                content: text,
              },
            ],
          }
        : info
    );
    await persistInfos(next);
    setFollowUpText("");
    setFollowUpInfoId(null);
  };

  const assignInfoSubTab = (subTabId: string) => {
    updateInfoField("infoSubTab", subTabId);
    const inherited = getInheritedAssignedTo(subTabId);
    if (inherited.length) {
      updateInfoField("assignedTo", inherited);
    }
  };

  const updateEditingInfo = (nextOrUpdater: any) => {
    if (typeof setEditingInfo !== "function") return;

    if (typeof nextOrUpdater === "function") {
      setEditingInfo((prev: any) => nextOrUpdater(prev));
      return;
    }

    setEditingInfo(nextOrUpdater);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px]" style={S_ACCENT_HDR}>Manage Player Information</h2>
          <div className="text-[10px] mt-1" style={S_MUTED}>
            Organize folders, create papers, choose display styles, and preview player-facing results.
          </div>
        </div>
        <button onClick={handleAddInfo} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> Add Info
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        <div className="space-y-4">
          <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <FolderTree size={15} style={S_SUBTLE} />
              <div className="text-[12px]" style={S_SECTION_HDR}>INFORMATION SUB-TABS</div>
            </div>
            <div className="text-[10px] mb-3" style={S_MUTED}>
              These are the top-level and nested folders players browse in the Information explorer.
            </div>

            <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
              {sortedSubTabs.map((st: any, index: number, arr: any[]) => (
                <div key={st.id} className="p-3" style={DM_PANEL}>
                  {editingInfoSubTabId === st.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Name</label>
                          <input type="text" value={editingInfoSubTabName} onChange={(e) => setEditingInfoSubTabName(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Parent Sub-Tab</label>
                          <select value={st.parentId || ""} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, parentId: e.target.value } : tab))} className={inputClass} style={inputStyle}>
                            <option value="">Top Level</option>
                            {sortedSubTabs.filter((tab: any) => tab.id !== st.id).map((tab: any) => (
                              <option key={tab.id} value={tab.id}>{tab.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Icon</label>
                          <input type="text" value={st.icon || ""} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, icon: e.target.value } : tab))} className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Accent Color</label>
                          <input type="text" value={st.color || ""} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, color: e.target.value } : tab))} className={inputClass} style={inputStyle} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Sort Mode</label>
                          <select value={st.sortMode || "custom"} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, sortMode: e.target.value } : tab))} className={inputClass} style={inputStyle}>
                            {INFO_SUBTAB_SORT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Assigned To</label>
                          <select value={Array.isArray(st.assignedTo) && st.assignedTo.includes("all") ? "all" : ((st.assignedTo || [])[0] || "")} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, assignedTo: e.target.value === "all" ? ["all"] : e.target.value ? [e.target.value] : [] } : tab))} className={inputClass} style={inputStyle}>
                            <option value="">No default player assignment</option>
                            <option value="all">All Players</option>
                            {players.filter((p: any) => p.id !== "dm").map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                        <input type="text" value={st.description || ""} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, description: e.target.value } : tab))} className={inputClass} style={inputStyle} />
                      </div>

                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!st.isDefault} onChange={async (e) => {
                            const next = ensureSingleDefaultInfoSubTab(
                              infoSubTabs.map((tab: any) =>
                                tab.id === st.id ? { ...tab, isDefault: e.target.checked } : { ...tab, isDefault: false }
                              )
                            );
                            await persistInfoSubTabs(next.map(normalizeInfoSubTabDraft));
                          }} className="accent-[#4A7BFF]" />
                          <span className="text-[11px]" style={S_TEXT}>Default tab</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!st.showEmpty} onChange={(e) => props.setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, showEmpty: e.target.checked } : tab))} className="accent-[#4A7BFF]" />
                          <span className="text-[11px]" style={S_TEXT}>Show when empty</span>
                        </label>
                      </div>

                      {(getInfoSubTabNameError(editingInfoSubTabName, st.id) || getInfoSubTabColorError(st.color)) && (
                        <div className="text-[10px]" style={S_WARN}>
                          {getInfoSubTabNameError(editingInfoSubTabName, st.id) || getInfoSubTabColorError(st.color)}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-[10px]" style={S_DIM}>
                          {managedInfos.filter((info: any) => info.infoSubTab === st.id).length} assigned • {ownerLabel(st.assignedTo, players)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={async () => {
                            const nameError = getInfoSubTabNameError(editingInfoSubTabName, st.id);
                            const colorError = getInfoSubTabColorError(st.color);
                            if (nameError || colorError) {
                              setDmError(nameError || colorError);
                              return;
                            }
                            const next = ensureSingleDefaultInfoSubTab(
                              infoSubTabs.map((s: any) =>
                                s.id === st.id ? normalizeInfoSubTabDraft({ ...s, name: editingInfoSubTabName.trim() }) : normalizeInfoSubTabDraft(s)
                              )
                            );
                            await persistInfoSubTabs(next);
                            setEditingInfoSubTabId(null);
                            setEditingInfoSubTabName("");
                          }} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`} style={{ color: "#4A9A5A" }}>
                            <Save size={11} /> Save
                          </button>
                          <button onClick={() => { setEditingInfoSubTabId(null); setEditingInfoSubTabName(""); }} className={`${retro.button} px-3 py-1.5 text-[11px]`} style={{ color: "#C77B7B" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[12px] font-semibold flex items-center gap-2" style={{ color: st.color || "#D7E2FF" }}>
                            <span>{st.icon || "📁"}</span>
                            <span>{st.name}</span>
                            {st.isDefault && <span className="px-1.5 py-0.5 text-[4px]" style={DM_TAG_BADGE}>Default</span>}
                          </div>
                          {st.description && <div className="text-[10px] mt-1" style={S_MUTED}>{st.description}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveInfoSubTab(st.id, -1)} disabled={index === 0} className="hover:opacity-80 disabled:opacity-30"><ChevronUp size={14} style={S_DIM} /></button>
                          <button onClick={() => moveInfoSubTab(st.id, 1)} disabled={index === arr.length - 1} className="hover:opacity-80 disabled:opacity-30"><ChevronDown size={14} style={S_DIM} /></button>
                          <button onClick={() => { setEditingInfoSubTabId(st.id); setEditingInfoSubTabName(st.name); }} className="hover:opacity-80"><Edit size={13} style={S_SUBTLE} /></button>
                          <button onClick={() => deleteInfoSubTab(st.id)} className="hover:opacity-80"><Trash2 size={13} style={S_RED} /></button>
                        </div>
                      </div>
                      <div className="text-[10px] flex flex-wrap gap-3" style={S_DIM}>
                        <span>{managedInfos.filter((info: any) => info.infoSubTab === st.id).length} assigned</span>
                        <span>Parent: {sortedSubTabs.find((tab: any) => tab.id === st.parentId)?.name || "Top Level"}</span>
                        <span>Owners: {ownerLabel(st.assignedTo, players)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-[#1A1A3B]">
              <div className="text-[11px] mb-2" style={S_SUBTLE}>Add New Sub-Tab</div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" value={newInfoSubTabName} onChange={(e) => setNewInfoSubTabName(e.target.value)} placeholder="New Information Sub-Tab..." className={inputClass} style={{ ...inputStyle, width: 220 }} />
                <button onClick={async () => {
                  const error = getInfoSubTabNameError(newInfoSubTabName);
                  if (error) {
                    setDmError(error);
                    return;
                  }
                  const next = ensureSingleDefaultInfoSubTab([
                    ...infoSubTabs,
                    {
                      id: `ist-${Date.now()}`,
                      name: newInfoSubTabName.trim(),
                      order: infoSubTabs.length,
                      description: "",
                      icon: "",
                      color: "",
                      parentId: "",
                      assignedTo: [],
                      isDefault: infoSubTabs.length === 0,
                      sortMode: "custom",
                      showEmpty: false,
                    },
                  ]);
                  await persistInfoSubTabs(next);
                  setNewInfoSubTabName("");
                }} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`} style={{ color: newInfoSubTabName.trim() ? "#4A9A5A" : "#3A4A6A" }}>
                  <Plus size={11} /> Add
                </button>
              </div>
            </div>
          </div>

          <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Layers3 size={15} style={S_SUBTLE} />
              <div className="text-[12px]" style={S_SECTION_HDR}>INFO LIBRARY</div>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-3">
              <select value={infoManagerSubTabFilter} onChange={(e) => setInfoManagerSubTabFilter(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="all">All Information</option>
                <option value={INFO_UNASSIGNED_FILTER}>Unassigned Only</option>
                {sortedSubTabs.map((st: any) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <select value={infoBulkAssignTarget} onChange={(e) => setInfoBulkAssignTarget(e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Bulk assign selected to...</option>
                  <option value="">Clear sub-tab assignment</option>
                  {sortedSubTabs.map((st: any) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
                <button onClick={applyBulkAssign} disabled={!selectedBulkCount} className={`${retro.button} px-3 py-2 text-[11px] shrink-0`} style={{ color: selectedBulkCount ? "#4A9A5A" : "#3A4A6A" }}>
                  Apply
                </button>
              </div>
            </div>

            <div className="text-[10px] mb-2" style={S_DIM}>
              {filteredInfos.length} shown • {selectedBulkCount} selected
            </div>

            <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
              {filteredInfos.map((info: any) => {
                const displayMode = info.displayMode || "digital";
                return (
                  <div key={info.id} className="p-3" style={DM_PANEL}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={!!infoBulkSelection[info.id]} onChange={(e) => setInfoBulkSelection((prev: any) => ({ ...prev, [info.id]: e.target.checked }))} className="mt-1 accent-[#4A7BFF]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold truncate" style={S_TEXT}>{info.title || "(untitled)"}</div>
                            <div className="text-[10px] mt-1 flex flex-wrap gap-3" style={S_DIM}>
                              <span>{modeLabel(displayMode)}</span>
                              <span>{info.category || "No category path"}</span>
                              <span>{ownerLabel(info.assignedTo, players)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => updateEditingInfo(info)} className="hover:opacity-80"><Edit size={13} style={S_SUBTLE} /></button>
                            <button onClick={() => handleDeleteInfo(info.id)} className="hover:opacity-80"><Trash2 size={13} style={S_RED} /></button>
                          </div>
                        </div>

                        <div className="text-[10px] mt-2" style={S_MUTED}>
                          {stripHtml(info.content || info.description || "").slice(0, 180) || "No content yet."}
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          {followUpInfoId === info.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input type="text" value={followUpText} onChange={(e) => setFollowUpText(e.target.value)} placeholder="Quick follow-up note..." className={inputClass} style={inputStyle} />
                              <button onClick={() => addFollowUp(info.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={{ color: "#4A9A5A" }}>Add</button>
                              <button onClick={() => { setFollowUpInfoId(null); setFollowUpText(""); }} className={`${retro.button} px-2 py-1 text-[10px]`} style={{ color: "#C77B7B" }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setFollowUpInfoId(info.id)} className={`${retro.button} px-2 py-1 text-[10px]`} style={{ color: "#7BA8FF" }}>
                              Quick Follow-Up
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {editingInfo ? (
            <div className={`${retro.sunken} bg-[#0C0C2E] p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[12px]" style={S_SECTION_HDR}>
                    {isAddingNewInfo ? "ADD NEW INFORMATION" : `EDITING: ${editingInfo.title || "(untitled)"}`}
                  </div>
                  <div className="text-[10px] mt-1" style={S_MUTED}>
                    Build the information page, choose how it renders, and preview it for players.
                  </div>
                </div>
                <button onClick={handleCancelInfoEdit} className="hover:opacity-80"><X size={16} style={S_RED} /></button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: "content", label: "Content", icon: FileText },
                  { key: "display", label: "Display", icon: LayoutTemplate },
                  { key: "preview", label: "Preview", icon: Eye },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = editorTab === tab.key;
                  return (
                    <button key={tab.key} type="button" onClick={() => setEditorTab(tab.key as any)} className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1.5`} style={active ? DM_TAG_BADGE : { color: "#8FA2D9" }}>
                      <Icon size={12} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {editorTab === "content" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-[10px] block mb-1" style={labelStyle}>Title</label>
                      <input type="text" value={editingInfo.title} onChange={(e) => updateInfoField("title", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Category Path</label>
                      <input type="text" value={editingInfo.category || ""} onChange={(e) => updateInfoField("category", e.target.value)} placeholder="Faction / Reports / Ancient" className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Info Sub-Tab</label>
                      <select value={editingInfo.infoSubTab || ""} onChange={(e) => assignInfoSubTab(e.target.value)} className={inputClass} style={inputStyle}>
                        <option value="">None</option>
                        {sortedSubTabs.map((st: any) => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Assigned To</label>
                      <select value={(editingInfo.assignedTo || []).includes("all") ? "all" : ((editingInfo.assignedTo || [])[0] || "")} onChange={(e) => updateInfoField("assignedTo", e.target.value === "all" ? ["all"] : e.target.value ? [e.target.value] : [])} className={inputClass} style={inputStyle}>
                        <option value="">No player assignment</option>
                        <option value="all">All Players</option>
                        {players.filter((p: any) => p.id !== "dm").map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <div className="text-[10px] mt-1" style={S_MUTED}>
                        Selecting a sub-tab with owners auto-fills this, but you can override it here.
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Real World Time</label>
                      <input type="text" value={editingInfo.realWorldTime || ""} onChange={(e) => updateInfoField("realWorldTime", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>In-World Time</label>
                      <input type="text" value={editingInfo.inWorldTime || ""} onChange={(e) => updateInfoField("inWorldTime", e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] mb-1" style={labelStyle}>Content</div>
                    <RichTextEditor value={editingInfo.content || ""} onChange={(value) => updateInfoField("content", value)} placeholder="Write the information page here..." />
                  </div>

                  <div>
                    <div className="text-[10px] mb-2" style={labelStyle}>Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {infoTags.map((tag: any) => (
                        <button key={tag.name} type="button" onClick={() => toggleInfoTag(tag.name)} className={`${retro.button} px-2 py-1 text-[10px]`} style={editingInfo.tags?.includes(tag.name) ? DM_TAG_BADGE : { color: "#8FA2D9", background: "#0A0A28", border: "1px solid #1A1A3B" }}>
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeInfoCustomFields.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeInfoCustomFields.map((fieldDef: any) => {
                        const key = `${fieldDef.tagName}::${fieldDef.name}`;
                        const value = editingInfo.customFields?.[key] || "";
                        return (
                          <React.Fragment key={key}>
                            {renderTypedField(key, fieldDef, value, updateInfoCustomField, <label className="text-[10px] block mb-1" style={labelStyle}>{fieldDef.name}</label>)}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {editorTab === "display" && (
                <div className="space-y-4">
                  <div className="p-4" style={DM_PANEL}>
                    <div className="flex items-center gap-2 mb-2">
                      <Settings2 size={14} style={S_SUBTLE} />
                      <div className="text-[12px]" style={S_SECTION_HDR}>Display Style</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {DISPLAY_MODE_OPTIONS.map((option) => {
                        const active = ((editingInfo as any).displayMode || "digital") === option.value;
                        return (
                          <button key={option.value} type="button" onClick={() => updateEditingInfo((prev: any) => ({
                            ...prev,
                            displayMode: option.value,
                            displayData: {
                              ...(prev.displayData || {}),
                              ...(option.value === "item:stone_tablet" ? { alignment: prev.displayData?.alignment || "left" } : {}),
                              ...(option.value === "paper" ? { futurePaperOverlayMode: prev.displayData?.futurePaperOverlayMode || "pixel_handwriting" } : {}),
                            },
                          }))} className="text-left p-3 rounded border transition-colors" style={active ? DM_TAG_BADGE : DM_PANEL_ALT}>
                            <div className="text-[12px] font-semibold">{option.label}</div>
                            <div className="text-[10px] mt-1" style={active ? { color: "#D7E2FF" } : S_MUTED}>{option.help}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {(editingInfo as any).displayMode === "paper" && (
                    <div className="p-4" style={DM_PANEL}>
                      <div className="text-[12px] mb-2" style={S_SECTION_HDR}>Paper Options</div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Future Overlay Planning Hook</label>
                      <select value={(editingInfo as any).displayData?.futurePaperOverlayMode || "pixel_handwriting"} onChange={(e) => updateEditingInfo((prev: any) => ({ ...prev, displayData: { ...(prev.displayData || {}), futurePaperOverlayMode: e.target.value } }))} className={inputClass} style={inputStyle}>
                        <option value="pixel_handwriting">Future DM Pixel Handwriting Overlay</option>
                        <option value="none">None</option>
                      </select>
                      <div className="text-[10px] mt-2" style={S_MUTED}>
                        Reserved for the future paper handwriting or pixel-drawing system.
                      </div>
                    </div>
                  )}

                  {(editingInfo as any).displayMode === "item:stone_tablet" && (
                    <div className="p-4" style={DM_PANEL}>
                      <div className="text-[12px] mb-2" style={S_SECTION_HDR}>Stone Tablet Options</div>
                      <label className="text-[10px] block mb-1" style={labelStyle}>Inscription Alignment</label>
                      <select value={(editingInfo as any).displayData?.alignment || "left"} onChange={(e) => updateEditingInfo((prev: any) => ({ ...prev, displayData: { ...(prev.displayData || {}), alignment: e.target.value } }))} className={inputClass} style={inputStyle}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                      </select>
                    </div>
                  )}

                  <div className="p-4" style={DM_PANEL_ALT}>
                    <div className="text-[11px] font-semibold mb-1" style={S_TEXT}>
                      Current Mode: {modeLabel((editingInfo as any).displayMode || "digital")}
                    </div>
                    <div className="text-[10px]" style={S_MUTED}>
                      {modeHelp((editingInfo as any).displayMode || "digital")}
                    </div>
                  </div>
                </div>
              )}

              {editorTab === "preview" && previewInfo && (
                <div className="space-y-3">
                  <div className="text-[11px]" style={S_MUTED}>
                    Live player-side preview using the current content and display settings.
                  </div>
                  <div className="rounded border overflow-hidden" style={{ borderColor: "#232B5B", background: "#090D18" }}>
                    {renderInfoDisplayMode(previewInfo, {
                      theme: previewTheme,
                      info: previewInfo,
                      accentColor: "#4A7BFF",
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1A1A3B]">
                <button onClick={handleCancelInfoEdit} className={`${retro.button} px-4 py-2 text-[12px]`} style={{ color: "#C77B7B" }}>
                  Cancel
                </button>
                <button onClick={handleSaveInfo} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                  <Save size={12} /> Save Information
                </button>
              </div>
            </div>
          ) : (
            <div className={`${retro.sunken} bg-[#0C0C2E] p-5 min-h-[320px] flex items-center justify-center text-center`} style={S_MUTED}>
              Select an information entry to edit it, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
