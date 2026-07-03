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

async function deleteSingletonDataDoc(
  table: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id);
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

  loadIntelliMapsState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_intelli_maps_state", "default", fallback),
  saveIntelliMapsState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_intelli_maps_state", "default", data),

  loadSessionLogState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_session_log_state", "default", fallback),
  saveSessionLogState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_session_log_state", "default", data),

  loadSessionPlayerNotes: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_session_player_notes", "default", fallback),
  saveSessionPlayerNotes: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_session_player_notes", "default", data),

  loadPlayerWikiEditorDrafts: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_wiki_editor_drafts", playerId, fallback),
  savePlayerWikiEditorDrafts: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_wiki_editor_drafts", playerId, data),

  loadPlayerPlacedStickers: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_placed_stickers", playerId, fallback),
  savePlayerPlacedStickers: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_placed_stickers", playerId, data),

  loadPartyColorState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_party_color_state", "default", fallback),
  savePartyColorState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_party_color_state", "default", data),

  loadPartyColorCursors: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_party_color_cursors", "default", fallback),
  savePartyColorCursors: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_party_color_cursors", "default", data),

  loadCalendarWeatherState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_calendar_weather_state", "default", fallback),
  saveCalendarWeatherState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_calendar_weather_state", "default", data),

  loadDmCustomizeState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_dm_customize_state", "default", fallback),
  saveDmCustomizeState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_dm_customize_state", "default", data),

  loadArcadeCatalogState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", "default", fallback),
  saveArcadeCatalogState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", "default", data),

  loadArcadeLeaderboardState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_leaderboard_state", "default", fallback),
  saveArcadeLeaderboardState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_leaderboard_state", "default", data),

  loadPlayerArcadeProfile: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_arcade_profiles", playerId, fallback),
  savePlayerArcadeProfile: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_arcade_profiles", playerId, data),

  loadAdventureSessionsState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", "adventure-sessions", fallback),
  saveAdventureSessionsState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", "adventure-sessions", data),

  loadCombatState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", "combat-state", fallback),
  saveCombatState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", "combat-state", data),

  loadCombatMusicState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", "combat-music-state", fallback),
  saveCombatMusicState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", "combat-music-state", data),
  loadCombatPresenceState: <T>(fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", "combat-presence-state", fallback),
  saveCombatPresenceState: <T>(data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", "combat-presence-state", data),
  loadCombatMusicFileChunk: <T>(chunkId: string, fallback: T) =>
    loadSingletonCollectionDoc<T>("app_arcade_catalog_state", chunkId, fallback),
  saveCombatMusicFileChunk: <T>(chunkId: string, data: T) =>
    saveSingletonDataDoc<T>("app_arcade_catalog_state", chunkId, data),
  deleteCombatMusicFileChunk: (chunkId: string) =>
    deleteSingletonDataDoc("app_arcade_catalog_state", chunkId),

};
