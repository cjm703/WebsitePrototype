import { supabase } from "./supabaseClient";
import { listCollection, loadPlayerDoc, savePlayerDoc } from "./db-core";

export type CommunityMessageRecord = {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  imageId?: string;
  edited?: boolean;
  editedAt?: number;
  reactions?: Record<string, string[]>;
  nameColor?: string;
  chatColor?: string;
};

export type CommunityImageRecord = {
  id: string;
  data: string;
  timestamp: number;
  uploadedBy?: string;
};

export type CommunityNpcAccount = {
  id: string;
  name: string;
  color: string;
};

export type CommunityCustomReaction = {
  id: string;
  emoji: string;
  label: string;
};

export type CommunityProfile = {
  playerId: string;
  displayName?: string;
  hiddenDmChannels?: string[];
};

export type CommunityReadState = Record<string, number>;

function toRow<T>(id: string, data: T) {
  return { id, data, updated_at: new Date().toISOString() };
}

export async function listCommunityPlayers(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.from("app_players").select("id, data").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.data?.name ?? row.data?.displayName ?? row.id),
  }));
}

export async function listNpcAccounts(): Promise<CommunityNpcAccount[]> {
  return listCollection<CommunityNpcAccount>("community_npc_accounts");
}

export async function saveNpcAccounts(rows: CommunityNpcAccount[]): Promise<void> {
  const payload = rows.map((row) => toRow(row.id, row));
  const { error } = await supabase.from("community_npc_accounts").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function listCustomReactions(): Promise<CommunityCustomReaction[]> {
  return listCollection<CommunityCustomReaction>("community_custom_reactions");
}

export async function listCommunityImages(): Promise<CommunityImageRecord[]> {
  return listCollection<CommunityImageRecord>("community_images");
}

export async function saveCommunityImage(image: CommunityImageRecord): Promise<void> {
  const { error } = await supabase.from("community_images").upsert(toRow(image.id, image), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteCommunityImage(id: string): Promise<void> {
  const { error } = await supabase.from("community_images").delete().eq("id", id);
  if (error) throw error;
}

export async function listAllMessages(): Promise<CommunityMessageRecord[]> {
  const { data, error } = await supabase
    .from("community_messages")
    .select("id, data, updated_at")
    .order("updated_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => row.data as CommunityMessageRecord);
}

export async function sendCommunityMessage(message: CommunityMessageRecord): Promise<void> {
  const { error } = await supabase.from("community_messages").upsert(toRow(message.id, message), { onConflict: "id" });
  if (error) throw error;
}

export async function updateCommunityMessage(message: CommunityMessageRecord): Promise<void> {
  const { error } = await supabase.from("community_messages").upsert(toRow(message.id, message), { onConflict: "id" });
  if (error) throw error;
}

export async function removeCommunityMessage(id: string): Promise<void> {
  const { error } = await supabase.from("community_messages").delete().eq("id", id);
  if (error) throw error;
}

export async function loadCommunityReadState(playerId: string): Promise<CommunityReadState> {
  const data = await loadPlayerDoc<{ channels?: CommunityReadState }>("community_read_state", playerId, { channels: {} });
  return data.channels ?? {};
}

export async function saveCommunityReadState(playerId: string, channels: CommunityReadState): Promise<void> {
  await savePlayerDoc("community_read_state", playerId, { channels });
}

export async function loadCommunityProfile(playerId: string): Promise<CommunityProfile> {
  return loadPlayerDoc<CommunityProfile>("player_community_profile", playerId, { playerId });
}

export async function saveCommunityProfile(playerId: string, profile: CommunityProfile): Promise<void> {
  await savePlayerDoc("player_community_profile", playerId, profile);
}

export async function loadCommunityProfiles(playerIds: string[]): Promise<Record<string, CommunityProfile>> {
  if (playerIds.length === 0) return {};
  const { data, error } = await supabase
    .from("player_community_profile")
    .select("player_id, data")
    .in("player_id", playerIds);
  if (error) throw error;
  const result: Record<string, CommunityProfile> = {};
  for (const row of data ?? []) {
    result[String((row as any).player_id)] = ((row as any).data ?? {}) as CommunityProfile;
  }
  return result;
}

export function subscribeToCommunityMessages(onChange: (message: CommunityMessageRecord, eventType: "INSERT" | "UPDATE" | "DELETE") => void): () => void {
  const channel = supabase
    .channel("community-messages-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "community_messages" }, (payload) => {
      const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
      const row = (eventType === "DELETE" ? payload.old : payload.new) as any;
      const message = (row?.data ?? row) as CommunityMessageRecord | undefined;
      if (!message?.id) return;
      onChange(message, eventType);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
