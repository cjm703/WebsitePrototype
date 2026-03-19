import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  List, Table, ImageIcon, Palette, ChevronDown,
} from "lucide-react";

// ========================
// Types
// ========================
interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

// ========================
// Constants
// ========================
const FONTS = [
  { label: "Default", value: "" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
  { label: "Impact", value: "Impact, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
];

const FONT_SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32];

const COLORS = [
  "#FFFFFF", "#C0C0C0", "#808080", "#000000",
  "#FF0000", "#FF6600", "#FFFF00", "#00FF00",
  "#00FFFF", "#0000FF", "#8B00FF", "#FF00FF",
  "#FFD700", "#FF69B4", "#00FF7F", "#4A9AFF",
  "#C0D0F0", "#9AAABB", "#FF4444", "#44FF44",
];

// ========================
// Toolbar Button
// ========================
function ToolBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // prevent stealing focus from contentEditable
        onClick(e);
      }}
      title={title}
      className="cursor-pointer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: 3,
        border: active ? "1px solid #4A7BFF" : "1px solid #2A2A5A",
        background: active ? "#1A2A5A" : "transparent",
        color: active ? "#7ABAFF" : "#8A9ABB",
        transition: "all 0.1s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ========================
// Dropdown wrapper
// ========================
function ToolDropdown({
  label,
  open,
  onToggle,
  children,
  width = 130,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onToggle]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="cursor-pointer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          height: 26,
          padding: "0 6px",
          borderRadius: 3,
          border: "1px solid #2A2A5A",
          background: "transparent",
          color: "#8A9ABB",
          fontSize: 10,
          fontFamily: "'Courier New', monospace",
          whiteSpace: "nowrap" as const,
          maxWidth: width,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <ChevronDown size={10} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 100,
            background: "#12122E",
            border: "1px solid #3A3A6A",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            maxHeight: 200,
            overflowY: "auto",
            minWidth: width,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ========================
// Main Component
// ========================
export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const sizeDropRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const highlightOverlaysRef = useRef<HTMLDivElement[]>([]);
  const isInternalChange = useRef(false);
  const [fontDropOpen, setFontDropOpen] = useState(false);
  const [sizeDropOpen, setSizeDropOpen] = useState(false);
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [tablePopupOpen, setTablePopupOpen] = useState(false);
  const [tableRows, setTableRows] = useState("3");
  const [tableCols, setTableCols] = useState("3");
  const [imagePopupOpen, setImagePopupOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  // Close size dropdown on outside click
  useEffect(() => {
    if (!sizeDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (sizeDropRef.current && !sizeDropRef.current.contains(e.target as Node)) {
        setSizeDropOpen(false);
        clearSelectionHighlight();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sizeDropOpen]);

  // Sync external value -> editor content (only when not editing)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  // Save selection, run command, emit change
  const execCmd = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    emitChange();
  }, []);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    isInternalChange.current = true;
    onChange(el.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    emitChange();
  }, [emitChange]);

  // Insert HTML at cursor
  const insertHtml = useCallback((html: string) => {
    document.execCommand("insertHTML", false, html);
    emitChange();
  }, [emitChange]);

  // ── Toolbar actions ──
  const handleBold = () => execCmd("bold");
  const handleItalic = () => execCmd("italic");
  const handleAlignLeft = () => execCmd("justifyLeft");
  const handleAlignCenter = () => execCmd("justifyCenter");
  const handleAlignRight = () => execCmd("justifyRight");
  const handleBulletList = () => execCmd("insertUnorderedList");

  const handleFontChange = (fontVal: string) => {
    if (fontVal) {
      execCmd("fontName", fontVal);
    } else {
      execCmd("removeFormat");
    }
    setFontDropOpen(false);
  };

  // Save the current selection/range so it can be restored later (e.g. after
  // the custom size input steals focus from the contentEditable).
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedSelectionRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  // Show / clear translucent highlight overlays so the user can see their
  // selection even after focus moves to the custom-size input.
  const showSelectionHighlight = () => {
    clearSelectionHighlight();
    const range = savedSelectionRef.current;
    const editor = editorRef.current;
    if (!range || !editor || range.collapsed) return;
    const editorRect = editor.getBoundingClientRect();
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const overlay = document.createElement("div");
      overlay.style.cssText = [
        "position:absolute",
        "pointer-events:none",
        `top:${r.top - editorRect.top + editor.scrollTop}px`,
        `left:${r.left - editorRect.left + editor.scrollLeft}px`,
        `width:${r.width}px`,
        `height:${r.height}px`,
        "background:rgba(74,123,255,0.25)",
        "border-radius:1px",
        "z-index:1",
      ].join(";");
      editor.appendChild(overlay);
      highlightOverlaysRef.current.push(overlay);
    }
  };

  const clearSelectionHighlight = () => {
    highlightOverlaysRef.current.forEach((el) => el.remove());
    highlightOverlaysRef.current = [];
  };

  // Apply an arbitrary pixel font size by using execCommand("fontSize") with a
  // sentinel value, then immediately replacing the generated <font size="7">
  // element with a <span style="font-size: Xpx">.
  const applyFontSize = (pxSize: number) => {
    if (pxSize < 1 || pxSize > 999) return;
    clearSelectionHighlight();
    // Restore the editor selection that may have been lost to the custom input
    restoreSelection();
    const sentinel = "7";
    document.execCommand("fontSize", false, sentinel);
    const el = editorRef.current;
    if (el) {
      const fonts = el.querySelectorAll('font[size="7"]');
      fonts.forEach((fontEl) => {
        const span = document.createElement("span");
        span.style.fontSize = `${pxSize}px`;
        span.innerHTML = fontEl.innerHTML;
        fontEl.parentNode?.replaceChild(span, fontEl);
      });
    }
    emitChange();
    setSizeDropOpen(false);
    setCustomSizeInput("");
  };

  const handleColorChange = (color: string) => {
    execCmd("foreColor", color);
    setColorPickerOpen(false);
  };

  const handleInsertTable = () => {
    const r = parseInt(tableRows) || 3;
    const c = parseInt(tableCols) || 3;
    let html = `<table style="border-collapse:collapse;width:100%;margin:6px 0;">`;
    for (let ri = 0; ri < r; ri++) {
      html += "<tr>";
      for (let ci = 0; ci < c; ci++) {
        html += `<td style="border:1px solid #3A3A6A;padding:4px 8px;min-width:40px;font-size:12px;">&nbsp;</td>`;
      }
      html += "</tr>";
    }
    html += "</table><p>&nbsp;</p>";
    insertHtml(html);
    setTablePopupOpen(false);
  };

  const handleInsertImage = () => {
    if (!imageUrl.trim()) return;
    const html = `<img src="${imageUrl.trim()}" style="max-width:100%;height:auto;margin:6px 0;border-radius:3px;" />`;
    insertHtml(html);
    setImageUrl("");
    setImagePopupOpen(false);
  };

  // Close other popups when one opens
  const closeAllPopups = () => {
    setFontDropOpen(false);
    setSizeDropOpen(false);
    setColorPickerOpen(false);
    setTablePopupOpen(false);
    setImagePopupOpen(false);
    clearSelectionHighlight();
  };

  const togglePopup = (setter: React.Dispatch<React.SetStateAction<boolean>>, current: boolean) => {
    closeAllPopups();
    if (!current) setter(true);
  };

  const dropdownItemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "4px 10px",
    textAlign: "left" as const,
    background: "transparent",
    border: "none",
    color: "#C0D0F0",
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
    cursor: "pointer",
  };

  const smallInputStyle: React.CSSProperties = {
    padding: "2px 4px",
    background: "#0A0A28",
    border: "1px solid #2A2A5A",
    borderRadius: 2,
    color: "#C0D0F0",
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
    outline: "none",
  };

  return (
    <div
      style={{
        border: "1px solid #2A2A5A",
        borderRadius: 4,
        overflow: "hidden",
        background: "#0A0A28",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          padding: "5px 6px",
          background: "linear-gradient(180deg, #16163A 0%, #0E0E28 100%)",
          borderBottom: "1px solid #2A2A5A",
          alignItems: "center",
        }}
      >
        {/* Font Family */}
        <ToolDropdown
          label="Font"
          open={fontDropOpen}
          onToggle={() => togglePopup(setFontDropOpen, fontDropOpen)}
          width={120}
        >
          {FONTS.map((f) => (
            <button
              key={f.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleFontChange(f.value);
              }}
              style={{ ...dropdownItemStyle, fontFamily: f.value || "inherit" }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#1A2A5A"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              {f.label}
            </button>
          ))}
        </ToolDropdown>

        {/* Font Size — custom dropdown with scrolling list + number input */}
        <div ref={sizeDropRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              togglePopup(setSizeDropOpen, sizeDropOpen);
              // Show highlight overlays after a microtask so the selection is saved first
              if (!sizeDropOpen) {
                requestAnimationFrame(() => showSelectionHighlight());
              } else {
                clearSelectionHighlight();
              }
            }}
            className="cursor-pointer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              height: 26,
              padding: "0 6px",
              borderRadius: 3,
              border: "1px solid #2A2A5A",
              background: "transparent",
              color: "#8A9ABB",
              fontSize: 10,
              fontFamily: "'Courier New', monospace",
              whiteSpace: "nowrap" as const,
            }}
          >
            <span>Size</span>
            <ChevronDown size={10} style={{ flexShrink: 0 }} />
          </button>
          {sizeDropOpen && (
            <div
              onMouseDown={(e) => {
                // Only preventDefault if NOT clicking inside an input (so the input stays focusable)
                if ((e.target as HTMLElement).tagName !== "INPUT") {
                  e.preventDefault();
                }
              }}
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 100,
                background: "#12122E",
                border: "1px solid #3A3A6A",
                borderRadius: 4,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                width: 90,
                overflow: "hidden",
              }}
            >
              {/* Custom size input pinned at top */}
              <div style={{ padding: "4px 6px 3px", borderBottom: "1px solid #2A2A5A", display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={customSizeInput}
                  onChange={(e) => setCustomSizeInput(e.target.value)}
                  placeholder="Custom"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const size = parseInt(customSizeInput);
                      if (!isNaN(size) && size > 0) applyFontSize(size);
                    }
                  }}
                  style={{
                    ...smallInputStyle,
                    flex: 1,
                    width: 0,
                    height: 20,
                    fontSize: 10,
                  }}
                />
                <span style={{ fontSize: 9, color: "#5A6A8A", fontFamily: "'Courier New', monospace", flexShrink: 0 }}>px</span>
              </div>
              {/* Scrolling preset size list */}
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {FONT_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyFontSize(s);
                    }}
                    style={dropdownItemStyle}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#1A2A5A"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
                  >
                    {s}px
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: "#2A2A5A", margin: "0 2px" }} />

        {/* Bold */}
        <ToolBtn onClick={handleBold} title="Bold">
          <Bold size={13} />
        </ToolBtn>

        {/* Italic */}
        <ToolBtn onClick={handleItalic} title="Italic">
          <Italic size={13} />
        </ToolBtn>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: "#2A2A5A", margin: "0 2px" }} />

        {/* Alignment */}
        <ToolBtn onClick={handleAlignLeft} title="Align Left">
          <AlignLeft size={13} />
        </ToolBtn>
        <ToolBtn onClick={handleAlignCenter} title="Align Center">
          <AlignCenter size={13} />
        </ToolBtn>
        <ToolBtn onClick={handleAlignRight} title="Align Right">
          <AlignRight size={13} />
        </ToolBtn>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: "#2A2A5A", margin: "0 2px" }} />

        {/* Text Color */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <ToolBtn
            onClick={() => togglePopup(setColorPickerOpen, colorPickerOpen)}
            title="Text Color"
          >
            <Palette size={13} />
          </ToolBtn>
          {colorPickerOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 100,
                background: "#12122E",
                border: "1px solid #3A3A6A",
                borderRadius: 4,
                padding: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 3,
                width: 120,
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleColorChange(c);
                  }}
                  className="cursor-pointer"
                  title={c}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 3,
                    background: c,
                    border: "1px solid #3A3A6A",
                    cursor: "pointer",
                  }}
                />
              ))}
              {/* Custom color input */}
              <div style={{ gridColumn: "1 / -1", marginTop: 3 }}>
                <input
                  type="color"
                  onChange={(e) => handleColorChange(e.target.value)}
                  style={{
                    width: "100%",
                    height: 22,
                    border: "1px solid #3A3A6A",
                    borderRadius: 3,
                    background: "#0A0A28",
                    cursor: "pointer",
                  }}
                  title="Custom color"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bullet List */}
        <ToolBtn onClick={handleBulletList} title="Bullet List">
          <List size={13} />
        </ToolBtn>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: "#2A2A5A", margin: "0 2px" }} />

        {/* Insert Table */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <ToolBtn
            onClick={() => togglePopup(setTablePopupOpen, tablePopupOpen)}
            title="Insert Table"
          >
            <Table size={13} />
          </ToolBtn>
          {tablePopupOpen && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                zIndex: 100,
                background: "#12122E",
                border: "1px solid #3A3A6A",
                borderRadius: 4,
                padding: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                width: 150,
              }}
            >
              <div style={{ fontSize: 10, color: "#8A9ABB", fontFamily: "'Courier New', monospace", marginBottom: 6 }}>
                Insert Table
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: 9, color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}>Rows</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={tableRows}
                    onChange={(e) => setTableRows(e.target.value)}
                    style={{ ...smallInputStyle, width: "100%" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "#5A6A8A", fontFamily: "'Courier New', monospace" }}>Cols</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={tableCols}
                    onChange={(e) => setTableCols(e.target.value)}
                    style={{ ...smallInputStyle, width: "100%" }}
                  />
                </div>
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInsertTable();
                }}
                className="cursor-pointer"
                style={{
                  width: "100%",
                  padding: "3px 0",
                  background: "#1A2A5A",
                  border: "1px solid #3A4A8A",
                  borderRadius: 3,
                  color: "#7ABAFF",
                  fontSize: 10,
                  fontFamily: "'Courier New', monospace",
                  cursor: "pointer",
                }}
              >
                Insert
              </button>
            </div>
          )}
        </div>

        {/* Insert Image */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <ToolBtn
            onClick={() => togglePopup(setImagePopupOpen, imagePopupOpen)}
            title="Insert Image from URL"
          >
            <ImageIcon size={13} />
          </ToolBtn>
          {imagePopupOpen && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 100,
                background: "#12122E",
                border: "1px solid #3A3A6A",
                borderRadius: 4,
                padding: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                width: 240,
              }}
            >
              <div style={{ fontSize: 10, color: "#8A9ABB", fontFamily: "'Courier New', monospace", marginBottom: 6 }}>
                Insert Image
              </div>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Paste image URL..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleInsertImage(); } }}
                style={{
                  ...smallInputStyle,
                  width: "100%",
                  padding: "4px 6px",
                  marginBottom: 6,
                }}
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInsertImage();
                }}
                className="cursor-pointer"
                style={{
                  width: "100%",
                  padding: "3px 0",
                  background: "#1A2A5A",
                  border: "1px solid #3A4A8A",
                  borderRadius: 3,
                  color: "#7ABAFF",
                  fontSize: 10,
                  fontFamily: "'Courier New', monospace",
                  cursor: "pointer",
                }}
              >
                Insert
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Editable Area ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={emitChange}
        data-placeholder={placeholder}
        style={{
          position: "relative",
          minHeight,
          padding: "8px 12px",
          color: "#C0D0F0",
          fontSize: 13,
          fontFamily: "'Tahoma', 'Verdana', sans-serif",
          lineHeight: 1.6,
          outline: "none",
          overflowY: "auto",
          maxHeight: 400,
          wordWrap: "break-word" as const,
          overflowWrap: "break-word" as const,
        }}
        className="rich-text-editable"
      />

      {/* Placeholder + table styling */}
      <style>{`
        .rich-text-editable:empty::before {
          content: attr(data-placeholder);
          color: #3A4A6A;
          font-style: italic;
          pointer-events: none;
        }
        .rich-text-editable table {
          border-collapse: collapse;
          width: 100%;
          margin: 6px 0;
        }
        .rich-text-editable td {
          border: 1px solid #3A3A6A;
          padding: 4px 8px;
          min-width: 40px;
          font-size: 12px;
        }
        .rich-text-editable img {
          max-width: 100%;
          height: auto;
          border-radius: 3px;
          margin: 6px 0;
        }
        .rich-text-editable ul {
          padding-left: 20px;
          margin: 4px 0;
        }
        .rich-text-editable li {
          margin: 2px 0;
        }
      `}</style>
    </div>
  );
}