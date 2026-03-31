import {
  listCollection,
  replaceCollection,
  listTagCollection,
  replaceTagCollection,
  loadPlayerDoc,
  savePlayerDoc,
} from "./db-core";

type IdRow = { id: string };

type TagKind = "item" | "card" | "info" | "status" | "wiki";

async function loadSingletonCollection<T extends IdRow>(
  table: string,
  singletonId: string,
  fallback: T,
): Promise<T> {
  const rows = await listCollection<T>(table);
  if (rows.length === 0) return fallback;
  return rows.find((row) => row.id === singletonId) ?? rows[0] ?? fallback;
}

async function saveSingletonCollection<T extends IdRow>(
  table: string,
  row: T,
): Promise<void> {
  await replaceCollection<T>(table, [row]);
}

export const appStore = {
  listNodeTrees: <T extends IdRow>() => listCollection<T>("app_node_trees"),
  saveNodeTrees: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_node_trees", rows),

  loadPlayerNodeTreeUnlocks: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_node_tree_unlocks", playerId, fallback),
  savePlayerNodeTreeUnlocks: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_node_tree_unlocks", playerId, data),

  listPlayers: <T extends IdRow>() => listCollection<T>("app_players"),
  savePlayers: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_players", rows),

  listDeletedPlayers: <T extends IdRow>() => listCollection<T>("app_deleted_players"),
  saveDeletedPlayers: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_deleted_players", rows),

  listItems: <T extends IdRow>() => listCollection<T>("app_items"),
  saveItems: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_items", rows),

  listCards: <T extends IdRow>() => listCollection<T>("app_cards"),
  saveCards: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_cards", rows),

  listInfos: <T extends IdRow>() => listCollection<T>("app_infos"),
  saveInfos: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_infos", rows),

  listInfoSubTabs: <T extends IdRow>() => listCollection<T>("app_info_subtabs"),
  saveInfoSubTabs: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_info_subtabs", rows),

  listNotifications: <T extends IdRow>() => listCollection<T>("app_notifications"),
  saveNotifications: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_notifications", rows),

  listNews: <T extends IdRow>() => listCollection<T>("app_news"),
  saveNews: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_news", rows),

  listSites: <T extends IdRow>() => listCollection<T>("app_sites"),
  saveSites: <T extends IdRow>(rows: T[]) => replaceCollection<T>("app_sites", rows),

  listCustomPanelStyles: <T extends IdRow>() => listCollection<T>("app_custom_panel_styles"),
  saveCustomPanelStyles: <T extends IdRow>(rows: T[]) =>
    replaceCollection<T>("app_custom_panel_styles", rows),

  listCustomReactions: <T extends IdRow>() => listCollection<T>("community_custom_reactions"),
  saveCustomReactions: <T extends IdRow>(rows: T[]) =>
    replaceCollection<T>("community_custom_reactions", rows),

  listTags: <T extends IdRow>(kind: TagKind) => listTagCollection<T>(kind),
  saveTags: <T extends IdRow>(kind: TagKind, rows: T[]) => replaceTagCollection<T>(kind, rows),

  loadPlayerLevelCategories: <T>(playerId: string, fallback: T) =>
    loadPlayerDoc<T>("player_level_categories", playerId, fallback),
  savePlayerLevelCategories: <T>(playerId: string, data: T) =>
    savePlayerDoc<T>("player_level_categories", playerId, data),

  loadNexusNomadState: <T extends IdRow>(fallback: T) =>
    loadSingletonCollection<T>("app_nexus_nomad_state", "default", fallback),
  saveNexusNomadState: <T extends IdRow>(row: T) =>
    saveSingletonCollection<T>("app_nexus_nomad_state", row),
};
