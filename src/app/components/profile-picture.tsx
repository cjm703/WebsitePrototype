// ========================
// Profile Picture Utilities
// ========================
// Shared utilities for uploading, fetching, and caching profile pictures.
// v4 — cache-bust for proxy re-compile

import { projectId, publicAnonKey } from "/utils/supabase/info";

const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-8a5950b5`;
const AUTH_HEADER = { Authorization: `Bearer ${publicAnonKey}` };

// -- Client-side image resizing --
// Resizes an image file to fit within maxSize×maxSize, returns a JPEG data URL.
export function resizeImage(file: File, maxSize = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        // Scale down to fit within maxSize
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h / w) * maxSize);
            w = maxSize;
          } else {
            w = Math.round((w / h) * maxSize);
            h = maxSize;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// -- Upload profile picture --
export async function uploadProfilePicture(userId: string, imageData: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${SERVER}/profile-picture/upload`, {
      method: "POST",
      headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, imageData }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Profile picture upload error:", data);
      return { success: false, error: data.error || "Upload failed" };
    }
    // Update cache
    pfpCache[userId] = imageData;
    return { success: true };
  } catch (err) {
    console.error("Profile picture upload network error:", err);
    return { success: false, error: `Network error: ${err}` };
  }
}

// -- Delete (reset) profile picture --
export async function deleteProfilePicture(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${SERVER}/profile-picture/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: AUTH_HEADER,
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Profile picture delete error:", data);
      return { success: false, error: data.error || "Delete failed" };
    }
    pfpCache[userId] = null;
    return { success: true };
  } catch (err) {
    console.error("Profile picture delete network error:", err);
    return { success: false, error: `Network error: ${err}` };
  }
}

// -- Fetch single profile picture --
export async function fetchProfilePicture(userId: string): Promise<string | null> {
  // Check cache first
  if (userId in pfpCache) return pfpCache[userId];
  try {
    const resp = await fetch(`${SERVER}/profile-picture/${encodeURIComponent(userId)}`, {
      headers: AUTH_HEADER,
    });
    const data = await resp.json();
    const img = data.imageData || null;
    pfpCache[userId] = img;
    return img;
  } catch (err) {
    console.error("Profile picture fetch error:", err);
    return null;
  }
}

// -- Batch fetch profile pictures --
export async function fetchProfilePictures(userIds: string[]): Promise<Record<string, string | null>> {
  if (userIds.length === 0) return {};
  // Filter out already-cached
  const uncached = userIds.filter(id => !(id in pfpCache));
  if (uncached.length > 0) {
    try {
      const resp = await fetch(`${SERVER}/profile-picture/batch`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: uncached }),
      });
      const data = await resp.json();
      if (data.pictures) {
        for (const [id, img] of Object.entries(data.pictures)) {
          pfpCache[id] = img as string | null;
        }
      }
    } catch (err) {
      console.error("Batch profile picture fetch error:", err);
    }
  }
  const result: Record<string, string | null> = {};
  for (const id of userIds) {
    result[id] = pfpCache[id] ?? null;
  }
  return result;
}

// -- In-memory cache --
const pfpCache: Record<string, string | null> = {};

// Invalidate cache for a user (e.g., after upload)
export function invalidatePfpCache(userId: string) {
  delete pfpCache[userId];
}

// Clear entire cache
export function clearPfpCache() {
  for (const k of Object.keys(pfpCache)) delete pfpCache[k];
}