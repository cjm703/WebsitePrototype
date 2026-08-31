import { buildSessionHeaders, sessionApiFetch } from "./api-client";
import type { BusinessMapAssetRef } from "./business-map-model";
import { supabaseFunctionBase } from "./supabase-env";

export const BUSINESS_MAP_ASSET_BUCKET = String(
  import.meta.env.VITE_SUPABASE_BUSINESS_MAP_BUCKET || "business-map-assets",
).trim() || "business-map-assets";

export const BUSINESS_MAP_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const MAX_BUSINESS_MAP_IMAGE_BYTES = 10 * 1024 * 1024;

function cleanStorageSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "image";
}

function assetPath(scopeId: string, purpose: "background" | "addition", fileName: string) {
  return `business-maps/${cleanStorageSegment(scopeId)}/${purpose}/${Date.now()}-${cleanStorageSegment(fileName)}`;
}

export function validateBusinessMapImage(file: File) {
  if (!BUSINESS_MAP_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  }
  if (file.size <= 0 || file.size > MAX_BUSINESS_MAP_IMAGE_BYTES) {
    throw new Error("Business map images must be between 1 byte and 10 MB.");
  }
}

export async function uploadBusinessMapImage(
  scopeId: string,
  purpose: "background" | "addition",
  file: File,
  onProgress?: (percent: number) => void,
): Promise<BusinessMapAssetRef> {
  validateBusinessMapImage(file);
  const path = assetPath(scopeId, purpose, file.name || "image");
  const form = new FormData();
  form.append("path", path);
  form.append("file", file, file.name || "image");

  return new Promise<BusinessMapAssetRef>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${supabaseFunctionBase}/business-map/assets/upload`);
    Object.entries(buildSessionHeaders(false)).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("Business map image upload failed due to a network error."));
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.responseText || "{}");
      } catch {
        body = {};
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(typeof body.error === "string" ? body.error : `Image upload failed (${request.status}).`));
        return;
      }
      const asset = body.asset as BusinessMapAssetRef | undefined;
      if (!asset?.publicUrl) {
        reject(new Error("Image upload did not return a public asset URL."));
        return;
      }
      onProgress?.(100);
      resolve(asset);
    };
    request.send(form);
  });
}

export async function deleteBusinessMapImage(asset: BusinessMapAssetRef | undefined) {
  if (!asset?.bucket || !asset.path) return;
  await sessionApiFetch("/business-map/assets/delete", {
    method: "POST",
    body: JSON.stringify({ bucket: asset.bucket, path: asset.path }),
  });
}

