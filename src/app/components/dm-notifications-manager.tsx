import React, { useMemo, useState } from "react";
import { Edit, Plus, Send, Trash2, X } from "lucide-react";
import { retro } from "./retro-styles";
import type { DMNotification, PlayerData } from "./types";
import {
  dmActiveBtn,
  dmNotifTarget,
  dmPlayerSelect,
  S_ACCENT,
  S_ACCENT_HDR,
  S_DIM,
  S_GREEN_BTN,
  S_MUTED,
  S_RED,
  S_SECTION_HDR,
  S_SUBTLE,
  S_TEXT,
  S_TEXT_BOLD,
} from "./dm-styles";

const PLAYER_REPORT_PREFIX = "[Player Report]";
const INPUT_CLASS = `${retro.sunken} w-full bg-[#0A0A28] px-3 py-2 text-[13px] outline-none`;

function isPlayerReport(notification: DMNotification) {
  return notification.subject.startsWith(PLAYER_REPORT_PREFIX);
}

export function DMNotificationsManager({
  notifications,
  players,
  onChange,
}: {
  notifications: DMNotification[];
  players: Pick<PlayerData, "id" | "name">[];
  onChange: (next: DMNotification[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState<DMNotification | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [allPlayers, setAllPlayers] = useState(true);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => !isPlayerReport(notification)),
    [notifications],
  );

  const startNew = () => {
    setEditing({ id: `notif-${Date.now()}`, subject: "", message: "", assignedTo: [], createdAt: "" });
    setAllPlayers(true);
    setSelectedPlayers({});
    setIsNew(true);
    setActionError(null);
  };

  const startEdit = (notification: DMNotification) => {
    const targetsAllPlayers = notification.assignedTo.includes("ALL");
    const selected: Record<string, boolean> = {};
    players.forEach((player) => {
      selected[player.id] = notification.assignedTo.includes(player.name);
    });
    setEditing({ ...notification });
    setAllPlayers(targetsAllPlayers);
    setSelectedPlayers(targetsAllPlayers ? {} : selected);
    setIsNew(false);
    setActionError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setIsNew(false);
    setActionError(null);
  };

  const save = async () => {
    if (!editing?.subject.trim() || saving) return;
    const assignedTo = allPlayers
      ? ["ALL"]
      : players.filter((player) => selectedPlayers[player.id]).map((player) => player.name);
    if (assignedTo.length === 0) {
      setActionError("Select at least one player before sending.");
      return;
    }

    const now = new Date();
    const createdAt = isNew
      ? `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
      : editing.createdAt;
    const savedNotification = { ...editing, subject: editing.subject.trim(), assignedTo, createdAt };
    const next = isNew
      ? [savedNotification, ...notifications]
      : notifications.map((notification) => notification.id === savedNotification.id ? savedNotification : notification);

    setSaving(true);
    setActionError(null);
    try {
      await onChange(next);
      cancelEdit();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The notification could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await onChange(notifications.filter((notification) => notification.id !== id));
      if (editing?.id === id) cancelEdit();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The notification could not be removed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[16px]" style={S_ACCENT_HDR}>Manage Notifications</h3>
          <p className="mt-1 text-[10px]" style={S_SUBTLE}>Send dashboard messages to one player, a group, or everyone.</p>
        </div>
        <button type="button" onClick={startNew} className={`${retro.button} flex items-center gap-2 px-4 py-2 text-[12px]`} style={S_GREEN_BTN}>
          <Plus size={14} /> New Notification
        </button>
      </div>

      {editing && (
        <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="truncate text-[12px]" style={S_SECTION_HDR}>
              {isNew ? "CREATE NEW NOTIFICATION" : `EDITING: ${editing.subject || "(no subject)"}`}
            </div>
            <button type="button" onClick={cancelEdit} title="Close editor" className="shrink-0 p-1 hover:opacity-80"><X size={16} style={S_RED} /></button>
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-[10px]" style={S_MUTED}>Subject</span>
            <input type="text" value={editing.subject} onChange={(event) => setEditing({ ...editing, subject: event.target.value })} placeholder="Notification subject line..." className={INPUT_CLASS} style={S_TEXT} />
          </label>

          <div className="mb-4">
            <div className="mb-2 text-[10px]" style={S_MUTED}>Send to</div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { setAllPlayers(true); setSelectedPlayers({}); }} className="px-3 py-1.5 text-[11px] transition-colors" style={dmActiveBtn(allPlayers)}>All Players</button>
              <button type="button" onClick={() => setAllPlayers(false)} className="px-3 py-1.5 text-[11px] transition-colors" style={dmActiveBtn(!allPlayers)}>Select Players</button>
            </div>
            {!allPlayers && (
              <div className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="mb-2 text-[10px]" style={S_SECTION_HDR}>SELECT RECIPIENTS</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {players.map((player) => (
                    <label key={player.id} className="flex cursor-pointer items-center gap-2 hover:opacity-80">
                      <input type="checkbox" checked={Boolean(selectedPlayers[player.id])} onChange={(event) => setSelectedPlayers({ ...selectedPlayers, [player.id]: event.target.checked })} className="accent-[#4A7BFF]" />
                      <span className="truncate text-[11px]" style={dmPlayerSelect(Boolean(selectedPlayers[player.id]))}>{player.name}</span>
                    </label>
                  ))}
                  {players.length === 0 && <span className="text-[11px]" style={S_MUTED}>No players defined yet.</span>}
                </div>
              </div>
            )}
          </div>

          <label className="mb-4 block">
            <span className="mb-1 block text-[10px]" style={S_MUTED}>Message</span>
            <textarea value={editing.message} onChange={(event) => setEditing({ ...editing, message: event.target.value })} placeholder="Enter notification message content..." rows={6} className={`${INPUT_CLASS} resize-y`} style={{ ...S_TEXT, fontFamily: "'Courier New', monospace" }} />
          </label>

          {actionError && <div className="mb-3 border border-[#713447] bg-[#1B0C16] px-3 py-2 text-[10px]" style={S_RED}>{actionError}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={saving || !editing.subject.trim()} className={`${retro.button} flex items-center gap-2 px-6 py-2 text-[12px] disabled:opacity-50`} style={S_GREEN_BTN}>
              <Send size={14} /> {saving ? "Saving..." : isNew ? "Send Notification" : "Save Changes"}
            </button>
            <button type="button" onClick={cancelEdit} className={`${retro.button} px-6 py-2 text-[12px]`} style={S_TEXT}>Cancel</button>
          </div>
        </div>
      )}

      {!editing && actionError && <div className="border border-[#713447] bg-[#1B0C16] px-3 py-2 text-[10px]" style={S_RED}>{actionError}</div>}

      <div className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
        <div className="mb-3 text-[12px]" style={S_SECTION_HDR}>SENT NOTIFICATIONS ({visibleNotifications.length})</div>
        {visibleNotifications.length === 0 ? (
          <div className="py-8 text-center text-[12px]" style={S_MUTED}>No notifications sent yet.</div>
        ) : (
          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {visibleNotifications.map((notification) => (
              <div key={notification.id} className={`${retro.raised} bg-[#0E0E35] p-3`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]" style={S_TEXT_BOLD}>{notification.subject}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[10px]" style={S_MUTED}>{notification.createdAt}</span>
                      <span className="text-[9px]" style={S_DIM}>|</span>
                      <span className="text-[10px]" style={dmNotifTarget(notification.assignedTo.includes("ALL"))}>{notification.assignedTo.includes("ALL") ? "All Players" : notification.assignedTo.join(", ")}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => startEdit(notification)} className={`${retro.button} px-3 py-1 text-[11px]`} style={S_ACCENT}><Edit size={12} className="mr-1 inline" />Edit</button>
                    <button type="button" onClick={() => void remove(notification.id)} disabled={saving} className={`${retro.button} px-3 py-1 text-[11px] disabled:opacity-50`} style={S_RED}><Trash2 size={12} className="mr-1 inline" />Remove</button>
                  </div>
                </div>
                {notification.message && <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5" style={S_SUBTLE}>{notification.message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default DMNotificationsManager;
