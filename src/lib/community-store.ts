import { listCollection, replaceCollection, loadPlayerDoc, savePlayerDoc } from "./db-core";
import { supabase } from "./supabaseClient";

export const communityStore = {
  listMessages: <T>() => listCollection<T>("community_messages"),

  async insertMessage<T extends { id: string }>(message: T): Promise<void> {
    const { error } = await supabase.from("community_messages").upsert(
      { id: message.id, data: message, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await supabase.from("community_messages").delete().eq("id", messageId);
    if (error) throw error;
  },

  listNpcAccounts: <T>() => listCollection<T>("community_npc_accounts"),
  saveNpcAccounts: <T extends { id: string }>(rows: T[]) => replaceCollection("community_npc_accounts", rows),

  listCustomReactions: <T>() => listCollection<T>("community_custom_reactions"),

  loadReadState: <T>(playerId: string, fallback: T) => loadPlayerDoc("community_read_state", playerId, fallback),
  saveReadState: <T>(playerId: string, data: T) => savePlayerDoc("community_read_state", playerId, data),

  loadProfile: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_community_profile", playerId, fallback),
  saveProfile: <T>(playerId: string, data: T) => savePlayerDoc("player_community_profile", playerId, data),

  async loadImages(): Promise<Record<string, { data: string; timestamp: number }>> {
    const { data, error } = await supabase.from("community_images").select("id, data");
    if (error) throw error;
    const out: Record<string, { data: string; timestamp: number }> = {};
    for (const row of data ?? []) out[row.id] = row.data;
    return out;
  },

  async saveImage(imageId: string, data: { data: string; timestamp: number }): Promise<void> {
    const { error } = await supabase.from("community_images").upsert(
      { id: imageId, data, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) throw error;
  },

  async deleteImage(imageId: string): Promise<void> {
    const { error } = await supabase.from("community_images").delete().eq("id", imageId);
    if (error) throw error;
  },
};