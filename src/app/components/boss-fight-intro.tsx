import React, { useState, useEffect, useCallback } from "react";

const DIALOG_BOXES: { text: string; big?: boolean }[] = [
  { text: "So..." },
  { text: "You have finally come to my domain, mortal." },
  { text: "Let it be known, you have entered the domain..." },
  { text: "The domain..." },
  { text: "of..." },
  { text: "GNARPY", big: true },
];

const CURTAIN_DURATION = 2400; // ms for curtains to fully open
const DIALOG_APPEAR_DELAY = 600; // ms after curtains open before dialog shows

const introCSS = `
@keyframes curtainLeft {
  0% { transform: translateX(0) skewX(0deg); }
  30% { transform: translateX(-5%) skewX(2deg); }
  100% { transform: translateX(-105%) skewX(0deg); }
}
@keyframes curtainRight {
  0% { transform: translateX(0) skewX(0deg); }
  30% { transform: translateX(5%) skewX(-2deg); }
  100% { transform: translateX(105%) skewX(0deg); }
}
@keyframes curtainShimmer {
  0% { background-position: 0% 0%; }
  100% { background-position: 0% 100%; }
}
@keyframes tassleSwing {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
@keyframes gnarpyShake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-8px, 4px); }
  20% { transform: translate(6px, -6px); }
  30% { transform: translate(-10px, -2px); }
  40% { transform: translate(8px, 6px); }
  50% { transform: translate(-4px, -8px); }
  60% { transform: translate(10px, 2px); }
  70% { transform: translate(-6px, 8px); }
  80% { transform: translate(4px, -4px); }
  90% { transform: translate(-8px, -6px); }
}
@keyframes dialogFadeIn {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes textTypeIn {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes spotlightPulse {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.3; }
}
@keyframes starsFloat {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}
`;

export function BossFightIntro({ onComplete }: { onComplete: () => void }) {
  const [curtainsOpen, setCurtainsOpen] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);
  const [dialogIndex, setDialogIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [textComplete, setTextComplete] = useState(false);

  // Inject CSS
  useEffect(() => {
    const id = "boss-intro-anim";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = introCSS;
      document.head.appendChild(style);
    }
  }, []);

  // Start curtain animation after mount
  useEffect(() => {
    const t = setTimeout(() => setCurtainsOpen(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Show dialog after curtains open
  useEffect(() => {
    if (!curtainsOpen) return;
    const t = setTimeout(() => setDialogReady(true), CURTAIN_DURATION + DIALOG_APPEAR_DELAY);
    return () => clearTimeout(t);
  }, [curtainsOpen]);

  // Typewriter effect for current dialog
  useEffect(() => {
    if (!dialogReady) return;
    const current = DIALOG_BOXES[dialogIndex];
    if (!current) return;

    setDisplayedText("");
    setTextComplete(false);

    const fullText = current.text;
    // For the big "GNARPY" text, show it instantly
    if (current.big) {
      setDisplayedText(fullText);
      setTextComplete(true);
      const autoAdvance = setTimeout(() => {
        onComplete();
      }, 2500);
      return () => clearTimeout(autoAdvance);
    }

    let charIndex = 0;
    const speed = 40;
    const interval = setInterval(() => {
      charIndex++;
      setDisplayedText(fullText.slice(0, charIndex));
      if (charIndex >= fullText.length) {
        clearInterval(interval);
        setTextComplete(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [dialogIndex, dialogReady]);

  const handleClick = useCallback(() => {
    if (!dialogReady) return;

    // If text is still typing, complete it instantly
    if (!textComplete) {
      setDisplayedText(DIALOG_BOXES[dialogIndex].text);
      setTextComplete(true);
      return;
    }

    // Move to next dialog box
    if (dialogIndex < DIALOG_BOXES.length - 1) {
      setDialogIndex((i) => i + 1);
    } else {
      // All dialog done, proceed to fight
      onComplete();
    }
  }, [dialogReady, textComplete, dialogIndex, onComplete]);

  // Also allow keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "z") {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClick]);

  const currentDialog = DIALOG_BOXES[dialogIndex];
  const isBigText = currentDialog?.big;

  // Generate deterministic stars for the background
  const stars = Array.from({ length: 50 }, (_, i) => ({
    x: ((i * 73 + 17) % 100),
    y: ((i * 47 + 31) % 100),
    size: 1 + (i % 3),
    opacity: 0.2 + (i % 5) * 0.12,
    delay: (i * 0.15) % 3,
  }));

  return (
    <div
      onClick={handleClick}
      className="fixed inset-0 z-[9999] cursor-pointer select-none"
      style={{ fontFamily: "'Courier New', monospace" }}
    >
      {/* Dark space background with subtle stars (revealed behind curtains) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, #0a0020 0%, #000000 70%)" }}>
        {/* Floating stars */}
        {stars.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              background: `rgba(255,255,255,${s.opacity})`,
              boxShadow: s.size > 2 ? `0 0 ${s.size * 2}px rgba(200,200,255,${s.opacity * 0.5})` : "none",
              animation: `spotlightPulse ${2 + s.delay}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
        {/* Center spotlight */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "40%",
            transform: "translate(-50%, -50%)",
            width: 500,
            height: 500,
            background: "radial-gradient(circle, rgba(100,0,200,0.12) 0%, transparent 70%)",
            animation: "spotlightPulse 4s ease-in-out infinite",
          }}
        />
      </div>

      {/* Left curtain */}
      <div
        className="absolute top-0 left-0 w-1/2 h-full overflow-hidden"
        style={{
          animation: curtainsOpen
            ? `curtainLeft ${CURTAIN_DURATION}ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards`
            : "none",
          zIndex: 10,
        }}
      >
        <div className="w-full h-full relative">
          {/* Main curtain fabric with rich velvet gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, 
                #1a0000 0%, #4A0000 3%, #8B0000 8%, 
                #CC1111 20%, #AA0808 35%, #8B0000 50%, 
                #CC1111 65%, #AA0808 80%, #8B0000 92%, 
                #4A0000 97%, #1a0000 100%)`,
            }}
          />
          {/* Curtain folds with enhanced depth */}
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${i * 10}%`,
                width: "10%",
                background: `linear-gradient(90deg, 
                  rgba(0,0,0,${0.35 + (i % 2) * 0.1}) 0%, 
                  rgba(180,20,20,${0.08 + (i % 3) * 0.04}) 20%, 
                  rgba(255,255,255,0.06) 35%, 
                  rgba(0,0,0,${0.15 + (i % 2) * 0.08}) 50%,
                  rgba(255,200,200,0.04) 65%, 
                  rgba(0,0,0,${0.3 + (i % 2) * 0.1}) 100%)`,
              }}
            />
          ))}
          {/* Vertical shimmer streaks */}
          {[1, 3, 6, 8].map((pos) => (
            <div
              key={`shimmer-${pos}`}
              className="absolute top-0 h-full"
              style={{
                left: `${pos * 10 + 5}%`,
                width: 2,
                background: "linear-gradient(180deg, transparent 0%, rgba(255,180,180,0.15) 20%, rgba(255,220,220,0.08) 50%, rgba(255,180,180,0.15) 80%, transparent 100%)",
                backgroundSize: "100% 200%",
                animation: "curtainShimmer 3s linear infinite",
              }}
            />
          ))}
          {/* Bottom ornate fringe with tassels */}
          <div
            className="absolute bottom-0 left-0 w-full"
            style={{ height: 50 }}
          >
            <div
              className="absolute top-0 left-0 w-full"
              style={{
                height: 6,
                background: "linear-gradient(90deg, #8B6914, #FFD700 20%, #FFF8DC 40%, #FFD700 60%, #8B6914 80%, #FFD700 100%)",
                boxShadow: "0 0 8px rgba(255,215,0,0.4), 0 2px 4px rgba(0,0,0,0.5)",
              }}
            />
            {/* Zigzag fringe pattern */}
            <svg className="absolute w-full" style={{ top: 6, height: 20, overflow: "visible" }}>
              {[...Array(20)].map((_, i) => (
                <polygon
                  key={i}
                  points={`${i * 5}%,0 ${i * 5 + 2.5}%,100% ${i * 5 + 5}%,0`}
                  fill={i % 2 === 0 ? "#8B0000" : "#6B0000"}
                  stroke="#FFD700"
                  strokeWidth="0.5"
                />
              ))}
            </svg>
            {/* Tassels */}
            <div className="absolute flex justify-around w-full" style={{ bottom: -16 }}>
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 18,
                    background: "linear-gradient(180deg, #FFD700, #8B6914)",
                    borderRadius: "0 0 3px 3px",
                    transformOrigin: "top center",
                    animation: `tassleSwing ${0.8 + i * 0.1}s ease-in-out infinite`,
                    animationDelay: `${i * 0.15}s`,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                  }}
                />
              ))}
            </div>
          </div>
          {/* Top ornate rod with finials */}
          <div className="absolute top-0 left-0 w-full" style={{ height: 28 }}>
            <div
              className="absolute left-0 w-full"
              style={{
                top: 0,
                height: 22,
                background: "linear-gradient(180deg, #5A4000 0%, #8B6914 15%, #FFD700 35%, #FFFACD 50%, #FFD700 65%, #8B6914 85%, #5A4000 100%)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
                borderBottom: "2px solid #3A2800",
              }}
            />
            {/* Ornamental dots on rod */}
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${15 + i * 18}%`,
                  top: 6,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, #FFFACD, #FFD700, #8B6914)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                }}
              />
            ))}
            {/* Gathered fabric below rod */}
            <div
              className="absolute left-0 w-full"
              style={{
                top: 22,
                height: 14,
                background: "linear-gradient(180deg, #3A0000, #6B0000 40%, #8B0000)",
                borderTop: "1px solid #FFD700",
              }}
            />
          </div>
          {/* Decorative embroidered border stripe */}
          <div
            className="absolute top-[42px] right-0 h-[calc(100%-92px)]"
            style={{
              width: 16,
              background: `repeating-linear-gradient(180deg, 
                #FFD700 0px, #8B6914 4px, #FFD700 8px, transparent 8px, transparent 16px)`,
              opacity: 0.3,
            }}
          />
        </div>
      </div>

      {/* Right curtain */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full overflow-hidden"
        style={{
          animation: curtainsOpen
            ? `curtainRight ${CURTAIN_DURATION}ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards`
            : "none",
          zIndex: 10,
        }}
      >
        <div className="w-full h-full relative">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, 
                #1a0000 0%, #4A0000 3%, #8B0000 8%, 
                #CC1111 20%, #AA0808 35%, #8B0000 50%, 
                #CC1111 65%, #AA0808 80%, #8B0000 92%, 
                #4A0000 97%, #1a0000 100%)`,
            }}
          />
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${i * 10}%`,
                width: "10%",
                background: `linear-gradient(90deg, 
                  rgba(0,0,0,${0.3 + (i % 2) * 0.1}) 0%, 
                  rgba(255,200,200,0.04) 35%, 
                  rgba(255,255,255,0.06) 50%,
                  rgba(180,20,20,${0.08 + (i % 3) * 0.04}) 65%, 
                  rgba(0,0,0,${0.35 + (i % 2) * 0.1}) 100%)`,
              }}
            />
          ))}
          {[2, 4, 7, 9].map((pos) => (
            <div
              key={`shimmer-${pos}`}
              className="absolute top-0 h-full"
              style={{
                left: `${pos * 10 + 5}%`,
                width: 2,
                background: "linear-gradient(180deg, transparent 0%, rgba(255,180,180,0.15) 20%, rgba(255,220,220,0.08) 50%, rgba(255,180,180,0.15) 80%, transparent 100%)",
                backgroundSize: "100% 200%",
                animation: "curtainShimmer 3s linear infinite",
                animationDelay: "1.5s",
              }}
            />
          ))}
          {/* Bottom ornate fringe */}
          <div className="absolute bottom-0 left-0 w-full" style={{ height: 50 }}>
            <div
              className="absolute top-0 left-0 w-full"
              style={{
                height: 6,
                background: "linear-gradient(90deg, #FFD700, #8B6914 20%, #FFD700 40%, #FFF8DC 60%, #FFD700 80%, #8B6914 100%)",
                boxShadow: "0 0 8px rgba(255,215,0,0.4), 0 2px 4px rgba(0,0,0,0.5)",
              }}
            />
            <svg className="absolute w-full" style={{ top: 6, height: 20, overflow: "visible" }}>
              {[...Array(20)].map((_, i) => (
                <polygon
                  key={i}
                  points={`${i * 5}%,0 ${i * 5 + 2.5}%,100% ${i * 5 + 5}%,0`}
                  fill={i % 2 === 0 ? "#8B0000" : "#6B0000"}
                  stroke="#FFD700"
                  strokeWidth="0.5"
                />
              ))}
            </svg>
            <div className="absolute flex justify-around w-full" style={{ bottom: -16 }}>
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 18,
                    background: "linear-gradient(180deg, #FFD700, #8B6914)",
                    borderRadius: "0 0 3px 3px",
                    transformOrigin: "top center",
                    animation: `tassleSwing ${0.8 + i * 0.1}s ease-in-out infinite`,
                    animationDelay: `${i * 0.15 + 0.05}s`,
                    boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                  }}
                />
              ))}
            </div>
          </div>
          {/* Top ornate rod */}
          <div className="absolute top-0 left-0 w-full" style={{ height: 28 }}>
            <div
              className="absolute left-0 w-full"
              style={{
                top: 0,
                height: 22,
                background: "linear-gradient(180deg, #5A4000 0%, #8B6914 15%, #FFD700 35%, #FFFACD 50%, #FFD700 65%, #8B6914 85%, #5A4000 100%)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
                borderBottom: "2px solid #3A2800",
              }}
            />
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${15 + i * 18}%`,
                  top: 6,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, #FFFACD, #FFD700, #8B6914)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
                }}
              />
            ))}
            <div
              className="absolute left-0 w-full"
              style={{
                top: 22,
                height: 14,
                background: "linear-gradient(180deg, #3A0000, #6B0000 40%, #8B0000)",
                borderTop: "1px solid #FFD700",
              }}
            />
          </div>
          {/* Decorative embroidered border stripe (left edge of right curtain) */}
          <div
            className="absolute top-[42px] left-0 h-[calc(100%-92px)]"
            style={{
              width: 16,
              background: `repeating-linear-gradient(180deg, 
                #FFD700 0px, #8B6914 4px, #FFD700 8px, transparent 8px, transparent 16px)`,
              opacity: 0.3,
            }}
          />
        </div>
      </div>

      {/* Dialog area - centered on screen */}
      {dialogReady && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 5,
            animation: "dialogFadeIn 0.4s ease-out",
          }}
        >
          {isBigText ? (
            /* Big GNARPY text */
            <div
              className="flex flex-col items-center gap-6"
              style={{ animation: "gnarpyShake 0.15s linear infinite" }}
            >
              <div
                className="text-[96px] tracking-[0.3em]"
                style={{
                  color: "#00FF00",
                  fontFamily: "'Courier New', monospace",
                  textShadow:
                    "0 0 20px #00FF00, 0 0 40px #00FF00, 0 0 80px #00AA00, 0 0 120px #008800, 2px 2px 0 #003300, -2px -2px 0 #003300",
                  animation: "dialogFadeIn 0.2s ease-out",
                }}
              >
                {displayedText}
              </div>
              {/* removed click hint - auto-advances */}
            </div>
          ) : (
            /* Normal dialog box */
            <div className="w-full max-w-[600px] px-6">
              <div
                className="p-6"
                style={{
                  border: "3px solid #FFFFFF",
                  background: "#000000",
                  minHeight: 100,
                }}
              >
                <div
                  className="text-[22px] leading-[1.6]"
                  style={{
                    color: "#FFFFFF",
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  * {displayedText}
                  {!textComplete && (
                    <span
                      style={{
                        opacity: 1,
                        animation: "textTypeIn 0.3s steps(1) infinite alternate",
                      }}
                    >
                      ▌
                    </span>
                  )}
                </div>
                {textComplete && (
                  <div
                    className="text-[11px] mt-4 text-right tracking-[0.2em]"
                    style={{ color: "#555" }}
                  >
                    ▼ CLICK / ENTER / Z
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}