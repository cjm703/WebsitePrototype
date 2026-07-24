import { safeGetItem, safeRemoveItem } from "@/app/components/safe-storage";
import { buildSupabasePublicHeaders, supabaseFunctionBase } from "./supabase-env";

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : undefined;
    this.body = body;
  }
}

function parseResponseBody(response: Response) {
  return response.json().catch(() => ({} as Record<string, unknown>));
}

export function buildSessionHeaders(includeJson = true): Record<string, string> {
  const sessionToken = safeGetItem("inet-session-token") || "";
  return {
    ...buildSupabasePublicHeaders(includeJson),
    "X-Session-Token": sessionToken,
  };
}

export async function sessionApiFetch(path: string, init: RequestInit = {}) {
  const sessionToken = safeGetItem("inet-session-token");
  if (!sessionToken) {
    throw new ApiRequestError("Missing player session token", 401);
  }

  const response = await fetch(`${supabaseFunctionBase}${path}`, {
    ...init,
    headers: {
      ...buildSessionHeaders(init.body != null),
      ...(init.headers ?? {}),
    },
  });
  const body = await parseResponseBody(response);

  if (response.status === 401) {
    const message =
      typeof body?.error === "string" ? body.error : "Player session expired";
    if (/session|expired|revoked|invalid session|missing session token/i.test(message)) {
      safeRemoveItem("inet-session-token");
    }
    throw new ApiRequestError(message, response.status, body);
  }

  if (!response.ok) {
    throw new ApiRequestError(
      typeof body?.error === "string" ? body.error : `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  return body;
}

export async function publicApiFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseFunctionBase}${path}`, {
    ...init,
    headers: {
      ...buildSupabasePublicHeaders(init.body != null),
      ...(init.headers ?? {}),
    },
  });
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiRequestError(
      typeof body?.error === "string" ? body.error : `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  return body;
}
