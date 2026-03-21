const PLAYER_STATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8a5950b5/player-state`;
const LOGOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8a5950b5/session/logout`;

function sessionHeaders() {
  const token = localStorage.getItem("inet-session-token") || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function callPlayerState<T>(method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(PLAYER_STATE_URL, {
    method,
    headers: sessionHeaders(),
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`player-state ${method} failed: ${res.status} ${text}`);
  }

  return res.json();
}

export const playerStore = {
  loadPlayerState: <T>() => callPlayerState<T>("GET"),

  savePlayerPatch: (playerPatch: unknown) =>
    callPlayerState("POST", { playerPatch }),

  loadQuickItems: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.quickItems ?? fallback) as T;
  },
  saveQuickItems: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { quickItems: data }),

  loadSourceUsage: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.sourceUsage ?? fallback) as T;
  },
  saveSourceUsage: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { sourceUsage: data }),

  loadActivityLog: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.activityLog ?? fallback) as T;
  },
  saveActivityLog: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { activityLog: data }),

  loadSkillSettings: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.skillSettings ?? fallback) as T;
  },
  saveSkillSettings: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { skillSettings: data }),

  loadSkillProficiencies: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.skillProficiencies ?? fallback) as T;
  },
  saveSkillProficiencies: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { skillProficiencies: data }),

  loadEquipmentSlots: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.equipmentSlots ?? fallback) as T;
  },
  saveEquipmentSlots: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { equipmentSlots: data }),

  loadStatusEffects: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.statusEffects ?? fallback) as T;
  },
  saveStatusEffects: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { statusEffects: data }),

  loadLevelCategories: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.levelCategories ?? fallback) as T;
  },
  saveLevelCategories: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { levelCategories: data }),

  loadNodeUnlocks: async <T>(_playerId: string, fallback: T) => {
    const data = await callPlayerState<any>("GET");
    return (data.nodeUnlocks ?? fallback) as T;
  },
  saveNodeUnlocks: <T>(_playerId: string, data: T) =>
    callPlayerState("POST", { nodeUnlocks: data }),

  saveOwnedItem: (item: unknown) =>
    callPlayerState("POST", { saveItem: item }),

  deleteOwnedItem: (deleteItemId: string) =>
    callPlayerState("POST", { deleteItemId }),

  logoutSession: async () => {
    const res = await fetch(LOGOUT_URL, {
      method: "POST",
      headers: sessionHeaders(),
    });
    if (!res.ok) throw new Error(`logout failed: ${res.status}`);
  },
};