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

async function apiFetch(path: string, init: RequestInit = {}) {
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
    throw new Error(typeof body?.error === "string" ? body.error : "Player session expired");
  }

  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed: ${res.status}`);
  }

  return body;
}

export async function loadPlayerState() {
  return apiFetch("/player-state", { method: "GET" });
}

export async function savePlayerState(payload: Record<string, unknown>) {
  return apiFetch("/player-state", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logoutPlayerSession() {
  try {
    await apiFetch("/session/logout", { method: "POST" });
  } finally {
    safeRemoveItem("inet-session-token");
  }
}