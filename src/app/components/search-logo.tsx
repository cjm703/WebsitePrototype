import React from "react";
import { BookOpen } from "lucide-react";

export function SearchLogo({ size = "large" }: { size?: "large" | "small" }) {
  const isLarge = size === "large";

  return (
    <div className={`flex items-center gap-2 ${isLarge ? "mb-2" : ""}`}>
      {isLarge && (
        <BookOpen
          size={isLarge ? 36 : 18}
          style={{ color: "#4A7BFF", filter: "drop-shadow(1px 1px 0px #0A0A3B)" }}
        />
      )}
      <div
        className={`flex items-baseline ${isLarge ? "gap-1" : "gap-0.5"}`}
        style={{ fontFamily: "'Trebuchet MS', 'Tahoma', 'Verdana', sans-serif" }}
      >
        <span
          className={`${isLarge ? "text-[56px]" : "text-[26px]"} tracking-tight`}
          style={{
            color: "#4A7BFF",
            fontWeight: 700,
            textShadow: isLarge
              ? "2px 2px 0px #0A0A3B, -1px -1px 0px #2A2A6B"
              : "1px 1px 0px #0A0A3B",
          }}
        >
          I-Net
        </span>
        <span
          className={`${isLarge ? "text-[20px]" : "text-[12px]"} tracking-wide`}
          style={{
            color: "#3A5A9B",
            fontWeight: 400,
            verticalAlign: "super",
          }}
        >
          ™
        </span>
      </div>
      {isLarge && (
        <div className="flex flex-col items-start ml-2">
          <span
            className="text-[13px] tracking-[0.15em] uppercase"
            style={{ color: "#5A7ABB", fontFamily: "'Tahoma', 'Verdana', sans-serif", fontWeight: 600 }}
          >
            Wiki
          </span>
          <span
            className="text-[10px] tracking-[0.2em] uppercase"
            style={{ color: "#3A4A6A", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
          >
            Encyclopedia
          </span>
        </div>
      )}
      {!isLarge && (
        <span
          className="text-[11px] tracking-wide ml-1"
          style={{ color: "#3A5A9B", fontFamily: "'Tahoma', 'Verdana', sans-serif" }}
        >
          Wiki
        </span>
      )}
    </div>
  );
}
