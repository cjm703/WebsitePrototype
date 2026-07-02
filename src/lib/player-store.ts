import { loadPlayerDoc, savePlayerDoc } from "./db-core";

export const playerStore = {
  loadQuickItems: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_quick_items", playerId, fallback),
  saveQuickItems: <T>(playerId: string, data: T) => savePlayerDoc("player_quick_items", playerId, data),

  loadSourceUsage: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_source_usage_log", playerId, fallback),
  saveSourceUsage: <T>(playerId: string, data: T) => savePlayerDoc("player_source_usage_log", playerId, data),

  loadActivityLog: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_activity_log", playerId, fallback),
  saveActivityLog: <T>(playerId: string, data: T) => savePlayerDoc("player_activity_log", playerId, data),

  loadSkillSettings: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_skill_settings", playerId, fallback),
  saveSkillSettings: <T>(playerId: string, data: T) => savePlayerDoc("player_skill_settings", playerId, data),

  loadSkillProficiencies: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_skill_proficiencies", playerId, fallback),
  saveSkillProficiencies: <T>(playerId: string, data: T) => savePlayerDoc("player_skill_proficiencies", playerId, data),

  loadEquipmentSlots: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_equipment_slots", playerId, fallback),
  saveEquipmentSlots: <T>(playerId: string, data: T) => savePlayerDoc("player_equipment_slots", playerId, data),

  loadStatusEffects: <T>(playerId: string, fallback: T) => loadPlayerDoc("player_status_effects", playerId, fallback),
  saveStatusEffects: <T>(playerId: string, data: T) => savePlayerDoc("player_status_effects", playerId, data),
};