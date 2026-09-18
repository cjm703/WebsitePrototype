import React from "react";
import "./sin-tarot-card.css";

export function SinTarotOrnaments() {
  return (
    <div className="sin-tarot__ornaments" aria-hidden="true">
      <span className="sin-tarot__corner sin-tarot__corner--top-left" />
      <span className="sin-tarot__corner sin-tarot__corner--top-right" />
      <span className="sin-tarot__corner sin-tarot__corner--bottom-left" />
      <span className="sin-tarot__corner sin-tarot__corner--bottom-right" />
    </div>
  );
}

export function SinTarotEmblem({ affinity, className = "" }: { affinity: string; className?: string }) {
  if (affinity.trim().toLowerCase() === "pride") {
    return (
      <svg className={className} viewBox="0 0 160 180" fill="none" aria-hidden="true" focusable="false">
        <path d="M80 12c25 0 49 7 61 21l-5 68c-3 30-27 52-56 67-29-15-53-37-56-67l-5-68C31 19 55 12 80 12Z" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="3" />
        <path d="M32 38c15-10 31-15 48-15s33 5 48 15M26 91c10 33 29 53 54 66 25-13 44-33 54-66" stroke="currentColor" strokeWidth="2" strokeOpacity=".8" />
        <path d="M42 75c9-8 19-10 29-4-5 10-14 14-27 10m74-6c-9-8-19-10-29-4 5 10 14 14 27 10" fill="currentColor" fillOpacity=".32" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M80 82l-5 22 5 3 5-3-5-22ZM58 119c14 8 30 8 44 0M64 131c10 4 22 4 32 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M111 34 99 53l7 10-12 17 9 11-11 21" stroke="currentColor" strokeWidth="2" strokeOpacity=".72" strokeLinejoin="round" />
        <path d="M80 3v10M46 9l6 9m62-9-6 9M6 48l13 4m135-4-13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
