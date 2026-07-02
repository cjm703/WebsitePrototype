import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Search, Upload, X } from "lucide-react";
import { retro } from "./retro-styles";
import type { StoredImageAsset } from "./types";
import { formatStoredImageBytes } from "@/lib/image-storage";

interface ImageStoragePickerModalProps {
  open: boolean;
  images: StoredImageAsset[];
  title?: string;
  fallbackMode?: boolean;
  onClose: () => void;
  onSelect: (image: StoredImageAsset) => void;
  onUploadFiles?: (files: File[]) => Promise<void> | void;
}

export function ImageStoragePickerModal({
  open,
  images,
  title = "Image Storage",
  fallbackMode = false,
  onClose,
  onSelect,
  onUploadFiles,
}: ImageStoragePickerModalProps) {
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const visibleImages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return images;
    return images.filter((image) =>
      [image.name, image.alt, image.sourceContext, ...(image.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [images, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[1120px] max-h-[88vh] overflow-hidden rounded-[10px] border" style={{ borderColor: "#294A74", background: "#081129", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderBottomColor: "#17355D", background: "linear-gradient(180deg, #102040 0%, #0A1630 100%)" }}>
          <div className="flex items-center gap-3">
            <ImageIcon size={16} style={{ color: "#8AB4FF" }} />
            <div>
              <div className="text-[14px] font-bold" style={{ color: "#D3E1FF" }}>{title}</div>
              <div className="text-[11px]" style={{ color: "#7A9ABB" }}>
                Choose from stored DM images or upload new ones.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="hover:opacity-80">
            <X size={16} style={{ color: "#7A9ABB" }} />
          </button>
        </div>

        <div className="border-b px-5 py-3" style={{ borderBottomColor: "#17355D", background: "#09142D" }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6B7EA7" }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, alt text, tag, or source..."
                className={`${retro.sunken} w-full bg-[#0A0A28] py-2 pl-9 pr-3 text-[12px] outline-none`}
                style={{ color: "#D3E1FF" }}
              />
            </div>
            {onUploadFiles && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || []);
                    if (!files.length) return;
                    await onUploadFiles(files);
                    event.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`${retro.button} px-4 py-2 text-[11px] flex items-center gap-2`}
                  style={{ color: "#FFFFFF", background: "#0C4F2B", borderColor: "#4AFF8A" }}
                >
                  <Upload size={12} /> Upload Images
                </button>
              </>
            )}
            <div className="text-[10px]" style={{ color: "#7A9ABB" }}>
              {visibleImages.length} shown / {images.length} stored
            </div>
          </div>
          {fallbackMode && (
            <div
              className="mt-3 rounded-[6px] border px-3 py-2 text-[10px]"
              style={{
                borderColor: "#6A5520",
                background: "rgba(82, 52, 8, 0.28)",
                color: "#FFD37A",
              }}
            >
              Shared image storage is using local fallback mode. Uploads and edits still save locally until the Supabase function route and publishable key are working again.
            </div>
          )}
        </div>

        <div className="max-h-[calc(88vh-150px)] overflow-y-auto px-5 py-4">
          {visibleImages.length === 0 ? (
            <div className="rounded-[8px] border border-dashed px-6 py-10 text-center" style={{ borderColor: "#26466F", color: "#7A9ABB", background: "rgba(10, 18, 38, 0.55)" }}>
              No stored images match this search yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleImages.map((image) => (
                <button
                  key={image.id}
                  onClick={() => onSelect(image)}
                  className="overflow-hidden rounded-[8px] border text-left transition hover:translate-y-[-1px] hover:opacity-95"
                  style={{ borderColor: "#26466F", background: "#0B1631" }}
                >
                  <div className="aspect-[16/10] overflow-hidden border-b" style={{ borderBottomColor: "#17355D", background: "#050B18" }}>
                    <img src={image.src} alt={image.alt || image.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-1 px-3 py-3">
                    <div className="truncate text-[12px] font-bold" style={{ color: "#D3E1FF" }}>{image.name}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: "#7A9ABB" }}>
                      <span>{image.width || 0} x {image.height || 0}</span>
                      <span>{formatStoredImageBytes(image.sizeBytes)}</span>
                      {image.sourceContext && <span>{image.sourceContext}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
