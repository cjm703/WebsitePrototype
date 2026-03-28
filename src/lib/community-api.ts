import { supabase } from "./supabaseClient";
import { safeGetItem, safeRemoveItem } from "@/app/components/safe-storage";

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const API_BASE = `${SUPABASE_URL}/functions/v1/make-server-8a5950b5`;

function buildHeaders(includeJson = true): HeadersInit {
  const sessionToken = safeGetItem("inet-session-token") || "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
    "X-Session-Token": sessionToken,
  };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sessionToken = safeGetItem("inet-session-token");
  if (!sessionToken) throw new Error("Missing player session token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(init.body != null),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    safeRemoveItem("inet-session-token");
    throw new Error(typeof (body as any)?.error === "string" ? (body as any).error : "Player session expired");
  }
  if (!res.ok) {
    throw new Error(typeof (body as any)?.error === "string" ? (body as any).error : `Request failed: ${res.status}`);
  }
  return body as T;
}

export async function listCommunityPlayers(): Promise<Array<{ id: string; name: string }>> {
  const body = await apiFetch<{ players?: Array<{ id: string; name: string }> }>("/community/players", { method: "GET" });
  return body.players ?? [];
}

export async function listNpcAccounts(): Promise<CommunityNpcAccount[]> {
  const body = await apiFetch<{ npcAccounts?: CommunityNpcAccount[] }>("/community/npcs", { method: "GET" });
  return body.npcAccounts ?? [];
}

export async function saveNpcAccounts(rows: CommunityNpcAccount[]): Promise<void> {
  await apiFetch("/community/npcs/save", { method: "POST", body: JSON.stringify({ npcAccounts: rows }) });
}

export async function listCustomReactions(): Promise<CommunityCustomReaction[]> {
  const body = await apiFetch<{ reactions?: CommunityCustomReaction[] }>("/community/reactions", { method: "GET" });
  return body.reactions ?? [];
}

export async function listCommunityImages(): Promise<CommunityImageRecord[]> {
  const body = await apiFetch<{ images?: CommunityImageRecord[] }>("/community/images", { method: "GET" });
  return body.images ?? [];
}

export async function saveCommunityImage(image: CommunityImageRecord): Promise<void> {
  await apiFetch("/community/image/save", { method: "POST", body: JSON.stringify({ image }) });
}

export async function deleteCommunityImage(id: string): Promise<void> {
  await apiFetch("/community/image/delete", { method: "POST", body: JSON.stringify({ id }) });
}

export async function listAllMessages(): Promise<CommunityMessageRecord[]> {
  const body = await apiFetch<{ messages?: CommunityMessageRecord[] }>("/community/messages", { method: "GET" });
  return body.messages ?? [];
}

export async function sendCommunityMessage(message: CommunityMessageRecord): Promise<void> {
  await apiFetch("/community/message/send", { method: "POST", body: JSON.stringify({ message }) });
}

export async function updateCommunityMessage(message: CommunityMessageRecord): Promise<void> {
  await apiFetch("/community/message/update", { method: "POST", body: JSON.stringify({ message }) });
}

export async function removeCommunityMessage(id: string): Promise<void> {
  await apiFetch("/community/message/delete", { method: "POST", body: JSON.stringify({ id }) });
}

export async function loadCommunityReadState(playerId: string): Promise<CommunityReadState> {
  const body = await apiFetch<{ channels?: CommunityReadState }>(`/community/read-state/${encodeURIComponent(playerId)}`, { method: "GET" });
  return body.channels ?? {};
}

export async function saveCommunityReadState(playerId: string, channels: CommunityReadState): Promise<void> {
  await apiFetch("/community/read-state/save", { method: "POST", body: JSON.stringify({ playerId, channels }) });
}

export async function loadCommunityProfile(playerId: string): Promise<CommunityProfile> {
  const body = await apiFetch<{ profile?: CommunityProfile }>(`/community/profile/${encodeURIComponent(playerId)}`, { method: "GET" });
  return body.profile ?? { playerId };
}

export async function saveCommunityProfile(playerId: string, profile: CommunityProfile): Promise<void> {
  await apiFetch("/community/profile/save", { method: "POST", body: JSON.stringify({ playerId, profile }) });
}

export async function loadCommunityProfiles(playerIds: string[]): Promise<Record<string, CommunityProfile>> {
  if (playerIds.length === 0) return {};
  const body = await apiFetch<{ profiles?: Record<string, CommunityProfile> }>("/community/profiles/bulk", {
    method: "POST",
    body: JSON.stringify({ playerIds }),
  });
  return body.profiles ?? {};
}


export type InventoryTransferResponse = {
  ok: boolean;
  senderRemainingQuantity?: number | null;
  recipientQuantity?: number | null;
  message?: CommunityMessageRecord;
};

export async function respondInventoryTransfer(messageId: string, action: "accept" | "decline"): Promise<InventoryTransferResponse> {
  return await apiFetch<InventoryTransferResponse>("/community/inventory-transfer/respond", {
    method: "POST",
    body: JSON.stringify({ messageId, action }),
  });
}

function stableMessageMap(messages: CommunityMessageRecord[]) {
  return new Map(messages.map((message) => [message.id, message] as const));
}

export function subscribeToCommunityMessages(
  onChange: (message: CommunityMessageRecord, eventType: "INSERT" | "UPDATE" | "DELETE") => void,
): () => void {
  let disposed = false;
  let snapshot = new Map<string, CommunityMessageRecord>();

  const emitDiff = (nextMessages: CommunityMessageRecord[]) => {
    const next = stableMessageMap(nextMessages);

    for (const [id, message] of next) {
      const prev = snapshot.get(id);
      if (!prev) {
        onChange(message, "INSERT");
        continue;
      }
      if (JSON.stringify(prev) !== JSON.stringify(message)) {
        onChange(message, "UPDATE");
      }
    }

    for (const [id, message] of snapshot) {
      if (!next.has(id)) {
        onChange(message, "DELETE");
      }
    }

    snapshot = next;
  };

  void listAllMessages().then((messages) => {
    if (!disposed) snapshot = stableMessageMap(messages);
  }).catch(() => {});

  const rtChannel = supabase
    .channel("community-messages-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "community_messages" }, (payload) => {
      const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
      const row = (eventType === "DELETE" ? payload.old : payload.new) as any;
      const message = (row?.data ?? row) as CommunityMessageRecord | undefined;
      if (!message?.id) return;
      if (eventType === "DELETE") snapshot.delete(message.id);
      else snapshot.set(message.id, message);
      onChange(message, eventType);
    })
    .subscribe();

  const pollId = window.setInterval(async () => {
    try {
      const messages = await listAllMessages();
      if (!disposed) emitDiff(messages);
    } catch {
      // Polling is a fallback. Ignore intermittent failures here.
    }
  }, 1500);

  return () => {
    disposed = true;
    window.clearInterval(pollId);
    void supabase.removeChannel(rtChannel);
  };
}
