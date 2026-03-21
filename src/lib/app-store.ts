import {
  listCollection,
  replaceCollection,
  listTagCollection,
  replaceTagCollection,
  loadPlayerDoc,
  savePlayerDoc,
} from "./db-core";

export const appStore = {
  listNodeTrees: <T>() => listCollection<T>("app_node_trees"),
  saveNodeTrees: <T extends { id: string }>(rows: T[]) => replaceCollection("app_node_trees", rows),

  loadPlayerNodeTreeUnlocks: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc("player_node_tree_unlocks", playerId, fallback),
  savePlayerNodeTreeUnlocks: <T>(playerId: string, data: T) =>
    savePlayerDoc("player_node_tree_unlocks", playerId, data),

  listPlayers: <T>() => listCollection<T>("app_players"),
  savePlayers: <T extends { id: string }>(rows: T[]) => replaceCollection("app_players", rows),

  listDeletedPlayers: <T>() => listCollection<T>("app_deleted_players"),
  saveDeletedPlayers: <T extends { id: string }>(rows: T[]) => replaceCollection("app_deleted_players", rows),

  listItems: <T>() => listCollection<T>("app_items"),
  saveItems: <T extends { id: string }>(rows: T[]) => replaceCollection("app_items", rows),

  listCards: <T>() => listCollection<T>("app_cards"),
  saveCards: <T extends { id: string }>(rows: T[]) => replaceCollection("app_cards", rows),

  listInfos: <T>() => listCollection<T>("app_infos"),
  saveInfos: <T extends { id: string }>(rows: T[]) => replaceCollection("app_infos", rows),

  listInfoSubTabs: <T>() => listCollection<T>("app_info_subtabs"),
  saveInfoSubTabs: <T extends { id: string }>(rows: T[]) => replaceCollection("app_info_subtabs", rows),

  listNotifications: <T>() => listCollection<T>("app_notifications"),
  saveNotifications: <T extends { id: string }>(rows: T[]) => replaceCollection("app_notifications", rows),

  listNews: <T>() => listCollection<T>("app_news"),
  saveNews: <T extends { id: string }>(rows: T[]) => replaceCollection("app_news", rows),

  listSites: <T>() => listCollection<T>("app_sites"),
  saveSites: <T extends { id: string }>(rows: T[]) => replaceCollection("app_sites", rows),

  listCustomPanelStyles: <T>() => listCollection<T>("app_custom_panel_styles"),
  saveCustomPanelStyles: <T extends { id: string }>(rows: T[]) => replaceCollection("app_custom_panel_styles", rows),

  listCustomReactions: <T>() => listCollection<T>("community_custom_reactions"),
  saveCustomReactions: <T extends { id: string }>(rows: T[]) => replaceCollection("community_custom_reactions", rows),

  listTags: <T>(kind: "item" | "card" | "info" | "status" | "wiki") => listTagCollection<T>(kind),
  saveTags: <T extends { id: string }>(kind: "item" | "card" | "info" | "status" | "wiki", rows: T[]) => replaceTagCollection(kind, rows),

  loadPlayerLevelCategories: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_level_categories", playerId, fallback),
  savePlayerLevelCategories: <T>(playerId: string, data: T) => savePlayerDoc("player_level_categories", playerId, data),
};