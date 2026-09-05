import React, { useEffect, useMemo, useState } from "react";
import { Sticker, Trash2 } from "lucide-react";
import { appStore } from "@/lib/app-store";
import { retro } from "./retro-styles";
import { S_ACCENT, S_GREEN_BTN, S_MUTED, S_RED, S_SECTION_HDR, S_TEXT } from "./dm-styles";
import {
  createInterfaceNoteSticker,
  isInterfaceNoteSticker,
  normalizePlacedStickers,
  type PlacedSticker,
} from "./player-theme";
import type { PlayerData } from "./types";

const INPUT_CLASS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none`;

export function DMInterfaceStickerManager({ players }: { players: PlayerData[] }) {
  const playerOptions = useMemo(() => players.filter((player) => player.id !== "dm"), [players]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [stickerText, setStickerText] = useState("You're late");
  const [stickersByPlayer, setStickersByPlayer] = useState<Record<string, PlacedSticker[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (playerOptions.length === 0) {
      setSelectedPlayerId("");
      return;
    }
    setSelectedPlayerId((current) => playerOptions.some((player) => player.id === current) ? current : playerOptions[0].id);
  }, [playerOptions]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(playerOptions.map(async (player) => {
      const stored = await appStore.loadPlayerPlacedStickers<unknown>(player.id, []);
      return [player.id, normalizePlacedStickers(stored)] as const;
    }))
      .then((entries) => {
        if (!cancelled) setStickersByPlayer(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setStatus({ tone: "error", text: "Sticker assignments could not be loaded." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playerOptions]);

  const selectedPlayer = playerOptions.find((player) => player.id === selectedPlayerId);
  const selectedStickers = stickersByPlayer[selectedPlayerId] || [];
  const interfaceStickers = selectedStickers.filter(isInterfaceNoteSticker);

  const savePlayerStickers = async (next: PlacedSticker[], successText: string) => {
    if (!selectedPlayerId) return;
    setSaving(true);
    setStatus(null);
    try {
      await appStore.savePlayerPlacedStickers(selectedPlayerId, next);
      setStickersByPlayer((current) => ({ ...current, [selectedPlayerId]: next }));
      setStatus({ tone: "ok", text: successText });
    } catch {
      setStatus({ tone: "error", text: "The sticker could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  const giveSticker = () => {
    const text = stickerText.trim();
    if (!selectedPlayer || !text || saving) return;
    const next = [...selectedStickers, createInterfaceNoteSticker(text, selectedStickers)];
    void savePlayerStickers(next, `${text} was added to ${selectedPlayer.name}.`);
  };

  const removeSticker = (sticker: PlacedSticker) => {
    if (!selectedPlayer || saving) return;
    const next = selectedStickers.filter((entry) => entry.id !== sticker.id);
    void savePlayerStickers(next, `Sticker removed from ${selectedPlayer.name}.`);
  };

  return (
    <section className={`${retro.sunken} bg-[#0C0C2E] p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sticker size={16} style={{ color: "#F2C94C" }} />
          <div className="text-[12px]" style={S_SECTION_HDR}>INTERFACE STICKERS</div>
        </div>
        <span className="text-[10px]" style={S_MUTED}>
          {Object.values(stickersByPlayer).reduce((total, entries) => total + entries.filter(isInterfaceNoteSticker).length, 0)} issued
        </span>
      </div>

      {playerOptions.length === 0 ? (
        <div className="py-4 text-center text-[11px]" style={S_MUTED}>No player profiles are available.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(150px,0.7fr)_minmax(180px,1.4fr)_auto] gap-2">
            <select
              value={selectedPlayerId}
              onChange={(event) => {
                setSelectedPlayerId(event.target.value);
                setStatus(null);
              }}
              className={INPUT_CLASS}
              style={S_TEXT}
              aria-label="Sticker recipient"
            >
              {playerOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
            <input
              value={stickerText}
              onChange={(event) => setStickerText(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") giveSticker(); }}
              maxLength={42}
              placeholder="Sticker text"
              className={INPUT_CLASS}
              style={S_TEXT}
            />
            <button
              type="button"
              onClick={giveSticker}
              disabled={saving || loading || !selectedPlayerId || !stickerText.trim()}
              className={`${retro.button} px-4 py-2 text-[11px] flex items-center justify-center gap-2 disabled:opacity-40`}
              style={S_GREEN_BTN}
            >
              <Sticker size={13} /> Give Sticker
            </button>
          </div>

          {status && (
            <div className="mt-2 text-[10px]" style={status.tone === "ok" ? S_ACCENT : S_RED} role="status">
              {status.text}
            </div>
          )}

          <div className="mt-3 border-t border-[#242858] pt-2">
            {loading ? (
              <div className="py-2 text-[10px]" style={S_MUTED}>Loading stickers...</div>
            ) : interfaceStickers.length === 0 ? (
              <div className="py-2 text-[10px]" style={S_MUTED}>No Interface stickers assigned to this player.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {interfaceStickers.map((sticker) => (
                  <div key={sticker.id} className="flex min-w-0 items-center gap-2 border border-[#4E4526] bg-[#17150C] px-2.5 py-1.5">
                    <span className="max-w-[220px] truncate text-[10px] font-bold uppercase" style={{ color: "#F2C94C" }}>
                      {sticker.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSticker(sticker)}
                      disabled={saving}
                      className="shrink-0 hover:opacity-75 disabled:opacity-40"
                      style={S_RED}
                      title={`Remove ${sticker.text || "sticker"}`}
                      aria-label={`Remove ${sticker.text || "sticker"}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
