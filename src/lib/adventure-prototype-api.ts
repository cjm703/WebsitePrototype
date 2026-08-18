import type {
  PrototypeActionRequest,
  PrototypeActionType,
  PrototypeRoom,
} from "../../supabase/functions/_shared/adventure-prototype";
import { sessionApiFetchAt } from "./api-client";
import { removeSupabaseChannelSafely, supabase } from "./supabaseClient";
import { supabaseUrl } from "./supabase-env";

export type PrototypeProfile = { id: string; name: string };
export type PrototypeBot = { id: string; name: string; createdAt: string; updatedAt: string };
export type PrototypeConnectionState = "connecting" | "live" | "polling" | "offline";
const PROTOTYPE_API_BASE = `${supabaseUrl}/functions/v1/adventure-prototype`;

function prototypeApiFetch(path: string, init: RequestInit = {}) {
  return sessionApiFetchAt(PROTOTYPE_API_BASE, path, init);
}

export async function listPrototypeProfiles() {
  const body = await prototypeApiFetch("/profiles", { method: "GET" });
  return (Array.isArray(body?.profiles) ? body.profiles : []) as PrototypeProfile[];
}

export async function listPrototypeBots() {
  const body = await prototypeApiFetch("/bots", { method: "GET" });
  return (Array.isArray(body?.bots) ? body.bots : []) as PrototypeBot[];
}

export async function createPrototypeBot(name: string) {
  const body = await prototypeApiFetch("/bots", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return body.bot as PrototypeBot;
}

export async function deletePrototypeBot(botId: string) {
  await prototypeApiFetch(`/bots/${encodeURIComponent(botId)}`, { method: "DELETE" });
}

export async function listPrototypeRooms() {
  const body = await prototypeApiFetch("/rooms", { method: "GET" });
  return (Array.isArray(body?.rooms) ? body.rooms : []) as PrototypeRoom[];
}

export async function loadPrototypeRoom(roomId: string) {
  const body = await prototypeApiFetch(`/rooms/${encodeURIComponent(roomId)}`, { method: "GET" });
  return body.room as PrototypeRoom;
}

export async function createAdventurePrototypeRoom(input: { name: string; invitedPlayerIds: string[]; botIds: string[] }) {
  const body = await prototypeApiFetch("/rooms", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.room as PrototypeRoom;
}

export async function sendPrototypeAction(
  room: PrototypeRoom,
  type: PrototypeActionType,
  payload?: PrototypeActionRequest["payload"],
) {
  const request: PrototypeActionRequest = {
    id: `prototype-${Date.now()}-${crypto.randomUUID()}`,
    type,
    expectedVersion: room.version,
    payload,
  };
  const body = await prototypeApiFetch(
    `/rooms/${encodeURIComponent(room.id)}/actions`,
    { method: "POST", body: JSON.stringify(request) },
  );
  return body.room as PrototypeRoom;
}

export function subscribePrototypeRoom(
  roomId: string,
  onRoom: (room: PrototypeRoom) => void,
  onConnection: (state: PrototypeConnectionState) => void,
  onError: (error: unknown) => void,
) {
  let closed = false;
  let refreshPromise: Promise<void> | null = null;
  let timer: number | null = null;
  let realtimeConnected = false;

  const refresh = () => {
    if (closed) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = loadPrototypeRoom(roomId)
      .then((room) => {
        if (!closed) {
          onRoom(room);
          onConnection(realtimeConnected ? "live" : "polling");
        }
      })
      .catch((error) => {
        if (!closed) {
          onConnection("offline");
          onError(error);
        }
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  };

  const poll = () => {
    void refresh().finally(() => {
      if (!closed) timer = window.setTimeout(poll, 2500);
    });
  };

  onConnection("connecting");
  const channel = supabase
    .channel(`adventure-prototype:${roomId}`)
    .on("broadcast", { event: "room-updated" }, () => {
      void refresh();
    })
    .subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") {
        realtimeConnected = true;
        onConnection("live");
      }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        realtimeConnected = false;
        onConnection("polling");
      }
    });

  const onFocus = () => { void refresh(); };
  const onVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  poll();

  return () => {
    closed = true;
    if (timer != null) window.clearTimeout(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    removeSupabaseChannelSafely(channel);
  };
}

export type { PrototypeActionType, PrototypePoint, PrototypeRoom, PrototypeUnit } from "../../supabase/functions/_shared/adventure-prototype";
