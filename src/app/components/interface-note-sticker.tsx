import React from "react";
import type { PlacedSticker } from "./player-theme";

export function InterfaceNoteSticker({ sticker }: { sticker: PlacedSticker }) {
  const scale = Math.max(0.72, Math.min(1.08, sticker.scale || 1));
  const text = sticker.text || "You're late";

  return (
    <div
      role="img"
      aria-label={`Sticker: ${text}`}
      title={text}
      style={{
        position: "absolute",
        left: `${sticker.x ?? 50}%`,
        top: `${sticker.y ?? 50}%`,
        width: 86 * scale,
        minHeight: 40 * scale,
        padding: `${7 * scale}px ${6 * scale}px ${6 * scale}px`,
        display: "grid",
        placeItems: "center",
        background: "#F2D35B",
        border: `${Math.max(1, 2 * scale)}px solid #A53B3B`,
        boxShadow: "1px 2px 0 rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.35)",
        color: "#631F25",
        fontFamily: "'Arial Black', 'Tahoma', sans-serif",
        fontSize: Math.max(7.5, 9 * scale),
        fontWeight: 900,
        lineHeight: 1.05,
        textAlign: "center",
        textTransform: "uppercase",
        overflowWrap: "anywhere",
        transform: `translate(-50%, -50%) rotate(${sticker.rotation ?? 0}deg)`,
        zIndex: 10,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: "3px 3px auto", height: 2, background: "#A53B3B", opacity: 0.7 }} />
      {text}
    </div>
  );
}
