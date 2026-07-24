import { buildSupabasePublicHeaders, supabaseFunctionBase } from "@/lib/supabase-env";
import { buildSessionHeaders } from "@/lib/api-client";

const SERVER = supabaseFunctionBase;
const AUTH_HEADER = buildSupabasePublicHeaders(false);

export function resizeImage(file: File, maxSize = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;

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

export async function uploadProfilePicture(
  userId: string,
  imageData: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${SERVER}/profile-picture/upload`, {
      method: "POST",
      headers: buildSessionHeaders(true),
      body: JSON.stringify({ userId, imageData }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Profile picture upload error:", data);
      return { success: false, error: data.error || "Upload failed" };
    }

    pfpCache[userId] = imageData;
    return { success: true };
  } catch (err) {
    console.error("Profile picture upload network error:", err);
    return { success: false, error: `Network error: ${err}` };
  }
}

export async function deleteProfilePicture(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${SERVER}/profile-picture/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: buildSessionHeaders(false),
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

export async function fetchProfilePicture(userId: string): Promise<string | null> {
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

export async function fetchProfilePictures(
  userIds: string[],
): Promise<Record<string, string | null>> {
  if (userIds.length === 0) return {};

  const uncached = userIds.filter((id) => !(id in pfpCache));
  if (uncached.length > 0) {
    try {
      const resp = await fetch(`${SERVER}/profile-picture/batch`, {
        method: "POST",
        headers: buildSupabasePublicHeaders(true),
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

const pfpCache: Record<string, string | null> = {};

export function invalidatePfpCache(userId: string) {
  delete pfpCache[userId];
}

export function clearPfpCache() {
  for (const key of Object.keys(pfpCache)) delete pfpCache[key];
}
