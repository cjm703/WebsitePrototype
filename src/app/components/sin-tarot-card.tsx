import React from "react";
import "./sin-tarot-card.css";

export function SinTarotOrnaments() {
  return (
    <div className="sin-tarot__ornaments" aria-hidden="true">
      <span className="sin-tarot__corner sin-tarot__corner--top-left" />
      <span className="sin-tarot__corner sin-tarot__corner--top-right" />
      <span className="sin-tarot__corner sin-tarot__corner--bottom-left" />
      <span className="sin-tarot__corner sin-tarot__corner--bottom-right" />
      <span className="sin-tarot__edge-symbol sin-tarot__edge-symbol--top">✦</span>
      <span className="sin-tarot__edge-symbol sin-tarot__edge-symbol--bottom">◇</span>
      <span className="sin-tarot__edge-symbol sin-tarot__edge-symbol--left">☽</span>
      <span className="sin-tarot__edge-symbol sin-tarot__edge-symbol--right">☾</span>
    </div>
  );
}

export function SinTarotEmblem({ affinity, className = "" }: { affinity: string; className?: string }) {
  if (affinity.trim().toLowerCase() === "pride") {
    return (
      <svg className={className} viewBox="0 0 160 180" fill="none" aria-hidden="true" focusable="false">
        <path d="M80 10c25 0 49 8 61 23l-5 66c-3 31-27 54-56 69-29-15-53-38-56-69l-5-66C31 18 55 10 80 10Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="3" />
        <path d="M44 78c7-8 16-8 25 0M91 78c9 8 18 8 25 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M51 116c6 6 13 6 20 0M89 116c7-6 14-6 20 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 160 180" fill="none" aria-hidden="true" focusable="false">
      <path d="M80 10 139 90 80 170 21 90 80 10Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="80" cy="90" r="43" stroke="currentColor" strokeWidth="2" />
      <circle cx="80" cy="90" r="29" stroke="currentColor" strokeWidth="1.5" />
      <path d="M80 54 90 80 116 90 90 100 80 126 70 100 44 90 70 80 80 54Z" fill="currentColor" fillOpacity=".3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M80 3v13M80 164v13M3 90h15m124 0h15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
