import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ImageIcon, Search, Trash2, Upload } from "lucide-react";
import { retro } from "./retro-styles";
import type { StoredImageAsset } from "./types";
import { safeGetJson, safeSetJson } from "./safe-storage";
import {
  clearDMImageStorageFallbackState,
  getDMImageStorageFallbackState,
  loadDMImageStorage,
  saveDMImageStorage,
} from "@/lib/player-state-api";
import {
  IMAGE_STORAGE_LOCAL_KEY,
  IMAGE_STORAGE_UPDATED_EVENT,
  createStoredImageAssetsFromFiles,
  formatStoredImageBytes,
  mergeStoredImageAssets,
} from "@/lib/image-storage";

function sortStoredImages(images: StoredImageAsset[]) {
  return [...images].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    return bTime - aTime;
  });
}

export function DMImageStorageSection() {
  const [images, setImages] = useState<StoredImageAsset[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [altDraft, setAltDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const remote = await loadDMImageStorage<StoredImageAsset>();
        if (cancelled) return;
        const next = sortStoredImages(remote);
        setImages(next);
        safeSetJson(IMAGE_STORAGE_LOCAL_KEY, next);
        setUsingLocalFallback(!!getDMImageStorageFallbackState());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load stored images");
        setImages(sortStoredImages(safeGetJson<StoredImageAsset[]>(IMAGE_STORAGE_LOCAL_KEY, [])));
        setUsingLocalFallback(!!getDMImageStorageFallbackState());
      }
    }

    void hydrate();

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ images?: StoredImageAsset[] }>).detail;
      if (!detail?.images) return;
      setImages(sortStoredImages(detail.images));
      setUsingLocalFallback(!!getDMImageStorageFallbackState());
    };
    window.addEventListener(IMAGE_STORAGE_UPDATED_EVENT, handleUpdate as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_STORAGE_UPDATED_EVENT, handleUpdate as EventListener);
    };
  }, []);

  const visibleImages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return images;
    return images.filter((image) =>
      [image.name, image.alt, image.sourceContext, ...(image.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [images, query]);

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) || visibleImages[0] || null,
    [images, selectedImageId, visibleImages],
  );

  useEffect(() => {
    if (!selectedImage) {
      setNameDraft("");
      setAltDraft("");
      return;
    }
    setSelectedImageId(selectedImage.id);
    setNameDraft(selectedImage.name || "");
    setAltDraft(selectedImage.alt || "");
  }, [selectedImage?.id]);

  async function persist(nextImages: StoredImageAsset[], successMessage: string) {
    setIsSaving(true);
    setError("");
    try {
      await saveDMImageStorage(nextImages as unknown as Record<string, unknown>[]);
      const sorted = sortStoredImages(nextImages);
      setImages(sorted);
      safeSetJson(IMAGE_STORAGE_LOCAL_KEY, sorted);
      window.dispatchEvent(new CustomEvent(IMAGE_STORAGE_UPDATED_EVENT, { detail: { images: sorted } }));
      setStatus(successMessage);
      setUsingLocalFallback(!!getDMImageStorageFallbackState());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save image storage");
      setUsingLocalFallback(!!getDMImageStorageFallbackState());
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRetrySharedStorage() {
    setIsSaving(true);
    setError("");
    setStatus("");
    clearDMImageStorageFallbackState();

    try {
      const remoteImages = await loadDMImageStorage<StoredImageAsset>({ forceRemote: true });
      const merged = sortStoredImages(mergeStoredImageAssets(images, remoteImages));
      await saveDMImageStorage(merged as unknown as Record<string, unknown>[], { forceRemote: true });
      setImages(merged);
      safeSetJson(IMAGE_STORAGE_LOCAL_KEY, merged);
      window.dispatchEvent(new CustomEvent(IMAGE_STORAGE_UPDATED_EVENT, { detail: { images: merged } }));
      setUsingLocalFallback(false);
      setStatus("Shared image storage reconnected and synced.");
    } catch (err) {
      setUsingLocalFallback(!!getDMImageStorageFallbackState());
      setError(
        `Shared image storage is still unavailable: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!files.length) return;
    setStatus("");
    const created = await createStoredImageAssetsFromFiles(files, "dm-image-storage");
    if (!created.length) return;
    const next = mergeStoredImageAssets(images, created);
    setSelectedImageId(created[0]?.id || null);
    await persist(next, `${created.length} image${created.length === 1 ? "" : "s"} stored.`);
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      setError(`Failed to copy ${label.toLowerCase()}.`);
    }
  }

  async function handleSaveMetadata() {
    if (!selectedImage) return;
    const next = images.map((image) => (
      image.id === selectedImage.id
        ? { ...image, name: nameDraft.trim() || image.name, alt: altDraft.trim(), updatedAt: new Date().toISOString() }
        : image
    ));
    await persist(next, "Image details updated.");
  }

  async function handleDeleteSelected() {
    if (!selectedImage) return;
    const next = images.filter((image) => image.id !== selectedImage.id);
    setSelectedImageId(next[0]?.id || null);
    await persist(next, "Image removed from storage.");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ImageIcon size={18} style={{ color: "#8AB4FF" }} />
            <h2 className="text-[18px] font-bold" style={{ color: "#D3E1FF" }}>Image Storage</h2>
          </div>
          <p className="mt-2 max-w-[840px] text-[11px]" style={{ color: "#7A9ABB" }}>
            Upload and manage a shared DM image library for wiki articles and other editor surfaces. Stored images can be reused without hunting for external URLs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              await handleUploadFiles(files);
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
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border px-4 py-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Shared Library</div>
          <div className="mt-2 text-[18px] font-bold" style={{ color: "#D3E1FF" }}>{images.length}</div>
          <div className="mt-1 text-[10px]" style={{ color: "#7A9ABB" }}>Images available to the wiki and other editor surfaces.</div>
        </div>
        <div className="rounded-[8px] border px-4 py-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Search Results</div>
          <div className="mt-2 text-[18px] font-bold" style={{ color: "#D3E1FF" }}>{visibleImages.length}</div>
          <div className="mt-1 text-[10px]" style={{ color: "#7A9ABB" }}>Filtered by name, alt text, source, or tag.</div>
        </div>
        <div className="rounded-[8px] border px-4 py-3" style={{ borderColor: "#1A345B", background: "#09142D" }}>
          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#7A9ABB", fontWeight: 700 }}>Current Focus</div>
          <div className="mt-2 truncate text-[13px] font-bold" style={{ color: "#D3E1FF" }}>{selectedImage?.name || "No image selected"}</div>
          <div className="mt-1 text-[10px]" style={{ color: "#7A9ABB" }}>Use the details panel to rename, copy, or remove a stored image.</div>
        </div>
      </div>

      {(error || status) && (
        <div
          className="rounded-[6px] border px-3 py-2 text-[11px]"
          style={{
            borderColor: error ? "#6A2A2A" : "#1E5C36",
            background: error ? "rgba(80, 18, 18, 0.35)" : "rgba(12, 79, 43, 0.20)",
            color: error ? "#FFAAAA" : "#9AE6B4",
          }}
        >
          {error || status}
        </div>
      )}

      {usingLocalFallback && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-[11px]"
          style={{
            borderColor: "#6A5520",
            background: "rgba(82, 52, 8, 0.28)",
            color: "#FFD37A",
          }}
        >
          <span>
            Shared image storage is using local fallback mode. Uploads and edits still save locally until the Supabase function route and publishable key are working again.
          </span>
          <button
            type="button"
            onClick={() => void handleRetrySharedStorage()}
            disabled={isSaving}
            className={`${retro.button} px-3 py-1 text-[10px]`}
            style={{ color: "#FFF3C4", background: "#3A2B0A", borderColor: "#8A6A24" }}
          >
            Retry Shared Storage
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,1.15fr)_minmax(280px,0.85fr)]">
        <div className="rounded-[8px] border p-4" style={{ borderColor: "#1A345B", background: "#09142D" }}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[250px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6B7EA7" }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, alt text, tag, or source..."
                className={`${retro.sunken} w-full bg-[#0A0A28] py-2 pl-9 pr-3 text-[12px] outline-none`}
                style={{ color: "#D3E1FF" }}
              />
            </div>
            <div className="text-[10px]" style={{ color: "#7A9ABB" }}>
              {visibleImages.length} shown / {images.length} total
            </div>
          </div>

          {visibleImages.length === 0 ? (
            <div className="rounded-[8px] border border-dashed px-6 py-10 text-center text-[11px]" style={{ borderColor: "#26466F", color: "#7A9ABB", background: "rgba(10, 18, 38, 0.55)" }}>
              No stored images yet. Upload a few to start building the shared library.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visibleImages.map((image) => {
                const active = selectedImage?.id === image.id;
                return (
                  <button
                    key={image.id}
                    onClick={() => setSelectedImageId(image.id)}
                    className="overflow-hidden rounded-[8px] border text-left transition hover:translate-y-[-1px] hover:opacity-95"
                    style={{
                      borderColor: active ? "#4A7BFF" : "#26466F",
                      background: active ? "#10203D" : "#0B1631",
                      boxShadow: active ? "0 0 0 1px rgba(74,123,255,0.35)" : "none",
                    }}
                  >
                    <div className="aspect-[16/10] overflow-hidden border-b" style={{ borderBottomColor: "#17355D", background: "#050B18" }}>
                      <img src={image.src} alt={image.alt || image.name} className="h-full w-full object-cover" />
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <div className="truncate text-[12px] font-bold" style={{ color: "#D3E1FF" }}>{image.name}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: "#7A9ABB" }}>
                        <span>{image.width || 0} x {image.height || 0}</span>
                        <span>{formatStoredImageBytes(image.sizeBytes)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[8px] border p-4 xl:sticky xl:top-4 xl:self-start" style={{ borderColor: "#1A345B", background: "#09142D" }}>
          {selectedImage ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[8px] border" style={{ borderColor: "#26466F", background: "#050B18" }}>
                <img src={selectedImage.src} alt={selectedImage.alt || selectedImage.name} className="max-h-[320px] w-full object-contain" />
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-[10px]" style={{ color: "#7A9ABB" }}>Image Name</label>
                  <input
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    className={`${retro.sunken} w-full bg-[#0A0A28] px-3 py-2 text-[12px] outline-none`}
                    style={{ color: "#D3E1FF" }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px]" style={{ color: "#7A9ABB" }}>Alt Text</label>
                  <input
                    value={altDraft}
                    onChange={(event) => setAltDraft(event.target.value)}
                    className={`${retro.sunken} w-full bg-[#0A0A28] px-3 py-2 text-[12px] outline-none`}
                    style={{ color: "#D3E1FF" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px]" style={{ color: "#7A9ABB" }}>
                  <div>
                    <div className="uppercase tracking-[0.16em]">Dimensions</div>
                    <div className="mt-1 text-[11px]" style={{ color: "#D3E1FF" }}>{selectedImage.width || 0} x {selectedImage.height || 0}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-[0.16em]">File Size</div>
                    <div className="mt-1 text-[11px]" style={{ color: "#D3E1FF" }}>{formatStoredImageBytes(selectedImage.sizeBytes)}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-[0.16em]">Stored</div>
                    <div className="mt-1 text-[11px]" style={{ color: "#D3E1FF" }}>{selectedImage.createdAt ? new Date(selectedImage.createdAt).toLocaleString() : "Unknown"}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-[0.16em]">Source</div>
                    <div className="mt-1 text-[11px]" style={{ color: "#D3E1FF" }}>{selectedImage.sourceContext || "manual-upload"}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void handleSaveMetadata()}
                  disabled={isSaving}
                  className={`${retro.button} px-3 py-2 text-[11px]`}
                  style={{ color: "#FFFFFF", background: "#17456A", borderColor: "#6AB6FF" }}
                >
                  Save Details
                </button>
                <button
                  onClick={() => void handleCopy(selectedImage.src, "Image source")}
                  className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`}
                  style={{ color: "#D3E1FF", background: "#10203D", borderColor: "#3A5D8C" }}
                >
                  <Copy size={11} /> Copy Source
                </button>
                <button
                  onClick={() => void handleDeleteSelected()}
                  disabled={isSaving}
                  className={`${retro.button} px-3 py-2 text-[11px] flex items-center gap-2`}
                  style={{ color: "#FFB4B4", background: "#3A1010", borderColor: "#7A2A2A" }}
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed px-6 py-10 text-center text-[11px]" style={{ borderColor: "#26466F", color: "#7A9ABB", background: "rgba(10, 18, 38, 0.55)" }}>
              Select an image from the library to inspect or edit it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
