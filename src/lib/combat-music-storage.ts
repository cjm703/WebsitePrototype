import { buildSessionHeaders, sessionApiFetch } from "./api-client";
import { supabaseFunctionBase } from "./supabase-env";

export interface CombatMusicStorageRef {
  kind: "supabase-storage";
  bucket: string;
  path: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export const COMBAT_MUSIC_BUCKET = String(
  import.meta.env.VITE_SUPABASE_COMBAT_MUSIC_BUCKET || "combat-music",
).trim() || "combat-music";

function cleanStorageSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "audio";
}

function storagePathForTrack(trackId: string, fileName = "audio") {
  const cleanTrackId = cleanStorageSegment(trackId);
  const cleanFileName = cleanStorageSegment(fileName);
  return `combat/${cleanTrackId}/${Date.now()}-${cleanFileName}`;
}

export async function uploadCombatMusicFileToStorage(
  trackId: string,
  file: Blob & { name?: string },
  onProgress?: (percent: number) => void,
): Promise<CombatMusicStorageRef> {
  const path = storagePathForTrack(trackId, file.name || "audio");
  const form = new FormData();
  form.append("path", path);
  form.append("file", file, file.name || "audio");

  return new Promise<CombatMusicStorageRef>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${supabaseFunctionBase}/music/upload`);
    const headers = buildSessionHeaders(false);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("Music upload network error."));
    request.onload = () => {
      const body = (() => {
        try {
          return JSON.parse(request.responseText || "{}");
        } catch {
          return {};
        }
      })();
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(body?.error || `Music upload failed (${request.status}).`));
        return;
      }
      if (!body?.storageRef?.publicUrl) {
        reject(new Error("Music upload did not return a playable public URL."));
        return;
      }
      onProgress?.(100);
      resolve(body.storageRef as CombatMusicStorageRef);
    };
    request.send(form);
  });
}

export async function deleteCombatMusicFileFromStorage(ref: CombatMusicStorageRef | undefined) {
  if (!ref?.bucket || !ref.path) return;
  await sessionApiFetch("/music/delete", {
    method: "POST",
    body: JSON.stringify({ bucket: ref.bucket, path: ref.path }),
  });
}
