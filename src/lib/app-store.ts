import {
  listCollection,
  replaceCollection,
  listTagCollection,
  replaceTagCollection,
  loadPlayerDoc,
  savePlayerDoc,
} from "./db-core";
import { supabase } from "./supabaseClient";

type Identifiable = { id: string };
type TagKind = "item" | "card" | "info" | "status" | "wiki";

type CollectionRow<T> = {
  id: string;
  data: T;
  updated_at?: string;
};

async function loadSingletonCollectionDoc<T>(
  table: string,
  id: string,
  fallback: T,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select("data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as T | undefined) ?? fallback;
}

async function saveSingletonCollectionDoc<T extends Identifiable>(
  table: string,
  row: T,
): Promise<void> {
  const payload: CollectionRow<T> = {
    id: row.id,
    data: row,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

async function saveSingletonDataDoc<T>(
  table: string,
  id: string,
  data: T,
): Promise<void> {
  const payload: CollectionRow<T> = {
    id,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export const appStore = {
  listNodeTrees: <T extends Identifiable>() => listCollection<T>("app_node_trees"),
  saveNodeTrees: <T extends Identifiable>(rows: T[]) => replaceCollection("app_node_trees", rows),

  loadPlayerNodeTreeUnlocks: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_node_tree_unlocks", playerId, fallback),
  savePlayerNodeTreeUnlocks: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_node_tree_unlocks", playerId, data),

  listPlayers: <T extends Identifiable>() => listCollection<T>("app_players"),
  savePlayers: <T extends Identifiable>(rows: T[]) => replaceCollection("app_players", rows),

  listDeletedPlayers: <T extends Identifiable>() => listCollection<T>("app_deleted_players"),
  saveDeletedPlayers: <T extends Identifiable>(rows: T[]) => replaceCollection("app_deleted_players", rows),

  listItems: <T extends Identifiable>() => listCollection<T>("app_items"),
  saveItems: <T extends Identifiable>(rows: T[]) => replaceCollection("app_items", rows),

  listCards: <T extends Identifiable>() => listCollection<T>("app_cards"),
  saveCards: <T extends Identifiable>(rows: T[]) => replaceCollection("app_cards", rows),

  listInfos: <T extends Identifiable>() => listCollection<T>("app_infos"),
  saveInfos: <T extends Identifiable>(rows: T[]) => replaceCollection("app_infos", rows),

  listInfoSubTabs: <T extends Identifiable>() => listCollection<T>("app_info_subtabs"),
  saveInfoSubTabs: <T extends Identifiable>(rows: T[]) => replaceCollection("app_info_subtabs", rows),

  listNotifications: <T extends Identifiable>() => listCollection<T>("app_notifications"),
  saveNotifications: <T extends Identifiable>(rows: T[]) => replaceCollection("app_notifications", rows),

  listNews: <T extends Identifiable>() => listCollection<T>("app_news"),
  saveNews: <T extends Identifiable>(rows: T[]) => replaceCollection("app_news", rows),

  listSites: <T extends Identifiable>() => listCollection<T>("app_sites"),
  saveSites: <T extends Identifiable>(rows: T[]) => replaceCollection("app_sites", rows),

  listCustomPanelStyles: <T extends Identifiable>() => listCollection<T>("app_custom_panel_styles"),
  saveCustomPanelStyles: <T extends Identifiable>(rows: T[]) => replaceCollection("app_custom_panel_styles", rows),

  listCustomReactions: <T extends Identifiable>() => listCollection<T>("community_custom_reactions"),
  saveCustomReactions: <T extends Identifiable>(rows: T[]) => replaceCollection("community_custom_reactions", rows),

  listTags: <T extends Identifiable>(kind: TagKind) => listTagCollection<T>(kind),
  saveTags: <T extends Identifiable>(kind: TagKind, rows: T[]) => replaceTagCollection(kind, rows),

  loadPlayerLevelCategories: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_level_categories", playerId, fallback),
  savePlayerLevelCategories: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_level_categories", playerId, data),

  loadNexusNomadState: <T extends Identifiable>(id: string, fallback: T) =>
    loadSingletonCollectionDoc<T>("app_nexus_nomad_state", id, fallback),
  saveNexusNomadState: <T extends Identifiable>(row: T) =>
    saveSingletonCollectionDoc<T>("app_nexus_nomad_state", row),

  listCommerceShops: <T extends Identifiable>() => listCollection<T>("app_commerce_shops"),
  saveCommerceShops: <T extends Identifiable>(rows: T[]) => replaceCollection("app_commerce_shops", rows),

  listCommerceLedger: <T extends Identifiable>() => listCollection<T>("app_commerce_ledger"),
  saveCommerceLedger: <T extends Identifiable>(rows: T[]) => replaceCollection("app_commerce_ledger", rows),

  loadPlayerCommerceCart: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_commerce_cart", playerId, fallback),
  savePlayerCommerceCart: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_commerce_cart", playerId, data),

  loadPlayerCustomization: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_customization", playerId, fallback),
  savePlayerCustomization: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_customization", playerId, data),

  loadCampaignTimelineState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_campaign_timeline_state", "default", fallback),
  saveCampaignTimelineState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_campaign_timeline_state", "default", data),

  loadTimelineCalendarPresets: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_timeline_calendar_presets", "default", fallback),
  saveTimelineCalendarPresets: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_timeline_calendar_presets", "default", data),
};
