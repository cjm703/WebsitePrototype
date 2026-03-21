/**
 * Auth utilities — thin API client for server-side auth code management.
 *
 * All hashing happens on the Supabase edge function server. The frontend
 * never sees, stores, or computes password hashes. Plain-text codes are
 * sent over HTTPS and hashed server-side before storage.
 * Cache-bust v3
 */

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8a5950b5/auth-codes`;

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

/** Resilient fetch wrapper with timeout and retry */
async function resilientFetch(
  url: string,
  opts: RequestInit,
  retries = 2,
  timeoutMs = 8000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: unknown) {
      const isLast = attempt === retries;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (isLast) throw err;
      // Brief backoff before retry (200ms, 600ms)
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      console.log(
        `Auth fetch retry ${attempt + 1}/${retries} for ${url}${isAbort ? " (timeout)" : ""}`
      );
    }
  }
  throw new Error("resilientFetch: unreachable");
}

/**
 * Set (or replace) the auth code for a profile.
 */
export async function setAuthCode(
  profileId: string,
  code: string
): Promise<void> {
  const res = await resilientFetch(`${API_BASE}/set`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ profileId, code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to set auth code for ${profileId}: ${body.error || res.statusText}`
    );
  }
}

/**
 * Verify a plain-text code against the server-stored hash.
 * Returns { valid, hasCode } and, on success, may also include playerId/sessionToken.
 * - If `hasCode` is false the profile has no code — always valid.
 */

export type VerifyAuthCodeResult = {
  valid: boolean;
  hasCode: boolean;
  playerId?: string;
  sessionToken?: string;
};

export async function verifyAuthCode(
  profileId: string,
  code: string
): Promise<VerifyAuthCodeResult> {
  const res = await resilientFetch(`${API_BASE}/verify`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ profileId, code }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to verify auth code for ${profileId}: ${body.error || res.statusText}`
    );
  }

  return res.json();
}

/**
 * Check which profiles have auth codes set (without exposing hashes).
 * Returns a map of profileId → boolean.
 */
export async function getAuthStatuses(
  profileIds: string[]
): Promise<Record<string, boolean>> {
  try {
    const res = await resilientFetch(`${API_BASE}/status`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ profileIds }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn(
        `Auth statuses non-OK response: ${body.error || res.statusText}`
      );
      // Graceful fallback: assume no codes set
      const fallback: Record<string, boolean> = {};
      profileIds.forEach((id) => (fallback[id] = false));
      return fallback;
    }
    const data = await res.json();
    return data.statuses;
  } catch (err) {
    // Network failure: return safe fallback so the app still works
    console.warn("Auth statuses unavailable (server unreachable), using fallback:", err);
    const fallback: Record<string, boolean> = {};
    profileIds.forEach((id) => (fallback[id] = false));
    return fallback;
  }
}

/**
 * Remove the auth code for a profile.
 */
export async function removeAuthCode(profileId: string): Promise<void> {
  const res = await resilientFetch(
    `${API_BASE}/${encodeURIComponent(profileId)}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to remove auth code for ${profileId}: ${body.error || res.statusText}`
    );
  }
}

/**
 * Migrate plain-text auth codes from localStorage to the server.
 * Called once on first load; the server skips profiles that already have codes.
 */
export async function migrateAuthCodes(
  codes: Array<{ profileId: string; plainCode: string }>
): Promise<number> {
  if (codes.length === 0) return 0;
  try {
    const res = await resilientFetch(`${API_BASE}/migrate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ codes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("Auth code migration failed:", body.error || res.statusText);
      return 0;
    }
    const data = await res.json();
    return data.migrated ?? 0;
  } catch (err) {
    console.warn("Auth code migration skipped (server unreachable):", err);
    return 0;
  }
}