import { supabase } from "./supabaseClient";

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
): Promise<CombatMusicStorageRef> {
  const bucket = COMBAT_MUSIC_BUCKET;
  const path = storagePathForTrack(trackId, file.name || "audio");
  const contentType = file.type || "audio/mpeg";
  const createdAt = new Date().toISOString();

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "Supabase Storage upload failed.");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data.publicUrl) {
    throw new Error("Supabase Storage did not return a playable public URL.");
  }

  return {
    kind: "supabase-storage",
    bucket,
    path,
    publicUrl: data.publicUrl,
    contentType,
    sizeBytes: file.size || 0,
    createdAt,
  };
}

export async function deleteCombatMusicFileFromStorage(ref: CombatMusicStorageRef | undefined) {
  if (!ref?.bucket || !ref.path) return;
  const { error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
  if (error) {
    throw new Error(error.message || "Supabase Storage delete failed.");
  }
}
