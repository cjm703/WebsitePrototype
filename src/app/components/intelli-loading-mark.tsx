type IntelliLoadingMarkProps = {
  size?: number;
};

export function IntelliLoadingMark({ size = 112 }: IntelliLoadingMarkProps) {
  const scale = size / 112;
  const borderWidth = Math.max(2, Math.round(4 * scale));
  const innerInset = Math.max(8, Math.round(16 * scale));

  return (
    <>
      <style>{`
        @keyframes intelli-loading-mark-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="relative shrink-0"
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 0 ${Math.round(24 * scale)}px rgba(225, 196, 160, 0.18))`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "9999px",
            border: `${borderWidth}px solid #d7b186`,
            boxShadow: "0 0 0 2px rgba(86, 60, 34, 0.3) inset",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: innerInset,
            borderRadius: "9999px",
            border: `${borderWidth}px solid #ead4b8`,
            boxShadow: "0 0 0 2px rgba(86, 60, 34, 0.25) inset",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f3e6d3",
            fontSize: Math.round(44 * scale),
            fontWeight: 400,
            lineHeight: 1,
            fontFamily: "'Georgia', 'Times New Roman', serif",
            animation: "intelli-loading-mark-spin 1.6s linear infinite",
            textShadow: "0 0 12px rgba(255,255,255,0.08)",
          }}
        >
          I
        </div>
      </div>
    </>
  );
}
