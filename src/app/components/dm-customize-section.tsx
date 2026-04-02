import React, { useState, useEffect, useRef } from "react";
import { retro } from "./retro-styles";
import { appStore } from "@/lib/app-store";
import { S_MUTED, S_TEXT, S_ACCENT_HDR, S_SECTION_HDR, S_GREEN_BTN, S_RED, S_ACCENT, S_SUBTLE, S_WARN } from "./dm-styles";
import {
  Plus, Save, X, Edit, Trash2, ToggleLeft, ToggleRight, Palette, Cat,
} from "lucide-react";
import { type MascotTrigger } from "./initial-data";
import { initialMascotTriggers as sharedInitialMascotTriggers } from "./initial-data";
import type { TagDefinition } from "./types";
const INPUT_CLS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;

const TRIGGER_TYPE_LABELS: Record<MascotTrigger["type"], string> = {
  random: "Random Idle",
  low_hp: "Low HP",
  high_wounds: "High Wounds",
  high_weight: "Heavy Load",
  high_exhaustion: "Exhausted",
  status_effect: "Status Effect",
  status_effect_count: "Status Effect Count",
};

const TRIGGER_TYPE_COLORS: Record<MascotTrigger["type"], string> = {
  random: "#4A9A5A",
  low_hp: "#FF6A6A",
  high_wounds: "#FFAA4A",
  high_weight: "#C09A5A",
  high_exhaustion: "#C06AFF",
  status_effect: "#4AC0FF",
  status_effect_count: "#4AE0C0",
};

const DEFAULT_BORED_LINES = [
  "Hey there! You look like you could use some excitement...",
  "I'm just vibing. What about you?",
  "Did you know there are secret corners of I-Net most people never find?",
  "Psst... keep clicking if you dare.",
  "I've been sitting here for ages. Entertain me!",
  "Meow? ...I mean, hello fellow human.",
];



export function DMCustomizeSection({ statusTags }: { statusTags: TagDefinition[] }) {
  const [mascotTriggers, setMascotTriggers] = useState<MascotTrigger[]>(sharedInitialMascotTriggers);
  const [editingTrigger, setEditingTrigger] = useState<MascotTrigger | null>(null);
  const [isAddingNewTrigger, setIsAddingNewTrigger] = useState(false);
  const [newLineText, setNewLineText] = useState("");

  const [partyColorPrompt, setPartyColorPrompt] = useState<string>("box");

  const [boredLines, setBoredLines] = useState<string[]>(DEFAULT_BORED_LINES);
  const [editingBoredLine, setEditingBoredLine] = useState("");

  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void appStore.loadDmCustomizeState({ mascotTriggers: sharedInitialMascotTriggers, partyColorPrompt: "box", boredLines: DEFAULT_BORED_LINES }).then((state: any) => {
      if (cancelled) return;
      setMascotTriggers(Array.isArray(state.mascotTriggers) ? state.mascotTriggers : sharedInitialMascotTriggers);
      setPartyColorPrompt(typeof state.partyColorPrompt === "string" ? state.partyColorPrompt : "box");
      setBoredLines(Array.isArray(state.boredLines) ? state.boredLines : DEFAULT_BORED_LINES);
      hydratedRef.current = true;
    }).catch(() => { hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = setTimeout(() => {
      void appStore.saveDmCustomizeState({ mascotTriggers, partyColorPrompt, boredLines }).catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [mascotTriggers, partyColorPrompt, boredLines]);

  const handleStartAddTrigger = () => {
    setEditingTrigger({
      id: `mt-${Date.now()}`,
      name: "",
      type: "random",
      chance: 10,
      enabled: true,
      lines: [],
      threshold: 0,
      statusEffectName: "",
    });
    setIsAddingNewTrigger(true);
    setNewLineText("");
  };

  const handleSaveTrigger = () => {
    if (!editingTrigger) return;
    if (isAddingNewTrigger) {
      setMascotTriggers((prev) => [...prev, editingTrigger]);
    } else {
      setMascotTriggers((prev) => prev.map((t) => (t.id === editingTrigger.id ? editingTrigger : t)));
    }
    setEditingTrigger(null);
    setIsAddingNewTrigger(false);
    setNewLineText("");
  };

  const handleDeleteTrigger = (id: string) => {
    setMascotTriggers((prev) => prev.filter((t) => t.id !== id));
    if (editingTrigger?.id === id) { setEditingTrigger(null); setIsAddingNewTrigger(false); }
  };

  const handleEditTrigger = (trigger: MascotTrigger) => {
    setEditingTrigger({ ...trigger, lines: [...trigger.lines] });
    setIsAddingNewTrigger(false);
    setNewLineText("");
  };

  const handleToggleTrigger = (id: string) => {
    setMascotTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const addLineToEditing = () => {
    if (!editingTrigger || !newLineText.trim()) return;
    setEditingTrigger({ ...editingTrigger, lines: [...editingTrigger.lines, newLineText.trim()] });
    setNewLineText("");
  };

  const removeLineFromEditing = (index: number) => {
    if (!editingTrigger) return;
    setEditingTrigger({ ...editingTrigger, lines: editingTrigger.lines.filter((_, i) => i !== index) });
  };

  const needsThreshold = editingTrigger && ["low_hp", "high_wounds", "high_weight", "high_exhaustion"].includes(editingTrigger.type);
  const needsStatusName = editingTrigger && editingTrigger.type === "status_effect";
  const needsStatusCount = editingTrigger && editingTrigger.type === "status_effect_count";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px]" style={S_ACCENT_HDR}>Customization Editing</h2>
        <button onClick={handleStartAddTrigger} className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
          <Plus size={14} /> New Trigger
        </button>
      </div>

      <p className="text-[11px]" style={S_SUBTLE}>
        Configure the mascot popup that appears on the Personal Files page. Set what triggers it, the probability, and what messages it displays.
      </p>

      {editingTrigger && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[12px]" style={{ color: "#5A7ABB", fontWeight: 600 }}>
              {isAddingNewTrigger ? "CREATE NEW TRIGGER" : `EDITING: ${editingTrigger.name || "(unnamed)"}`}
            </div>
            <button onClick={() => { setEditingTrigger(null); setIsAddingNewTrigger(false); }} className="hover:opacity-80">
              <X size={16} style={S_RED} />
            </button>
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>Trigger Name:</label>
            <input
              type="text"
              value={editingTrigger.name}
              onChange={(e) => setEditingTrigger({ ...editingTrigger, name: e.target.value })}
              placeholder="e.g. Low HP Warning..."
              className={INPUT_CLS}
              style={S_TEXT}
            />
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>Trigger Type:</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TRIGGER_TYPE_LABELS) as MascotTrigger["type"][]).map((type) => (
                <button
                  key={type}
                  onClick={() => setEditingTrigger({ ...editingTrigger, type })}
                  className="text-[11px] px-3 py-1.5 transition-colors"
                  style={{
                    background: editingTrigger.type === type ? TRIGGER_TYPE_COLORS[type] : "#1A1A4B",
                    color: editingTrigger.type === type ? "#FFFFFF" : "#7A8AAA",
                    border: `1px solid ${editingTrigger.type === type ? TRIGGER_TYPE_COLORS[type] : "#2A2A5B"}`,
                  }}
                >
                  {TRIGGER_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>
              Chance ({editingTrigger.chance}%):
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={editingTrigger.chance}
                onChange={(e) => setEditingTrigger({ ...editingTrigger, chance: parseInt(e.target.value) })}
                className="flex-1 accent-[#4A7BFF]"
              />
              <input
                type="number"
                value={editingTrigger.chance}
                onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setEditingTrigger({ ...editingTrigger, chance: Math.max(0, Math.min(100, v)) }); }}
                className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[13px] py-1 outline-none`}
                style={S_TEXT}
              />
            </div>
          </div>

          {needsThreshold && (
            <div className="mb-4">
              <label className="text-[10px] block mb-1" style={S_MUTED}>
                Threshold ({editingTrigger.threshold}%):
                <span className="ml-1" style={S_MUTED}>
                  {editingTrigger.type === "low_hp" ? "(triggers when HP is at or below this %)" : "(triggers when value is at or above this %)"}
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={editingTrigger.threshold}
                  onChange={(e) => setEditingTrigger({ ...editingTrigger, threshold: parseInt(e.target.value) })}
                  className="flex-1 accent-[#FFAA4A]"
                />
                <input
                  type="number"
                  value={editingTrigger.threshold}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setEditingTrigger({ ...editingTrigger, threshold: Math.max(0, Math.min(100, v)) }); }}
                  className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[13px] py-1 outline-none`}
                  style={S_TEXT}
                />
              </div>
            </div>
          )}

          {needsStatusName && (
            <div className="mb-4">
              <label className="text-[10px] block mb-1" style={S_MUTED}>Status Effect:</label>
              <select
                value={editingTrigger.statusEffectName}
                onChange={(e) => setEditingTrigger({ ...editingTrigger, statusEffectName: e.target.value })}
                className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`}
                style={{ ...S_TEXT, border: "1px solid #2A2A5B" }}
              >
                <option value="" style={S_MUTED}>— Select a status effect —</option>
                {statusTags.map((tag) => (
                  <option key={tag.id} value={tag.name}>{tag.name}</option>
                ))}
              </select>
              {editingTrigger.statusEffectName && !statusTags.some(t => t.name === editingTrigger.statusEffectName) && (
                <div className="text-[9px] mt-1" style={S_WARN}>
                  ⚠ "{editingTrigger.statusEffectName}" is not in the current status effects list.
                </div>
              )}
            </div>
          )}

          {needsStatusCount && (
            <div className="mb-4">
              <label className="text-[10px] block mb-1" style={S_MUTED}>
                Status Effect Count Threshold ({editingTrigger.threshold}):
                <span className="ml-1" style={S_MUTED}>
                  (triggers when player has this many or more{editingTrigger.statusEffectName ? ` "${editingTrigger.statusEffectName}"` : ""} active status effects)
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={editingTrigger.threshold}
                  onChange={(e) => setEditingTrigger({ ...editingTrigger, threshold: parseInt(e.target.value) })}
                  className="flex-1 accent-[#4AE0C0]"
                />
                <input
                  type="number"
                  value={editingTrigger.threshold}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) setEditingTrigger({ ...editingTrigger, threshold: Math.max(1, Math.min(20, v)) }); }}
                  className={`${retro.sunken} bg-[#0A0A28] w-16 text-center text-[13px] py-1 outline-none`}
                  style={S_TEXT}
                />
              </div>
              <div className="mt-3">
                <label className="text-[10px] block mb-1" style={S_MUTED}>
                  Filter by Status Effect:
                  <span className="ml-1" style={S_MUTED}>(optional — leave as "Any" to count all effects)</span>
                </label>
                <select
                  value={editingTrigger.statusEffectName}
                  onChange={(e) => setEditingTrigger({ ...editingTrigger, statusEffectName: e.target.value })}
                  className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`}
                  style={{ ...S_TEXT, border: "1px solid #2A2A5B" }}
                >
                  <option value="">Any (all status effects)</option>
                  {statusTags.map((tag) => (
                    <option key={tag.id} value={tag.name}>{tag.name}</option>
                  ))}
                </select>
                {editingTrigger.statusEffectName && !statusTags.some(t => t.name === editingTrigger.statusEffectName) && (
                  <div className="text-[9px] mt-1" style={S_WARN}>
                    ⚠ "{editingTrigger.statusEffectName}" is not in the current status effects list.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[10px] block mb-1" style={S_MUTED}>
              Message Lines ({editingTrigger.lines.length}):
            </label>
            <p className="text-[10px] mb-2" style={S_MUTED}>
              A random line is picked each time the popup triggers. Add multiple for variety.
            </p>

            {editingTrigger.lines.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {editingTrigger.lines.map((line, i) => (
                  <div key={i} className={`${retro.raised} bg-[#0E0E35] px-3 py-2 flex items-start gap-2`}>
                    <span className="text-[9px] shrink-0 mt-0.5" style={S_MUTED}>{i + 1}.</span>
                    <span className="text-[11px] flex-1" style={S_TEXT}>{line}</span>
                    <button onClick={() => removeLineFromEditing(i)} className="shrink-0 hover:opacity-80 p-0.5" style={S_RED}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newLineText}
                onChange={(e) => setNewLineText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLineToEditing(); }}
                placeholder="Type a message and press Enter or click Add..."
                className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] flex-1 outline-none`}
                style={S_TEXT}
              />
              <button onClick={addLineToEditing} className={`${retro.button} px-3 py-2 text-[11px]`} style={S_GREEN_BTN}>
                <Plus size={12} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setEditingTrigger({ ...editingTrigger, enabled: !editingTrigger.enabled })}
              className="flex items-center gap-2 hover:opacity-80"
            >
              {editingTrigger.enabled
                ? <ToggleRight size={20} style={S_GREEN_BTN} />
                : <ToggleLeft size={20} style={S_MUTED} />
              }
              <span className="text-[11px]" style={{ color: editingTrigger.enabled ? "#4A9A5A" : "#5A6A8A" }}>
                {editingTrigger.enabled ? "Enabled" : "Disabled"}
              </span>
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSaveTrigger} className={`${retro.button} px-6 py-2 text-[12px] flex items-center gap-2`} style={S_GREEN_BTN}>
              <Save size={14} /> {isAddingNewTrigger ? "Create Trigger" : "Save Changes"}
            </button>
            <button onClick={() => { setEditingTrigger(null); setIsAddingNewTrigger(false); }} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
          </div>
        </div>
      )}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="text-[12px] mb-3" style={S_SECTION_HDR}>CONFIGURED TRIGGERS ({mascotTriggers.length})</div>
        {mascotTriggers.length === 0 ? (
          <div className="text-[12px] text-center py-6" style={S_MUTED}>No triggers configured yet.</div>
        ) : (
          <div className="space-y-2">
            {mascotTriggers.map((trigger) => (
              <div
                key={trigger.id}
                className={`${retro.raised} bg-[#0E0E35] p-3`}
                style={{ opacity: trigger.enabled ? 1 : 0.5, borderLeft: `3px solid ${TRIGGER_TYPE_COLORS[trigger.type]}` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] truncate" style={{ color: "#C0D0F0", fontWeight: 600 }}>{trigger.name || "(unnamed)"}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 shrink-0"
                        style={{ background: TRIGGER_TYPE_COLORS[trigger.type] + "30", color: TRIGGER_TYPE_COLORS[trigger.type], border: `1px solid ${TRIGGER_TYPE_COLORS[trigger.type]}50` }}
                      >
                        {TRIGGER_TYPE_LABELS[trigger.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px]" style={S_MUTED}>
                        Chance: {trigger.chance}%
                      </span>
                      {["low_hp", "high_wounds", "high_weight", "high_exhaustion"].includes(trigger.type) && (
                        <span className="text-[10px]" style={S_MUTED}>
                          Threshold: {trigger.threshold}%
                        </span>
                      )}
                      {trigger.type === "status_effect" && trigger.statusEffectName && (
                        <span className="text-[10px]" style={{ color: "#4AC0FF" }}>
                          Effect: {trigger.statusEffectName}
                        </span>
                      )}
                      {trigger.type === "status_effect_count" && (
                        <span className="text-[10px]" style={{ color: "#4AE0C0" }}>
                          Count ≥ {trigger.threshold}{trigger.statusEffectName ? ` (${trigger.statusEffectName})` : " (any)"}
                        </span>
                      )}
                      <span className="text-[10px]" style={S_MUTED}>
                        {trigger.lines.length} line{trigger.lines.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button onClick={() => handleToggleTrigger(trigger.id)} className="hover:opacity-80">
                      {trigger.enabled
                        ? <ToggleRight size={18} style={S_GREEN_BTN} />
                        : <ToggleLeft size={18} style={S_MUTED} />
                      }
                    </button>
                    <button onClick={() => handleEditTrigger(trigger)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}>
                      <Edit size={12} className="inline mr-1" />Edit
                    </button>
                    <button onClick={() => handleDeleteTrigger(trigger.id)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_RED}>
                      <Trash2 size={12} className="inline mr-1" />Remove
                    </button>
                  </div>
                </div>
                {trigger.lines.length > 0 && (
                  <div className="text-[10px] mt-1" style={S_SUBTLE}>
                    {trigger.lines[0]}{trigger.lines.length > 1 ? ` (+${trigger.lines.length - 1} more)` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={16} style={{ color: "#FF69B4" }} />
          <div className="text-[12px]" style={{ color: "#FF69B4", fontWeight: 600 }}>PARTY COLOR DRAWING PROMPT</div>
        </div>
        <p className="text-[11px] mb-3" style={S_SUBTLE}>
          Set the drawing prompt displayed above the shared pixel canvas in the Party Color game. Players will see this as their drawing challenge.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={partyColorPrompt}
            onChange={(e) => setPartyColorPrompt(e.target.value)}
            placeholder="Enter a drawing prompt..."
            className={INPUT_CLS}
            style={S_TEXT}
          />
        </div>
        {partyColorPrompt && (
          <div className={`${retro.raised} mt-3 p-3`} style={{ background: "#12123A", borderLeft: "4px solid #FFD700" }}>
            <div className="text-[10px] mb-1" style={{ color: "#FFD700", fontFamily: "'Courier New', monospace" }}>PREVIEW:</div>
            <div className="text-[13px]" style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace" }}>{partyColorPrompt}</div>
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Cat size={16} style={{ color: "#4AE0C0" }} />
          <div className="text-[12px]" style={{ color: "#4AE0C0", fontWeight: 600 }}>BORED CHARACTER LINES</div>
        </div>
        <p className="text-[11px] mb-3" style={S_SUBTLE}>
          Configure the dialogue lines for the "Are you Bored?" character on the Interface sidebar. Players see a random line each time they click the character.
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={editingBoredLine}
            onChange={(e) => setEditingBoredLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editingBoredLine.trim()) {
                setBoredLines([...boredLines, editingBoredLine.trim()]);
                setEditingBoredLine("");
              }
            }}
            placeholder="Type a new line..."
            className={INPUT_CLS}
            style={S_TEXT}
          />
          <button
            onClick={() => {
              if (editingBoredLine.trim()) {
                setBoredLines([...boredLines, editingBoredLine.trim()]);
                setEditingBoredLine("");
              }
            }}
            className={`${retro.button} px-4 py-2 text-[11px] shrink-0`}
            style={S_GREEN_BTN}
          >
            <Plus size={12} className="inline mr-1" />Add
          </button>
        </div>

        <div className="space-y-1.5" style={{ maxHeight: 250, overflowY: "auto" }}>
          {boredLines.length === 0 ? (
            <div className="text-[11px] text-center py-4" style={S_MUTED}>No lines configured. Add one above.</div>
          ) : (
            boredLines.map((line, idx) => (
              <div
                key={idx}
                className={`${retro.raised} bg-[#0E0E35] p-2.5 flex items-start gap-2`}
                style={{ borderLeft: "3px solid #4AE0C050" }}
              >
                <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "#4AE0C0", fontFamily: "'Courier New', monospace" }}>
                  {idx + 1}.
                </span>
                <span className="text-[11px] flex-1 min-w-0" style={{ color: "#C0D0F0", fontFamily: "'Courier New', monospace", wordBreak: "break-word" }}>
                  {line}
                </span>
                <button
                  onClick={() => setBoredLines(boredLines.filter((_, i) => i !== idx))}
                  className="shrink-0 p-0.5 hover:opacity-80"
                  style={S_RED}
                  title="Remove line"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {boredLines.length > 0 && (
          <div className="text-[9px] mt-2" style={S_MUTED}>
            {boredLines.length} line{boredLines.length !== 1 ? "s" : ""} configured
          </div>
        )}
      </div>
    </div>
  );
}