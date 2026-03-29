import { supabase } from "./supabaseClient";
import { safeGetItem, safeRemoveItem } from "@/app/components/safe-storage";

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

async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function listCommunityPlayers<T = Record<string, unknown>>() {
  const body = await apiFetch<{ players?: T[] }>("/community/players", { method: "GET" });
  return body.players ?? [];
}

export async function listNpcAccounts<T = Record<string, unknown>>() {
  const body = await apiFetch<{ npcAccounts?: T[] }>("/community/npcs", { method: "GET" });
  return body.npcAccounts ?? [];
}

export async function saveNpcAccounts(npcAccounts: Record<string, unknown>[]) {
  await apiFetch("/community/npcs/save", {
    method: "POST",
    body: JSON.stringify({ npcAccounts }),
  });
}

export async function listAllMessages<T = Record<string, unknown>>() {
  const body = await apiFetch<{ messages?: T[] }>("/community/messages", { method: "GET" });
  return body.messages ?? [];
}

export async function sendCommunityMessage(message: Record<string, unknown>) {
  await apiFetch("/community/message/send", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function updateCommunityMessage(message: Record<string, unknown>) {
  await apiFetch("/community/message/update", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function removeCommunityMessage(id: string) {
  await apiFetch("/community/message/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function listCommunityImages<T = Record<string, unknown>>() {
  const body = await apiFetch<{ images?: T[] }>("/community/images", { method: "GET" });
  return body.images ?? [];
}

export async function saveCommunityImage(image: Record<string, unknown>) {
  await apiFetch("/community/image/save", {
    method: "POST",
    body: JSON.stringify({ image }),
  });
}

export async function deleteCommunityImage(id: string) {
  await apiFetch("/community/image/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export async function listCustomReactions<T = Record<string, unknown>>() {
  const body = await apiFetch<{ reactions?: T[] }>("/community/reactions", { method: "GET" });
  return body.reactions ?? [];
}

export async function loadCommunityReadState(playerId: string) {
  const body = await apiFetch<{ channels?: Record<string, number> }>(`/community/read-state/${encodeURIComponent(playerId)}`, { method: "GET" });
  return body.channels ?? {};
}

export async function saveCommunityReadState(playerId: string, channels: Record<string, number>) {
  await apiFetch("/community/read-state/save", {
    method: "POST",
    body: JSON.stringify({ playerId, channels }),
  });
}

export async function loadCommunityProfile<T = Record<string, unknown>>(playerId: string) {
  const body = await apiFetch<{ profile?: T }>(`/community/profile/${encodeURIComponent(playerId)}`, { method: "GET" });
  return (body.profile ?? ({ playerId } as T));
}

export async function saveCommunityProfile(playerId: string, profile: Record<string, unknown>) {
  await apiFetch("/community/profile/save", {
    method: "POST",
    body: JSON.stringify({ playerId, profile }),
  });
}

export async function loadCommunityProfiles<T = Record<string, unknown>>(playerIds: string[]) {
  const ids = Array.from(new Set((playerIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) return {} as Record<string, T>;
  const body = await apiFetch<{ profiles?: Record<string, T> }>("/community/profiles/bulk", {
    method: "POST",
    body: JSON.stringify({ playerIds: ids }),
  });
  return body.profiles ?? ({} as Record<string, T>);
}

export async function respondInventoryTransfer(messageId: string, action: "accept" | "decline") {
  const body = await apiFetch<{ ok?: boolean; message?: any; senderRemainingQuantity?: number; recipientQuantity?: number }>("/community/inventory-transfer/respond", {
    method: "POST",
    body: JSON.stringify({ messageId, action }),
  });
  return body;
}

export function subscribeToCommunityMessages<T = Record<string, unknown>>(
  onMessage: (message: T, eventType: "INSERT" | "UPDATE" | "DELETE") => void,
) {
  let isClosed = false;
  let pollTimer: number | null = null;
  let lastSeen = new Map<string, string>();

  const handleSnapshot = (messages: any[]) => {
    const nextMap = new Map<string, string>();
    for (const message of messages) {
      const id = String(message?.id || "");
      if (!id) continue;
      const stamp = JSON.stringify([
        message?.timestamp ?? null,
        message?.editedAt ?? null,
        message?.deletedAt ?? null,
        message?.text ?? null,
        message?.clientStatus ?? null,
        message?.commandPayload ?? null,
        message?.reactions ?? null,
      ]);
      nextMap.set(id, stamp);
      if (!lastSeen.has(id)) {
        onMessage(message as T, "INSERT");
      } else if (lastSeen.get(id) !== stamp) {
        onMessage(message as T, "UPDATE");
      }
    }

    for (const id of lastSeen.keys()) {
      if (!nextMap.has(id)) {
        onMessage(({ id } as unknown) as T, "DELETE");
      }
    }

    lastSeen = nextMap;
  };

  const poll = async () => {
    if (isClosed) return;
    try {
      const messages = await listAllMessages<any>();
      handleSnapshot(messages);
    } catch {
      // keep silent; realtime may still work
    } finally {
      if (!isClosed) {
        pollTimer = window.setTimeout(poll, 1500);
      }
    }
  };

  const channel = supabase
    .channel("community-messages")
    .on("postgres_changes", { event: "*", schema: "public", table: "community_messages" }, (payload) => {
      const raw = (payload.eventType === "DELETE" ? payload.old : payload.new) as any;
      const message = raw?.data ?? raw;
      if (!message) return;
      onMessage(message as T, payload.eventType as "INSERT" | "UPDATE" | "DELETE");
      const id = String(message?.id || "");
      if (!id) return;
      if (payload.eventType === "DELETE") {
        lastSeen.delete(id);
      } else {
        const stamp = JSON.stringify([
          message?.timestamp ?? null,
          message?.editedAt ?? null,
          message?.deletedAt ?? null,
          message?.text ?? null,
          message?.clientStatus ?? null,
          message?.commandPayload ?? null,
          message?.reactions ?? null,
        ]);
        lastSeen.set(id, stamp);
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void listAllMessages<any>().then(handleSnapshot).catch(() => undefined);
      }
    });

  void poll();

  return () => {
    isClosed = true;
    if (pollTimer != null) window.clearTimeout(pollTimer);
    void supabase.removeChannel(channel);
  };
}
