import React, { useEffect, useMemo, useState } from "react";
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
import { sanitizeInfoDocumentRecord } from "./personal-files-information-utils";

const INFO_SUBTAB_SORT_OPTIONS = [
  { value: "custom", label: "Manual Order" },
  { value: "title", label: "Title (A-Z)" },
  { value: "category", label: "Category" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
] as const;

const INFO_UNASSIGNED_FILTER = "__unassigned__";

const DISPLAY_MODE_OPTIONS = [
  { value: "digital", label: "Digital Document", help: "Screen-like page with moving scanlines, glow, background color, terminal mode, and optional typewriter text." },
  { value: "paper", label: "Paper Document", help: "Brighter paper page with adjustable torn edges, extra pages, and edge texture." },
  { value: "item:stone_tablet", label: "Stone Tablet", help: "A narrower rounded-top tablet with more stone texture, tintable carved text, and adjustable stone lightness." },
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
    setInfoSubTabs,
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
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const draftStorageKey = editingInfo?.id ? `dm-info-draft:${editingInfo.id}` : "dm-info-draft:new";

  const activeInfoCustomFields = editingInfo ? getActiveCustomFields(editingInfo, infoTags).filter((field: any) => field && typeof field.name === "string" && typeof field.tagName === "string") : [];
  const sortedSubTabs = [...infoSubTabs].sort((a: any, b: any) => a.order - b.order);

  const filteredInfos = managedInfos.filter((info: any) => {
    if (infoManagerSubTabFilter === "all") return true;
    if (infoManagerSubTabFilter === INFO_UNASSIGNED_FILTER) return !info.infoSubTab;
    return info.infoSubTab === infoManagerSubTabFilter;
  });

  const selectedBulkCount = Object.values(infoBulkSelection).filter(Boolean).length;

  const previewInfo = useMemo(() => {
    if (!editingInfo) return null;
    return sanitizeInfoDocumentRecord({
      ...editingInfo,
      title: editingInfo.title || "Untitled Information",
      content: editingInfo.content || editingInfo.description || "<p>This preview will show how the page renders for the player.</p>",
      displayMode: (editingInfo as any).displayMode || "digital",
      displayData: (editingInfo as any).displayData || {},
    });
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
    const subTab = infoSubTabs.find((st: any) => st.id === subTabId);
    const inherited = getInheritedAssignedTo(subTabId);

    if (subTab?.autoAssignToOwners !== false && inherited.length) {
      updateInfoField("assignedTo", inherited);
    }

    if (subTab?.defaultDisplayMode && (!editingInfo?.displayMode || editingInfo.displayMode === "digital")) {
      updateEditingInfo((prev: any) => ({
        ...prev,
        displayMode: subTab.defaultDisplayMode,
      }));
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

  const updateDisplayData = (patch: Record<string, any>) => {
    updateEditingInfo((prev: any) => ({
      ...prev,
      displayData: {
        ...(prev?.displayData || {}),
        ...patch,
      },
    }));
  };

  useEffect(() => {
    if (!editingInfo || typeof window === "undefined") return;
    setDraftStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(editingInfo));
        setDraftStatus("saved");
      } catch {
        setDraftStatus("idle");
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [editingInfo, draftStorageKey]);

  const restoreDraft = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      updateEditingInfo(JSON.parse(raw));
      setDraftStatus("saved");
    } catch {
      setDraftStatus("idle");
    }
  };

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setDraftStatus("idle");
    }
  };

  const sectionList = Array.isArray((editingInfo as any)?.displayData?.sections)
    ? (editingInfo as any).displayData.sections
    : [];

  const linkedInfoIdsText = Array.isArray((editingInfo as any)?.displayData?.linkedInfoIds)
    ? (editingInfo as any).displayData.linkedInfoIds.join(", ")
    : "";

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
                          <select value={st.parentId || ""} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, parentId: e.target.value } : tab))} className={inputClass} style={inputStyle}>
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
                          <input type="text" value={st.icon || ""} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, icon: e.target.value } : tab))} className={inputClass} style={inputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Accent Color</label>
                          <input type="text" value={st.color || ""} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, color: e.target.value } : tab))} className={inputClass} style={inputStyle} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Sort Mode</label>
                          <select value={st.sortMode || "custom"} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, sortMode: e.target.value } : tab))} className={inputClass} style={inputStyle}>
                            {INFO_SUBTAB_SORT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Assigned To</label>
                          <select value={Array.isArray(st.assignedTo) && st.assignedTo.includes("all") ? "all" : ((st.assignedTo || [])[0] || "")} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, assignedTo: e.target.value === "all" ? ["all"] : e.target.value ? [e.target.value] : [] } : tab))} className={inputClass} style={inputStyle}>
                            <option value="">No default player assignment</option>
                            <option value="all">All Players</option>
                            {players.filter((p: any) => p.id !== "dm").map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Default Display Mode</label>
                          <select value={st.defaultDisplayMode || "digital"} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, defaultDisplayMode: e.target.value } : tab))} className={inputClass} style={inputStyle}>
                            <option value="digital">Digital</option>
                            <option value="paper">Paper</option>
                            <option value="item:stone_tablet">Stone Tablet</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Description</label>
                        <input type="text" value={st.description || ""} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, description: e.target.value } : tab))} className={inputClass} style={inputStyle} />
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
                          <input type="checkbox" checked={!!st.showEmpty} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, showEmpty: e.target.checked } : tab))} className="accent-[#4A7BFF]" />
                          <span className="text-[11px]" style={S_TEXT}>Show when empty</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={st.autoAssignToOwners !== false} onChange={(e) => setInfoSubTabs((prev: any[]) => prev.map((tab) => tab.id === st.id ? { ...tab, autoAssignToOwners: e.target.checked } : tab))} className="accent-[#4A7BFF]" />
                          <span className="text-[11px]" style={S_TEXT}>Auto-assign new docs to owners</span>
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
                        <span>Default View: {st.defaultDisplayMode || "digital"}</span>
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
                      defaultDisplayMode: "digital",
                      autoAssignToOwners: true,
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
                              {info.lastEditedAt ? <span>Edited: {new Date(info.lastEditedAt).toLocaleString()}</span> : null}
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
                  {editingInfo?.lastEditedAt ? (
                    <div className="text-[10px]" style={S_DIM}>Last Edited: {new Date(editingInfo.lastEditedAt).toLocaleString()}</div>
                  ) : null}
                  <div className="text-[10px]" style={S_DIM}>
                    Draft: {draftStatus === "saving" ? "Autosaving..." : draftStatus === "saved" ? "Saved locally" : "Idle"}
                  </div>
                  {editingInfo?.lastEditedAt ? (
                    <div className="text-[10px]" style={S_DIM}>Last Edited: {new Date(editingInfo.lastEditedAt).toLocaleString()}</div>
                  ) : null}
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
                  <div className="p-4 space-y-4" style={DM_PANEL}>
                    <div className="text-[12px]" style={S_SECTION_HDR}>Phase 2 Content Tools</div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Visible Blocks Before Fade</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={(editingInfo as any).displayData?.visibleBlockCount ?? 0}
                          onChange={(e) => updateDisplayData({ visibleBlockCount: Math.max(0, Number(e.target.value) || 0) })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Fade Block Count</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={(editingInfo as any).displayData?.fadeBlockCount ?? 2}
                          onChange={(e) => updateDisplayData({ fadeBlockCount: Math.max(0, Number(e.target.value) || 0) })}
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] block mb-1" style={labelStyle}>Linked Document IDs</label>
                        <input
                          type="text"
                          value={linkedInfoIdsText}
                          onChange={(e) => updateDisplayData({ linkedInfoIds: e.target.value.split(",").map((v: string) => v.trim()).filter(Boolean) })}
                          placeholder="doc-id-1, doc-id-2"
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div className="text-[10px]" style={S_MUTED}>
                      Inline syntax:
                      {" "}[[link:document-id|Label]]
                      {" "}to create a document link, and [[redact:secret text]] to show a styled redaction block without rendering the secret text.
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!(editingInfo as any).displayData?.useSections}
                          onChange={(e) => updateDisplayData({ useSections: e.target.checked, sections: e.target.checked ? (sectionList.length ? sectionList : [{ id: `sec-${Date.now()}`, title: "Section 1", content: "" }]) : [] })}
                          className="accent-[#4A7BFF]"
                        />
                        <span className="text-[11px]" style={S_TEXT}>Use section-based document layout</span>
                      </label>

                      {!!(editingInfo as any).displayData?.useSections && (
                        <div className="space-y-3">
                          {sectionList.map((section: any, index: number) => (
                            <div key={section.id || index} className="p-3 space-y-2" style={DM_PANEL_ALT}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px]" style={S_SUBTLE}>Section {index + 1}</div>
                                <button
                                  type="button"
                                  onClick={() => updateDisplayData({ sections: sectionList.filter((_: any, i: number) => i !== index) })}
                                  className={`${retro.button} px-2 py-1 text-[10px]`}
                                  style={{ color: "#C77B7B" }}
                                >
                                  Remove
                                </button>
                              </div>
                              <input
                                type="text"
                                value={section.title || ""}
                                onChange={(e) => updateDisplayData({ sections: sectionList.map((entry: any, i: number) => i === index ? { ...entry, title: e.target.value } : entry) })}
                                placeholder="Section title"
                                className={inputClass}
                                style={inputStyle}
                              />
                              <RichTextEditor
                                value={section.content || ""}
                                onChange={(value) => updateDisplayData({ sections: sectionList.map((entry: any, i: number) => i === index ? { ...entry, content: value } : entry) })}
                                placeholder="Write section content..."
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateDisplayData({ sections: [...sectionList, { id: `sec-${Date.now()}-${sectionList.length}`, title: `Section ${sectionList.length + 1}`, content: "" }] })}
                            className={`${retro.button} px-3 py-1.5 text-[11px] flex items-center gap-1`}
                            style={{ color: "#4A9A5A" }}
                          >
                            <Plus size={11} /> Add Section
                          </button>
                        </div>
                      )}
                    </div>
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

                  {(editingInfo as any).displayMode === "digital" && (
                    <div className="p-4" style={DM_PANEL}>
                      <div className="text-[12px] mb-2" style={S_SECTION_HDR}>Digital Screen Options</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Digital Variant</label>
                          <select
                            value={(editingInfo as any).displayData?.digitalVariant || "default"}
                            onChange={(e) => updateDisplayData({ digitalVariant: e.target.value })}
                            className={inputClass}
                            style={inputStyle}
                          >
                            <option value="default">Default</option>
                            <option value="terminal">Terminal</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Text Color</label>
                          <input
                            type="text"
                            value={(editingInfo as any).displayData?.digitalTextColor || ""}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), digitalTextColor: e.target.value },
                            }))}
                            className={inputClass}
                            style={inputStyle}
                            placeholder="#8fd3ff"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Background Color</label>
                          <input
                            type="text"
                            value={(editingInfo as any).displayData?.digitalBackgroundColor || ""}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), digitalBackgroundColor: e.target.value },
                            }))}
                            className={inputClass}
                            style={inputStyle}
                            placeholder="#06101a"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Glow Intensity</label>
                          <select
                            value={(editingInfo as any).displayData?.digitalGlowIntensity || "medium"}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), digitalGlowIntensity: e.target.value },
                            }))}
                            className={inputClass}
                            style={inputStyle}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Typewriter Speed</label>
                          <input
                            type="range"
                            min="8"
                            max="90"
                            step="1"
                            value={(editingInfo as any).displayData?.digitalTypewriterSpeed ?? 30}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), digitalTypewriterSpeed: Number(e.target.value) },
                            }))}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>
                            {(editingInfo as any).displayData?.digitalTypewriterSpeed ?? 30}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!(editingInfo as any).displayData?.digitalTypewriter}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), digitalTypewriter: e.target.checked },
                            }))}
                            className="accent-[#4A7BFF]"
                          />
                          <span className="text-[11px]" style={S_TEXT}>Typewriter reveal</span>
                        </label>
                      </div>
                      <div className="text-[10px] mt-2" style={S_MUTED}>
                        Moving scanlines are built in. Typewriter reveal now hides the cursor line while it writes.
                      </div>
                    </div>
                  )}

                  {(editingInfo as any).displayMode === "paper" && (
                    <div className="p-4" style={DM_PANEL}>
                      <div className="text-[12px] mb-2" style={S_SECTION_HDR}>Paper Options</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Jagged Edges</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={(editingInfo as any).displayData?.paperJaggedness ?? 10}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), paperJaggedness: Number(e.target.value) },
                            }))}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>{(editingInfo as any).displayData?.paperJaggedness ?? 10}</div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Extra Pages</label>
                          <input
                            type="number"
                            min="0"
                            max="4"
                            step="1"
                            value={(editingInfo as any).displayData?.paperExtraPages ?? 0}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), paperExtraPages: Math.max(0, Math.min(4, Number(e.target.value) || 0)) },
                            }))}
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Edge Texture</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={(editingInfo as any).displayData?.paperEdgeTexture ?? 24}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), paperEdgeTexture: Number(e.target.value) },
                            }))}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>{(editingInfo as any).displayData?.paperEdgeTexture ?? 24}</div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Future Overlay Planning Hook</label>
                          <select value={(editingInfo as any).displayData?.futurePaperOverlayMode || "pixel_handwriting"} onChange={(e) => updateEditingInfo((prev: any) => ({ ...prev, displayData: { ...(prev.displayData || {}), futurePaperOverlayMode: e.target.value } }))} className={inputClass} style={inputStyle}>
                            <option value="pixel_handwriting">Future DM Pixel Handwriting Overlay</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Handwritten Overlay</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round(((editingInfo as any).displayData?.paperHandwrittenOpacity ?? 0) * 100)}
                            onChange={(e) => updateDisplayData({ paperHandwrittenOpacity: Number(e.target.value) / 100 })}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>{Math.round(((editingInfo as any).displayData?.paperHandwrittenOpacity ?? 0) * 100)}%</div>
                        </div>
                      </div>
                      <div className="text-[10px] mt-2" style={S_MUTED}>
                        Paper pages now stay full size, can add extra sheets below, and have adjustable torn-edge intensity and edge wear.
                      </div>
                    </div>
                  )}

                  {(editingInfo as any).displayMode === "item:stone_tablet" && (
                    <div className="p-4" style={DM_PANEL}>
                      <div className="text-[12px] mb-2" style={S_SECTION_HDR}>Stone Tablet Options</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Inscription Alignment</label>
                          <select value={(editingInfo as any).displayData?.alignment || "left"} onChange={(e) => updateEditingInfo((prev: any) => ({ ...prev, displayData: { ...(prev.displayData || {}), alignment: e.target.value } }))} className={inputClass} style={inputStyle}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Stone Texture</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={(editingInfo as any).displayData?.stoneTextureIntensity ?? 55}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), stoneTextureIntensity: Number(e.target.value) },
                            }))}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>{(editingInfo as any).displayData?.stoneTextureIntensity ?? 55}</div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Text Color</label>
                          <input
                            type="text"
                            value={(editingInfo as any).displayData?.stoneTextColor || ""}
                            onChange={(e) => updateEditingInfo((prev: any) => ({
                              ...prev,
                              displayData: { ...(prev.displayData || {}), stoneTextColor: e.target.value },
                            }))}
                            className={inputClass}
                            style={inputStyle}
                            placeholder="#c4cbc8"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Crack Intensity</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={(editingInfo as any).displayData?.stoneCrackIntensity ?? 20}
                            onChange={(e) => updateDisplayData({ stoneCrackIntensity: Number(e.target.value) })}
                            className="w-full accent-[#4A7BFF]"
                          />
                          <div className="text-[10px]" style={S_MUTED}>{(editingInfo as any).displayData?.stoneCrackIntensity ?? 20}</div>
                        </div>
                        <div>
                          <label className="text-[10px] block mb-1" style={labelStyle}>Rune Glow Color</label>
                          <input
                            type="text"
                            value={(editingInfo as any).displayData?.stoneRuneGlowColor || ""}
                            onChange={(e) => updateDisplayData({ stoneRuneGlowColor: e.target.value })}
                            className={inputClass}
                            style={inputStyle}
                            placeholder="#7ef7ff"
                          />
                          <label className="flex items-center gap-2 cursor-pointer mt-2">
                            <input
                              type="checkbox"
                              checked={!!(editingInfo as any).displayData?.stoneRuneGlow}
                              onChange={(e) => updateDisplayData({ stoneRuneGlow: e.target.checked })}
                              className="accent-[#4A7BFF]"
                            />
                            <span className="text-[11px]" style={S_TEXT}>Rune Glow</span>
                          </label>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-[10px] block mb-1" style={labelStyle}>Stone Lightness</label>
                        <input
                          type="range"
                          min="20"
                          max="80"
                          step="1"
                          value={(editingInfo as any).displayData?.stoneBaseLightness ?? 48}
                          onChange={(e) => updateEditingInfo((prev: any) => ({
                            ...prev,
                            displayData: { ...(prev.displayData || {}), stoneBaseLightness: Number(e.target.value) },
                          }))}
                          className="w-full accent-[#4A7BFF]"
                        />
                        <div className="text-[10px]" style={S_MUTED}>{(editingInfo as any).displayData?.stoneBaseLightness ?? 48}</div>
                      </div>
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

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1A1A3B]">
                <div className="flex items-center gap-2">
                  <button onClick={restoreDraft} className={`${retro.button} px-3 py-2 text-[11px]`} style={{ color: "#7FA2FF" }}>
                    Restore Draft
                  </button>
                  <button onClick={clearDraft} className={`${retro.button} px-3 py-2 text-[11px]`} style={{ color: "#A7A7A7" }}>
                    Clear Draft
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleCancelInfoEdit} className={`${retro.button} px-4 py-2 text-[12px]`} style={{ color: "#C77B7B" }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveInfo} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-1.5`} style={S_GREEN_BTN}>
                    <Save size={12} /> Save Information
                  </button>
                </div>
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
import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { retro } from "./retro-styles";
import { RenderFormattedText } from "./render-text";
import { firstColor, type PlayerTheme } from "./player-theme";
import { renderInfoDisplayMode } from "./personal-files-information-renderers";
import {
  INFO_UNASSIGNED_FILTER,
  type InfoSubTab,
} from "./personal-files-information-utils";

export type InfoFollowUp = {
  id?: string;
  title?: string;
  content?: string;
  description?: string;
};

export type ManagedInfoLike = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: string;
  realWorldTime?: string;
  inWorldTime?: string;
  lastEditedAt?: string;
  infoSubTab?: string;
  followUps?: InfoFollowUp[];
  displayMode?: "digital" | "paper" | "item:stone_tablet";
  displayData?: {
    variant?: string;
    alignment?: "left" | "center";
    futurePaperOverlayMode?: "none" | "pixel_handwriting";
    digitalTextColor?: string;
    digitalGlowIntensity?: "low" | "medium" | "high";
    digitalTypewriter?: boolean;
    digitalBackgroundColor?: string;
    digitalTypewriterSpeed?: number;
    digitalVariant?: "default" | "terminal";
    paperJaggedness?: number;
    paperExtraPages?: number;
    paperEdgeTexture?: number;
    paperTemplate?: "standard" | "letter" | "report" | "aged";
    paperHandwrittenOverlay?: string;
    paperHandwrittenOpacity?: number;
    stoneTextureIntensity?: number;
    stoneTextColor?: string;
    stoneBaseLightness?: number;
    stoneCrackIntensity?: number;
    stoneRuneGlow?: boolean;
    stoneRuneGlowColor?: string;
    visibleBlockCount?: number;
    fadeBlockCount?: number;
    linkedInfoIds?: string[];
    useSections?: boolean;
    sections?: Array<{ id?: string; title?: string; content?: string }>;
  };
};

type RetroLike = {
  sunken: string;
  raised: string;
};

type Props = {
  theme: PlayerTheme;
  playerInfos: ManagedInfoLike[];
  infoSubTabs: InfoSubTab[];
  retroOverrides?: RetroLike;
};

type TreeNode =
  | {
      id: string;
      type: "folder";
      name: string;
      children: TreeNode[];
      depth: number;
      color?: string;
      description?: string;
      parentId?: string;
      isRoot?: boolean;
    }
  | {
      id: string;
      type: "paper";
      name: string;
      paper: ManagedInfoLike;
      depth: number;
      parentId?: string;
    };

const SEARCH_INPUT_STYLE: React.CSSProperties = {
  border: "1px solid rgba(124, 124, 185, 0.22)",
  background: "rgba(7, 9, 20, 0.92)",
  boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.25)",
};

const READ_STORAGE_KEY = "personal-files-information-read-v1";

function normalizeLabel(value: string | undefined | null) {
  return String(value || "").trim();
}

function splitCategoryPath(category?: string) {
  const raw = normalizeLabel(category);
  if (!raw) return [];
  return raw
    .split(/(?:\/|\\|>|::|\|)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function paperTimestamp(info: ManagedInfoLike) {
  return normalizeLabel(info.realWorldTime) || normalizeLabel(info.inWorldTime);
}

function comparePapers(a: ManagedInfoLike, b: ManagedInfoLike) {
  const aTime = paperTimestamp(a);
  const bTime = paperTimestamp(b);

  if (aTime && bTime && aTime !== bTime) {
    return bTime.localeCompare(aTime);
  }

  return a.title.localeCompare(b.title);
}

function highlightMatch(label: string, searchTerm: string, accentColor: string) {
  if (!searchTerm) return label;
  const source = label;
  const lower = source.toLowerCase();
  const matchIndex = lower.indexOf(searchTerm);
  if (matchIndex === -1) return label;

  const before = source.slice(0, matchIndex);
  const match = source.slice(matchIndex, matchIndex + searchTerm.length);
  const after = source.slice(matchIndex + searchTerm.length);

  return (
    <>
      {before}
      <span
        style={{
          color: accentColor,
          textShadow: `0 0 8px ${accentColor}55`,
          fontWeight: 700,
        }}
      >
        {match}
      </span>
      {after}
    </>
  );
}

function loadReadIds() {
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map((v) => String(v)) : []);
  } catch {
    return new Set<string>();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {}
}

function buildTree(playerInfos: ManagedInfoLike[], infoSubTabs: InfoSubTab[]): TreeNode[] {
  const sortedTabs = [...infoSubTabs]
    .filter((tab) => tab && typeof tab.id === "string" && typeof tab.name === "string")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const validTabIds = new Set(sortedTabs.map((tab) => tab.id));
  const infosByTab = new Map<string, ManagedInfoLike[]>();

  for (const info of playerInfos) {
    const tabKey =
      info.infoSubTab && validTabIds.has(info.infoSubTab)
        ? info.infoSubTab
        : INFO_UNASSIGNED_FILTER;

    if (!infosByTab.has(tabKey)) infosByTab.set(tabKey, []);
    infosByTab.get(tabKey)!.push(info);
  }

  const roots: TreeNode[] = [];

  const addFolderBranch = (
    folderRoot: Extract<TreeNode, { type: "folder" }>,
    info: ManagedInfoLike,
  ) => {
    const categoryParts = splitCategoryPath(info.category);
    let currentFolder = folderRoot;

    for (const part of categoryParts) {
      let existing = currentFolder.children.find(
        (child): child is Extract<TreeNode, { type: "folder" }> =>
          child.type === "folder" && child.name === part,
      );

      if (!existing) {
        existing = {
          id: `${currentFolder.id}/folder/${part.toLowerCase().replace(/\s+/g, "-")}`,
          type: "folder",
          name: part,
          children: [],
          depth: currentFolder.depth + 1,
          parentId: currentFolder.id,
        };
        currentFolder.children.push(existing);
      }

      currentFolder = existing;
    }

    currentFolder.children.push({
      id: `paper:${info.id}`,
      type: "paper",
      name: info.title,
      paper: info,
      depth: currentFolder.depth + 1,
      parentId: currentFolder.id,
    });
  };

  for (const tab of sortedTabs) {
    const rootFolder: Extract<TreeNode, { type: "folder" }> = {
      id: `tab:${tab.id}`,
      type: "folder",
      name: tab.name,
      children: [],
      depth: 0,
      color: tab.color || undefined,
      description: tab.description || undefined,
      isRoot: true,
    };

    const infos = [...(infosByTab.get(tab.id) || [])].sort(comparePapers);
    for (const info of infos) {
      addFolderBranch(rootFolder, info);
    }

    roots.push(rootFolder);
  }

  const unassignedInfos = [...(infosByTab.get(INFO_UNASSIGNED_FILTER) || [])].sort(comparePapers);
  if (unassignedInfos.length > 0) {
    const unassignedRoot: Extract<TreeNode, { type: "folder" }> = {
      id: `tab:${INFO_UNASSIGNED_FILTER}`,
      type: "folder",
      name: "Unassigned",
      children: [],
      depth: 0,
      color: "#FFCC66",
      description: "Information that has not been assigned to a main category yet.",
      isRoot: true,
    };

    for (const info of unassignedInfos) {
      addFolderBranch(unassignedRoot, info);
    }

    roots.push(unassignedRoot);
  }

  const sortFolders = (node: Extract<TreeNode, { type: "folder" }>) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      if (a.type === "folder" && b.type === "folder") return a.name.localeCompare(b.name);
      if (a.type === "paper" && b.type === "paper") return comparePapers(a.paper, b.paper);
      return 0;
    });

    for (const child of node.children) {
      if (child.type === "folder") sortFolders(child);
    }
  };

  for (const root of roots) {
    if (root.type === "folder") sortFolders(root);
  }

  return roots;
}

function collectAllFolderIds(nodes: TreeNode[], bucket = new Set<string>()) {
  for (const node of nodes) {
    if (node.type === "folder") {
      bucket.add(node.id);
      collectAllFolderIds(node.children, bucket);
    }
  }
  return bucket;
}

function collectAllPapers(nodes: TreeNode[], bucket: ManagedInfoLike[] = []) {
  for (const node of nodes) {
    if (node.type === "paper") {
      bucket.push(node.paper);
    } else {
      collectAllPapers(node.children, bucket);
    }
  }
  return bucket;
}

function filterTree(nodes: TreeNode[], searchTerm: string): TreeNode[] {
  if (!searchTerm) return nodes;

  const filtered: TreeNode[] = [];

  for (const node of nodes) {
    const selfMatch = normalizeSearch(node.name).includes(searchTerm);

    if (node.type === "paper") {
      if (selfMatch) filtered.push(node);
      continue;
    }

    const filteredChildren = filterTree(node.children, searchTerm);
    if (selfMatch || filteredChildren.length > 0) {
      filtered.push({
        ...node,
        children: selfMatch ? node.children : filteredChildren,
      });
    }
  }

  return filtered;
}

function collectBreadcrumbs(
  roots: TreeNode[],
  paperId: string,
): Array<{ id: string; name: string; type: "folder" | "paper" }> {
  const walk = (
    nodes: TreeNode[],
    trail: Array<{ id: string; name: string; type: "folder" | "paper" }>,
  ): Array<{ id: string; name: string; type: "folder" | "paper" }> | null => {
    for (const node of nodes) {
      const nextTrail = [...trail, { id: node.id, name: node.name, type: node.type }];
      if (node.type === "paper" && node.paper.id === paperId) return nextTrail;
      if (node.type === "folder") {
        const result = walk(node.children, nextTrail);
        if (result) return result;
      }
    }
    return null;
  };

  return walk(roots, []) || [];
}

function findPaperById(nodes: TreeNode[], paperId: string | null): ManagedInfoLike | null {
  if (!paperId) return null;
  for (const node of nodes) {
    if (node.type === "paper" && node.paper.id === paperId) return node.paper;
    if (node.type === "folder") {
      const found = findPaperById(node.children, paperId);
      if (found) return found;
    }
  }
  return null;
}

function firstVisiblePaper(nodes: TreeNode[]) {
  for (const node of nodes) {
    if (node.type === "paper") return node.paper;
    if (node.type === "folder") {
      const found = firstVisiblePaper(node.children);
      if (found) return found;
    }
  }
  return null;
}

function folderPathIds(roots: TreeNode[], paperId: string) {
  const crumbs = collectBreadcrumbs(roots, paperId);
  return crumbs.filter((crumb) => crumb.type === "folder").map((crumb) => crumb.id);
}

export function PersonalFilesInformationPanel({
  theme,
  playerInfos,
  infoSubTabs,
  retroOverrides,
}: Props) {
  const ui = retroOverrides || retro;
  const accent = firstColor(theme.accentColor);
  const [searchValue, setSearchValue] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [readPaperIds, setReadPaperIds] = useState<Set<string>>(new Set());
  const [searchFocused, setSearchFocused] = useState(false);

  const treeRoots = useMemo(
    () => buildTree(playerInfos, infoSubTabs),
    [playerInfos, infoSubTabs],
  );

  const searchTerm = normalizeSearch(searchValue);

  const visibleTree = useMemo(
    () => filterTree(treeRoots, searchTerm),
    [treeRoots, searchTerm],
  );

  const autoExpandedIds = useMemo(
    () => (searchTerm ? collectAllFolderIds(visibleTree) : new Set<string>()),
    [visibleTree, searchTerm],
  );

  useEffect(() => {
    setReadPaperIds(loadReadIds());
  }, []);

  useEffect(() => {
    if (!selectedPaperId) return;
    setReadPaperIds((prev) => {
      if (prev.has(selectedPaperId)) return prev;
      const next = new Set(prev);
      next.add(selectedPaperId);
      saveReadIds(next);
      return next;
    });
  }, [selectedPaperId]);

  useEffect(() => {
    if (searchTerm) return;
    setExpandedFolderIds((prev) => {
      if (prev.size > 0) return prev;
      const defaults = new Set<string>();
      for (const node of treeRoots) {
        if (node.type === "folder") defaults.add(node.id);
      }
      return defaults;
    });
  }, [treeRoots, searchTerm]);

  useEffect(() => {
    if (!selectedPaperId) return;
    const visiblePaper = findPaperById(visibleTree, selectedPaperId);
    if (visiblePaper) return;
    setSelectedPaperId(null);
  }, [visibleTree, selectedPaperId]);

  const selectedPaper = useMemo(
    () => findPaperById(treeRoots, selectedPaperId),
    [treeRoots, selectedPaperId],
  );

  const breadcrumbs = useMemo(
    () => collectBreadcrumbs(treeRoots, selectedPaperId || ""),
    [treeRoots, selectedPaperId],
  );

  const visiblePaperCount = useMemo(
    () => collectAllPapers(visibleTree).length,
    [visibleTree],
  );

  const toggleFolder = (folderId: string) => {
    if (searchTerm) return;
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleSelectPaper = (paperId: string) => {
    setSelectedPaperId(paperId);
    const folderIds = folderPathIds(treeRoots, paperId);
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      for (const id of folderIds) next.add(id);
      return next;
    });
  };

  const handleBreadcrumbClick = (crumbId: string, crumbType: "folder" | "paper") => {
    if (crumbType === "paper") {
      setSelectedPaperId(crumbId.replace(/^paper:/, ""));
      return;
    }

    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      next.add(crumbId);
      return next;
    });
  };

  const renderTree = (nodes: TreeNode[]) => {
    return nodes.map((node) => {
      if (node.type === "folder") {
        const isExpanded = searchTerm
          ? autoExpandedIds.has(node.id)
          : expandedFolderIds.has(node.id);
        const folderColor = node.color || (node.isRoot ? accent : theme.labelColor);

        return (
          <div key={node.id} className="transition-all duration-200 ease-out">
            <button
              type="button"
              onClick={() => toggleFolder(node.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded transition-all duration-150 ease-out hover:translate-x-[2px]"
              style={{
                color: node.isRoot ? folderColor : isExpanded ? folderColor : `${folderColor}CC`,
                background: isExpanded
                  ? "linear-gradient(90deg, rgba(76,120,255,0.09), rgba(76,120,255,0.02))"
                  : "transparent",
                paddingLeft: `${8 + node.depth * 14}px`,
                boxShadow: isExpanded ? `inset 1px 0 0 ${folderColor}` : "none",
              }}
              title={node.description || node.name}
            >
              {isExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {isExpanded ? (
                <FolderOpen size={12} style={{ filter: `drop-shadow(0 0 6px ${folderColor}55)` }} />
              ) : (
                <Folder size={12} />
              )}
              <span
                className="truncate"
                style={{
                  fontWeight: node.isRoot ? 700 : 500,
                  letterSpacing: node.isRoot ? "0.03em" : undefined,
                }}
              >
                {highlightMatch(node.name, searchTerm, accent)}
              </span>
            </button>

            <div
              className="transition-all duration-200 ease-out overflow-hidden"
              style={{
                maxHeight: isExpanded ? "1200px" : "0px",
                opacity: isExpanded ? 1 : 0.65,
              }}
            >
              {isExpanded && node.children.length > 0 && <div>{renderTree(node.children)}</div>}
            </div>
          </div>
        );
      }

      const isSelected = selectedPaperId === node.paper.id;
      const isUnread = !readPaperIds.has(node.paper.id);

      return (
        <button
          key={node.id}
          type="button"
          onClick={() => handleSelectPaper(node.paper.id)}
          className={`w-full text-left px-2 py-1.5 text-[11px] rounded transition-all duration-150 ease-out hover:translate-x-[2px] ${
            isSelected ? ui.sunken : ""
          }`}
          style={{
            color: isSelected ? accent : theme.textColor,
            background: isSelected
              ? "linear-gradient(90deg, rgba(76,120,255,0.13), rgba(76,120,255,0.03))"
              : "transparent",
            paddingLeft: `${8 + node.depth * 14}px`,
            borderLeft: isSelected ? `2px solid ${accent}` : "2px solid transparent",
            boxShadow: isSelected ? `0 0 14px ${accent}22` : "none",
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText size={12} />
            <span className="truncate">{highlightMatch(node.name, searchTerm, accent)}</span>
            {isUnread && (
              <span
                className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  background: accent,
                  boxShadow: `0 0 8px ${accent}`,
                }}
                title="Unread"
              />
            )}
          </div>
        </button>
      );
    });
  };

  return (
    <div
      className="rounded border overflow-hidden min-h-[68vh] h-[72vh] flex flex-col"
      style={{
        borderColor: theme.panelBorder,
        background:
          "linear-gradient(180deg, rgba(4,6,15,0.98), rgba(7,9,20,0.98))",
      }}
    >
      <div
        className="flex-1 grid min-h-0 transition-all duration-200 ease-out"
        style={{
          gridTemplateColumns: isSidebarCollapsed ? "42px minmax(0,1fr)" : "220px minmax(0,1fr)",
        }}
      >
        <aside
          className="border-r min-h-0 flex flex-col"
          style={{
            borderColor: theme.panelBorder,
            background:
              "linear-gradient(180deg, rgba(9,12,28,0.98), rgba(6,8,18,0.98))",
          }}
        >
          <div
            className="flex items-center gap-2 px-2 py-1 border-b"
            style={{ borderColor: theme.panelBorder }}
          >
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className={`${ui.raised} h-6 w-6 shrink-0 flex items-center justify-center transition-transform duration-150 hover:scale-[1.03]`}
              style={{ color: theme.labelColor }}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
            </button>

            {!isSidebarCollapsed && (
              <>
                <div className="relative flex-1">
                  <Search
                    size={11}
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    style={{ color: searchFocused ? accent : theme.labelColor }}
                  />
                  <input
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Search..."
                    className="w-full pl-6 pr-2 py-1 text-[10px] outline-none transition-all duration-150"
                    style={{
                      ...SEARCH_INPUT_STYLE,
                      color: theme.textColor,
                      borderColor: searchFocused ? `${accent}88` : "rgba(124, 124, 185, 0.22)",
                      boxShadow: searchFocused
                        ? `0 0 0 1px ${accent}55, inset 0 0 0 1px rgba(0,0,0,0.22), 0 0 12px ${accent}22`
                        : "inset 0 0 0 1px rgba(0,0,0,0.25)",
                    }}
                  />
                </div>
                <div className="text-[10px] shrink-0" style={{ color: theme.labelColor }}>
                  {visiblePaperCount}
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {!isSidebarCollapsed ? (
              <div className="p-2 space-y-1">
                {visibleTree.length > 0 ? (
                  renderTree(visibleTree)
                ) : (
                  <div
                    className="px-2 py-3 text-[11px]"
                    style={{ color: theme.labelColor }}
                  >
                    No categories or papers match your search.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 flex flex-col items-center gap-2">
                {visibleTree
                  .filter((node) => node.type === "folder")
                  .map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setIsSidebarCollapsed(false)}
                      className={`${ui.raised} h-7 w-7 flex items-center justify-center transition-transform duration-150 hover:scale-[1.04]`}
                      style={{ color: node.type === "folder" ? node.color || accent : theme.labelColor }}
                      title={node.name}
                    >
                      <Folder size={13} />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 min-h-0 p-3">
          {selectedPaper ? (
            <div
              className={`${ui.sunken} h-full flex flex-col overflow-hidden transition-all duration-200 ease-out`}
              style={{
                background:
                  "linear-gradient(180deg, rgba(1,2,6,1), rgba(4,6,14,1))",
                borderColor: theme.panelBorder,
                boxShadow: "inset 0 0 24px rgba(0,0,0,0.45)",
              }}
            >
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: theme.panelBorder }}
              >
                <div
                  className="flex flex-wrap items-center gap-1 text-[10px] mb-2"
                  style={{ color: theme.labelColor }}
                >
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.id}>
                      <button
                        type="button"
                        onClick={() => handleBreadcrumbClick(crumb.id, crumb.type)}
                        className="transition-colors"
                        style={{
                          color: index === breadcrumbs.length - 1 ? theme.textColor : theme.labelColor,
                        }}
                      >
                        {crumb.name}
                      </button>
                      {index < breadcrumbs.length - 1 ? <span>›</span> : null}
                    </React.Fragment>
                  ))}
                </div>

                <h2
                  className="text-[17px] font-semibold tracking-[0.02em]"
                  style={{
                    color: theme.textColor,
                    textShadow: "0 0 10px rgba(255,255,255,0.05)",
                  }}
                >
                  {selectedPaper.title}
                </h2>

                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  {selectedPaper.category ? (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        color: theme.textColor,
                        background: "rgba(76,120,255,0.12)",
                        border: "1px solid rgba(76,120,255,0.24)",
                      }}
                    >
                      {selectedPaper.category}
                    </span>
                  ) : null}
                  {selectedPaper.inWorldTime ? (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        color: theme.labelColor,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      In-World: {selectedPaper.inWorldTime}
                    </span>
                  ) : null}
                  {selectedPaper.realWorldTime ? (
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{
                        color: theme.labelColor,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      Real: {selectedPaper.realWorldTime}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4">
                {renderInfoDisplayMode(selectedPaper as any, {
                  theme,
                  info: selectedPaper as any,
                  accentColor: accent,
                })}
                  <div
                    className="text-[11px] leading-7"
                    style={{ color: theme.textColor }}
                  >
                    <RenderFormattedText
                      text={
                        selectedPaper.content ||
                        selectedPaper.description ||
                        "This paper does not have content yet."
                      }
                    />
                  </div>

                  {(selectedPaper.followUps?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div
                        className="text-[10px] uppercase tracking-[0.16em] font-semibold"
                        style={{ color: theme.labelColor }}
                      >
                        Related Notes
                      </div>

                      <div className="grid gap-2">
                        {selectedPaper.followUps!.map((followUp, index) => (
                          <div
                            key={followUp.id || `${selectedPaper.id}-followup-${index}`}
                            className="rounded border px-3 py-2 transition-transform duration-150 hover:translate-x-[2px]"
                            style={{
                              borderColor: "rgba(124, 124, 185, 0.18)",
                              background:
                                "linear-gradient(180deg, rgba(10,13,27,0.95), rgba(7,9,20,0.95))",
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <FileText
                                size={13}
                                style={{ color: accent, marginTop: "2px" }}
                              />
                              <div className="min-w-0">
                                {followUp.title ? (
                                  <div
                                    className="text-[11px] font-semibold mb-1"
                                    style={{ color: theme.textColor }}
                                  >
                                    {followUp.title}
                                  </div>
                                ) : null}

                                <div
                                  className="text-[11px]"
                                  style={{ color: theme.textColor }}
                                >
                                  <RenderFormattedText
                                    text={followUp.content || followUp.description || ""}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`${ui.sunken} h-full flex items-center justify-center px-6 text-center`}
              style={{
                color: theme.labelColor,
                background: "#000000",
                borderColor: theme.panelBorder,
                boxShadow: "inset 0 0 28px rgba(0,0,0,0.6)",
              }}
            >
              Select a paper from the left sidebar to read it.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default PersonalFilesInformationPanel;