import type { StoredImageAsset } from "@/app/components/types";

export const IMAGE_STORAGE_LOCAL_KEY = "inet-dm-image-storage";
export const IMAGE_STORAGE_UPDATED_EVENT = "inet-image-storage-updated";

function slugifyBaseName(name: string) {
  const trimmed = name.trim().replace(/\.[^.]+$/, "");
  const normalized = trimmed || "image";
  return normalized.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "image";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = src;
  });
}

export async function createStoredImageAssetFromFile(
  file: File,
  sourceContext = "manual-upload",
): Promise<StoredImageAsset> {
  const src = await readFileAsDataUrl(file);
  const { width, height } = await readImageDimensions(src);
  const now = new Date().toISOString();
  const base = slugifyBaseName(file.name);
  return {
    id: `img-${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.replace(/\.[^.]+$/, "") || "Untitled Image",
    src,
    alt: file.name.replace(/\.[^.]+$/, "") || "",
    createdAt: now,
    updatedAt: now,
    contentType: file.type || "image/*",
    sizeBytes: file.size,
    width,
    height,
    sourceContext,
    tags: [],
  };
}

export async function createStoredImageAssetsFromFiles(
  files: File[],
  sourceContext = "manual-upload",
): Promise<StoredImageAsset[]> {
  const readableFiles = files.filter((file) => file.type.startsWith("image/"));
  return Promise.all(readableFiles.map((file) => createStoredImageAssetFromFile(file, sourceContext)));
}

export function mergeStoredImageAssets(
  current: StoredImageAsset[],
  incoming: StoredImageAsset[],
) {
  const map = new Map<string, StoredImageAsset>();
  [...incoming, ...current].forEach((asset) => {
    map.set(asset.id, asset);
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    return bTime - aTime;
  });
}

export function formatStoredImageBytes(value?: number) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
