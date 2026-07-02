import React, { useState, useEffect } from "react";
import { retro } from "./retro-styles";
import {
  X, Plus, Edit, Trash2, Save, Copy,
  Users, MapPin, Scroll, Sword, Skull, Flag,
  FileText, Package, Sparkles, BookOpen,
} from "lucide-react";
import { safeGetItem, safeSetItem, safeSetJson } from "./safe-storage";
import { S_ACCENT, S_DIM, S_LINK, S_MUTED, S_RED, S_WARN } from "./shared-styles";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface PageSection {
  id: string;
  heading: string;
  body: string;
}

interface WikiPanel {
  id: string;
  title: string;
  subtitle?: string;
  content: string;
  assignedTo: string[];
  visibilityMode?: "spoiler" | "hidden";
  collapsed?: boolean;
  style?: string;
}

export interface WikiTemplateData {
  category?: string;
  tags?: string[];
  sections?: PageSection[];
  panels?: WikiPanel[];
  infobox?: { label: string; value: string }[];
  body?: string;
  bodyTitle?: string;
  pageIcon?: string;
  underConstruction?: boolean;
  showDividers?: boolean;
  articleQuality?: "featured" | "good" | "start" | "stub" | "draft";
}

export interface WikiTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  isBuiltIn: boolean;
  data: WikiTemplateData;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ═══════════════════════════════════════════
// Built-in D&D Templates
// ═══════════════════════════════════════════

const BUILTIN_TEMPLATES: WikiTemplate[] = [
  {
    id: "tpl-npc",
    name: "NPC",
    icon: "users",
    description: "Non-player character with background, personality, and abilities.",
    isBuiltIn: true,
    data: {
      category: "NPCs",
      tags: ["character", "npc"],
      pageIcon: "users",
      bodyTitle: "Overview",
      body: "<p>Brief description of the NPC and their role in the world.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Race", value: "" },
        { label: "Class", value: "" },
        { label: "Level", value: "" },
        { label: "Alignment", value: "" },
        { label: "Location", value: "" },
        { label: "Affiliation", value: "" },
        { label: "Status", value: "Alive" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "Background", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Personality", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Appearance", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Abilities & Equipment", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Relationships", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Plot Hooks", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "DM Notes", content: "<p>Private notes about this NPC's true motives, secrets, and future plans.</p>", assignedTo: [], style: "secret" },
        { id: `panel-${uid()}`, title: "Player Knowledge", content: "<p>What the players currently know about this character.</p>", assignedTo: [], style: "info" },
      ],
    },
  },
  {
    id: "tpl-location",
    name: "Location",
    icon: "map",
    description: "A place in the world with history, notable features, and inhabitants.",
    isBuiltIn: true,
    data: {
      category: "Locations",
      tags: ["location", "place"],
      pageIcon: "map",
      bodyTitle: "Description",
      body: "<p>A brief overview of this location and its significance.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Region", value: "" },
        { label: "Type", value: "" },
        { label: "Population", value: "" },
        { label: "Government", value: "" },
        { label: "Climate", value: "" },
        { label: "Notable NPCs", value: "" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "Geography", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "History", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Notable Locations", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Economy & Trade", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Culture & Customs", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Points of Interest", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Hidden Areas", content: "<p>Secret locations or areas the players haven't discovered yet.</p>", assignedTo: [], style: "secret" },
        { id: `panel-${uid()}`, title: "Known Rumors", content: "<p>Rumors and legends the players have heard about this place.</p>", assignedTo: [], style: "lore" },
      ],
    },
  },
  {
    id: "tpl-quest",
    name: "Quest",
    icon: "scroll",
    description: "A quest or adventure with objectives, encounters, and rewards.",
    isBuiltIn: true,
    data: {
      category: "Quests",
      tags: ["quest", "adventure"],
      pageIcon: "scroll",
      bodyTitle: "Synopsis",
      body: "<p>A brief summary of the quest's premise and main objective.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Quest Giver", value: "" },
        { label: "Level Range", value: "" },
        { label: "Type", value: "" },
        { label: "Reward", value: "" },
        { label: "Status", value: "Available" },
        { label: "Difficulty", value: "" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "Background", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Objectives", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Key NPCs", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Encounters", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Rewards", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Complications & Twists", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "DM Notes", content: "<p>Behind-the-scenes info, alternate outcomes, and pacing notes.</p>", assignedTo: [], style: "secret" },
        { id: `panel-${uid()}`, title: "Clues & Hints", content: "<p>Information the players can discover during the quest.</p>", assignedTo: [], style: "lore" },
      ],
    },
  },
  {
    id: "tpl-item",
    name: "Item",
    icon: "package",
    description: "A magical item, weapon, or artifact with properties and lore.",
    isBuiltIn: true,
    data: {
      category: "Items",
      tags: ["item", "equipment"],
      pageIcon: "gem",
      bodyTitle: "Description",
      body: "<p>Physical description and general information about this item.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Type", value: "" },
        { label: "Rarity", value: "" },
        { label: "Attunement", value: "" },
        { label: "Weight", value: "" },
        { label: "Value", value: "" },
        { label: "Creator", value: "" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "Properties", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "History & Origin", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Acquisition", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Lore", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Hidden Properties", content: "<p>Secret abilities or curses the players haven't discovered.</p>", assignedTo: [], style: "secret" },
      ],
    },
  },
  {
    id: "tpl-monster",
    name: "Monster",
    icon: "skull",
    description: "A creature or monster with stats, abilities, and ecology.",
    isBuiltIn: true,
    data: {
      category: "Bestiary",
      tags: ["monster", "creature"],
      pageIcon: "skull",
      bodyTitle: "Description",
      body: "<p>Physical appearance and general behavior of this creature.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Type", value: "" },
        { label: "Size", value: "" },
        { label: "CR", value: "" },
        { label: "Alignment", value: "" },
        { label: "HP", value: "" },
        { label: "AC", value: "" },
        { label: "Speed", value: "" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "Abilities", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Combat Tactics", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Ecology & Habitat", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Lore & Legends", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Variants", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Weaknesses", content: "<p>Secret vulnerabilities and exploitable weaknesses.</p>", assignedTo: [], style: "secret" },
        { id: `panel-${uid()}`, title: "Stat Block", content: "<p>Detailed stat block for combat encounters.</p>", assignedTo: [], style: "info" },
      ],
    },
  },
  {
    id: "tpl-faction",
    name: "Faction",
    icon: "flag",
    description: "An organization or faction with goals, structure, and relations.",
    isBuiltIn: true,
    data: {
      category: "Factions",
      tags: ["faction", "organization"],
      pageIcon: "flag",
      bodyTitle: "Overview",
      body: "<p>Brief overview of this faction and their place in the world.</p>",
      showDividers: true,
      articleQuality: "start",
      infobox: [
        { label: "Leader", value: "" },
        { label: "Type", value: "" },
        { label: "Alignment", value: "" },
        { label: "Size", value: "" },
        { label: "Base", value: "" },
        { label: "Symbol", value: "" },
      ],
      panels: [
        { id: `panel-${uid()}`, title: "History", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Goals & Ideology", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Structure & Ranks", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Notable Members", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Relations & Alliances", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Resources & Territory", content: "", assignedTo: [], style: "blank" },
        { id: `panel-${uid()}`, title: "Secret Goals", content: "<p>Hidden agenda and true motivations unknown to outsiders.</p>", assignedTo: [], style: "secret" },
        { id: `panel-${uid()}`, title: "Known Activities", content: "<p>Public-facing activities and what the players know.</p>", assignedTo: [], style: "info" },
      ],
    },
  },
];

// ══════════════════════════════════════════
// Storage helpers
// ═══════════════════════════════════════════

const TEMPLATES_KEY = "inet-wiki-templates";

function loadTemplates(): WikiTemplate[] {
  try {
    const raw = safeGetItem(TEMPLATES_KEY);
    const custom: WikiTemplate[] = raw ? JSON.parse(raw) : [];
    return [...BUILTIN_TEMPLATES, ...custom];
  } catch {
    return [...BUILTIN_TEMPLATES];
  }
}

function saveCustomTemplates(templates: WikiTemplate[]) {
  const custom = templates.filter((t) => !t.isBuiltIn);
  try {
    safeSetJson(TEMPLATES_KEY, custom);
  } catch {}
}

// ═══════════════════════════════════════════
// Icon mapping
// ═══════════════════════════════════════════

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  users: Users,
  map: MapPin,
  scroll: Scroll,
  sword: Sword,
  skull: Skull,
  flag: Flag,
  file: FileText,
  package: Package,
  sparkles: Sparkles,
  book: BookOpen,
};

function getTemplateIcon(icon: string) {
  return TEMPLATE_ICONS[icon] || FileText;
}

// ══════════════════════════════════════════
// Template Picker Modal
// ═══════════════════════════════════════════

export function TemplatePickerModal({
  open,
  onClose,
  onSelect,
  onManage,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (template: WikiTemplate) => void;
  onManage: () => void;
}) {
  const [templates, setTemplates] = useState<WikiTemplate[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTemplates(loadTemplates());
  }, [open]);

  if (!open) return null;

  const builtIn = templates.filter((t) => t.isBuiltIn);
  const custom = templates.filter((t) => !t.isBuiltIn);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[700px] max-h-[80vh] flex flex-col" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderBottomColor: "#1A1A4B", background: "#0E0E35" }}>
          <div className="flex items-center gap-2">
            <BookOpen size={14} style={S_LINK} />
            <span className="text-[13px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>Choose a Template</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onManage}
              className={`${retro.button} px-3 py-1 text-[10px]`}
              style={S_WARN}
            >
              <Edit size={9} className="inline mr-1" /> Manage Templates
            </button>
            <button onClick={onClose} className="hover:opacity-80"><X size={14} style={S_MUTED} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Blank article option */}
          <button
            onClick={() => onClose()}
            className="w-full text-left px-4 py-3 transition-colors hover:bg-[#0A1A3A]"
            style={{ border: "1px solid #1A2A4B", background: "#080828" }}
          >
            <div className="flex items-center gap-3">
              <FileText size={20} style={S_MUTED} />
              <div>
                <div className="text-[12px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>Blank Article</div>
                <div className="text-[10px]" style={S_MUTED}>Start from scratch with an empty article.</div>
              </div>
            </div>
          </button>

          {/* Built-in templates */}
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>D&D Templates</div>
            <div className="grid grid-cols-2 gap-2">
              {builtIn.map((tpl) => {
                const Icon = getTemplateIcon(tpl.icon);
                const isHovered = hoveredId === tpl.id;
                const blankPanels = (tpl.data.panels || []).filter(p => p.style === "blank");
                return (
                  <button
                    key={tpl.id}
                    onClick={() => onSelect(tpl)}
                    onMouseEnter={() => setHoveredId(tpl.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="text-left px-4 py-3 transition-all"
                    style={{
                      border: isHovered ? "1px solid #4A7BFF" : "1px solid #1A2A4B",
                      background: isHovered ? "#0A1A3A" : "#080828",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={18} style={{ color: isHovered ? "#6A9AFF" : "#4A5A7A" }} />
                      <div>
                        <div className="text-[12px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>{tpl.name}</div>
                        <div className="text-[10px] mt-0.5" style={S_MUTED}>{tpl.description}</div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {blankPanels.slice(0, 3).map((p, i) => (
                            <span key={i} className="text-[8px] px-1.5 py-0.5" style={{ color: "#4A7BFF", background: "#0A0A30", border: "1px solid #1A2A5B" }}>
                              {p.title}
                            </span>
                          ))}
                          {blankPanels.length > 3 && (
                            <span className="text-[8px] px-1.5 py-0.5" style={S_DIM}>
                              +{blankPanels.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom templates */}
          {custom.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#FFAA4A", fontWeight: 600 }}>Custom Templates</div>
              <div className="grid grid-cols-2 gap-2">
                {custom.map((tpl) => {
                  const Icon = getTemplateIcon(tpl.icon);
                  const isHovered = hoveredId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => onSelect(tpl)}
                      onMouseEnter={() => setHoveredId(tpl.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="text-left px-4 py-3 transition-all"
                      style={{
                        border: isHovered ? "1px solid #FFAA4A" : "1px solid #2A2A1A",
                        background: isHovered ? "#1A1A0A" : "#0A0A08",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Icon size={18} style={{ color: isHovered ? "#FFAA4A" : "#5A5A3A" }} />
                        <div>
                          <div className="text-[12px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>{tpl.name}</div>
                          <div className="text-[10px] mt-0.5" style={S_MUTED}>{tpl.description}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// Template Manager Modal
// ═══════════════════════════════════════════

export function TemplateManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<WikiTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState("file");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editSections, setEditSections] = useState<string[]>([]);
  const [editInfobox, setEditInfobox] = useState<string[]>([]);
  const [newSectionDraft, setNewSectionDraft] = useState("");
  const [newInfoboxDraft, setNewInfoboxDraft] = useState("");

  useEffect(() => {
    if (open) setTemplates(loadTemplates());
  }, [open]);

  const startEdit = (tpl: WikiTemplate) => {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditDesc(tpl.description);
    setEditIcon(tpl.icon);
    setEditCategory(tpl.data.category || "");
    setEditTags((tpl.data.tags || []).join(", "));
    const sectionTitles = (tpl.data.panels || []).filter(p => p.style === "blank").map(p => p.title);
    if (sectionTitles.length === 0 && tpl.data.sections) {
      setEditSections(tpl.data.sections.map((s) => s.heading));
    } else {
      setEditSections(sectionTitles);
    }
    setEditInfobox((tpl.data.infobox || []).map((r) => r.label));
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;

    const existing = templates.find((t) => t.id === editingId);
    if (!existing) return;

    const styledPanels = (existing.data.panels || []).filter(p => p.style !== "blank");
    const blankPanels: WikiPanel[] = editSections.filter(Boolean).map((title) => ({
      id: `panel-${uid()}`,
      title,
      content: "",
      assignedTo: [],
      style: "blank",
    }));

    const updated: WikiTemplate = {
      ...existing,
      name: editName.trim(),
      description: editDesc.trim(),
      icon: editIcon,
      isBuiltIn: false,
      data: {
        ...existing.data,
        category: editCategory.trim() || undefined,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        panels: [...blankPanels, ...styledPanels],
        sections: undefined,
        infobox: editInfobox.filter(Boolean).map((label) => ({
          label,
          value: "",
        })),
      },
    };

    let next: WikiTemplate[];
    if (existing.isBuiltIn) {
      const newTpl = { ...updated, id: `tpl-custom-${uid()}`, isBuiltIn: false };
      next = [...templates, newTpl];
    } else {
      next = templates.map((t) => (t.id === editingId ? updated : t));
    }

    setTemplates(next);
    saveCustomTemplates(next);
    setEditingId(null);
  };

  const createNew = () => {
    const newTpl: WikiTemplate = {
      id: `tpl-custom-${uid()}`,
      name: "New Template",
      icon: "file",
      description: "Custom template",
      isBuiltIn: false,
      data: {
        category: "",
        tags: [],
        sections: [],
        infobox: [],
        showDividers: true,
        articleQuality: "start",
      },
    };
    const next = [...templates, newTpl];
    setTemplates(next);
    saveCustomTemplates(next);
    startEdit(newTpl);
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    saveCustomTemplates(next);
    if (editingId === id) setEditingId(null);
  };

  const duplicateTemplate = (tpl: WikiTemplate) => {
    const dup: WikiTemplate = {
      ...tpl,
      id: `tpl-custom-${uid()}`,
      name: `${tpl.name} (Copy)`,
      isBuiltIn: false,
      data: { ...tpl.data },
    };
    const next = [...templates, dup];
    setTemplates(next);
    saveCustomTemplates(next);
  };

  if (!open) return null;

  const inputClass = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`;
  const inputStyle: React.CSSProperties = { color: "#C0D0F0" };
  const labelStyle: React.CSSProperties = { color: "#5A6A8A", fontSize: 11, fontWeight: 600 };
  const iconKeys = Object.keys(TEMPLATE_ICONS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[750px] max-h-[85vh] flex flex-col" style={{ background: "#0C0C2E", border: "2px solid #2A2A5B" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderBottomColor: "#1A1A4B", background: "#0E0E35" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={S_WARN} />
            <span className="text-[13px]" style={{ color: "#C0D0F0", fontWeight: 600 }}>Template Manager</span>
          </div>
          <button onClick={onClose} className="hover:opacity-80"><X size={14} style={S_MUTED} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Template list */}
          <div className="w-[250px] shrink-0 border-r overflow-y-auto p-3 space-y-1" style={{ borderRightColor: "#1A1A4B" }}>
            <button
              onClick={createNew}
              className={`${retro.button} w-full px-3 py-2 text-[11px] flex items-center justify-center gap-1 mb-3`}
              style={{ color: "#4AFF6A" }}
            >
              <Plus size={10} /> New Template
            </button>

            {templates.map((tpl) => {
              const Icon = getTemplateIcon(tpl.icon);
              const isActive = editingId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
                  style={{
                    background: isActive ? "#0A1A3A" : "transparent",
                    border: isActive ? "1px solid #2A4A6B" : "1px solid transparent",
                    color: "#C0D0F0",
                  }}
                  onClick={() => startEdit(tpl)}
                >
                  <Icon size={12} style={{ color: isActive ? "#6A9AFF" : "#4A5A7A" }} />
                  <span className="text-[11px] flex-1 truncate">{tpl.name}</span>
                  {tpl.isBuiltIn && (
                    <span className="text-[8px] px-1 py-0.5" style={{ color: "#5A6A8A", background: "#0A0A20", border: "1px solid #1A1A4B" }}>BUILT-IN</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Edit area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {editingId ? (() => {
              const tpl = templates.find((t) => t.id === editingId);
              if (!tpl) return null;

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px]" style={{ color: "#6A9AFF", fontWeight: 600 }}>
                      {tpl.isBuiltIn ? "Editing (will save as custom copy)" : "Editing Template"}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => duplicateTemplate(tpl)} className="text-[10px] px-2 py-1 hover:opacity-80" style={{ color: "#6A9AFF", border: "1px solid #1A2A4B" }}>
                        <Copy size={9} className="inline mr-1" />Duplicate
                      </button>
                      {!tpl.isBuiltIn && (
                        <button onClick={() => deleteTemplate(tpl.id)} className="text-[10px] px-2 py-1 hover:opacity-80" style={{ color: "#FF6A6A", border: "1px solid #3A1A1A" }}>
                          <Trash2 size={9} className="inline mr-1" />Delete
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Template Name</label>
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Icon</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {iconKeys.map((key) => {
                        const Ico = TEMPLATE_ICONS[key]!;
                        return (
                          <button
                            key={key}
                            onClick={() => setEditIcon(key)}
                            className="p-1.5 transition-colors"
                            style={{ border: editIcon === key ? "1px solid #4A7BFF" : "1px solid #1A2A4B", background: editIcon === key ? "#0A1A3A" : "transparent" }}
                          >
                            <Ico size={14} style={{ color: editIcon === key ? "#6A9AFF" : "#4A5A7A" }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Default Category</label>
                    <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="e.g. NPCs, Locations..." className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Default Tags (comma-separated)</label>
                    <input type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="tag1, tag2, tag3" className={inputClass} style={inputStyle} />
                  </div>

                  {/* Section headings */}
                  <div>
                    <label style={labelStyle}>Section Headings</label>
                    <div className={`${retro.sunken} bg-[#080820] p-3 mt-1 space-y-1`}>
                      {editSections.map((heading, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <input
                            type="text"
                            value={heading}
                            onChange={(e) => { const next = [...editSections]; next[idx] = e.target.value; setEditSections(next); }}
                            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] flex-1 outline-none`}
                            style={inputStyle}
                          />
                          <button onClick={() => setEditSections(editSections.filter((_, i) => i !== idx))} className="hover:opacity-80"><X size={9} style={S_RED} /></button>
                        </div>
                      ))}
                      <div className="flex gap-1 mt-1">
                        <input
                          type="text"
                          value={newSectionDraft}
                          onChange={(e) => setNewSectionDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && newSectionDraft.trim()) { setEditSections([...editSections, newSectionDraft.trim()]); setNewSectionDraft(""); } }}
                          placeholder="Add section..."
                          className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] flex-1 outline-none`}
                          style={inputStyle}
                        />
                        <button
                          onClick={() => { if (newSectionDraft.trim()) { setEditSections([...editSections, newSectionDraft.trim()]); setNewSectionDraft(""); } }}
                          className="text-[10px] px-2 hover:opacity-80"
                          style={S_ACCENT}
                        >Add</button>
                      </div>
                    </div>
                  </div>

                  {/* Infobox labels */}
                  <div>
                    <label style={labelStyle}>Infobox Labels</label>
                    <div className={`${retro.sunken} bg-[#080820] p-3 mt-1 space-y-1`}>
                      {editInfobox.map((label, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <input
                            type="text"
                            value={label}
                            onChange={(e) => { const next = [...editInfobox]; next[idx] = e.target.value; setEditInfobox(next); }}
                            className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[11px] flex-1 outline-none`}
                            style={inputStyle}
                          />
                          <button onClick={() => setEditInfobox(editInfobox.filter((_, i) => i !== idx))} className="hover:opacity-80"><X size={9} style={S_RED} /></button>
                        </div>
                      ))}
                      <div className="flex gap-1 mt-1">
                        <input
                          type="text"
                          value={newInfoboxDraft}
                          onChange={(e) => setNewInfoboxDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && newInfoboxDraft.trim()) { setEditInfobox([...editInfobox, newInfoboxDraft.trim()]); setNewInfoboxDraft(""); } }}
                          placeholder="Add infobox label..."
                          className={`${retro.sunken} bg-[#0A0A28] px-2 py-1 text-[10px] flex-1 outline-none`}
                          style={inputStyle}
                        />
                        <button
                          onClick={() => { if (newInfoboxDraft.trim()) { setEditInfobox([...editInfobox, newInfoboxDraft.trim()]); setNewInfoboxDraft(""); } }}
                          className="text-[10px] px-2 hover:opacity-80"
                          style={S_ACCENT}
                        >Add</button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={saveEdit}
                    className={`${retro.button} w-full px-4 py-2 text-[11px] flex items-center justify-center gap-1`}
                    style={{ color: "#4AFF6A", background: "#0A2A0A", borderColor: "#1A5A1A" }}
                  >
                    <Save size={11} /> Save Template
                  </button>
                </div>
              );
            })() : (
              <div className="flex items-center justify-center h-full text-[12px]" style={S_DIM}>
                Select a template to edit, or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { loadTemplates, saveCustomTemplates, getTemplateIcon };