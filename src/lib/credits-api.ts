import { ApiRequestError, sessionApiFetch } from "./api-client";

const CREDIT_SERVICE_RETRY_DELAY_MS = 60_000;
let creditsServiceRetryAfter = 0;

function creditsServiceUnavailableError() {
  return new ApiRequestError(
    "Credits service update has not been deployed yet.",
    503,
    { code: "CREDITS_SERVICE_UNAVAILABLE" },
  );
}

function isMissingCreditsRoute(error: unknown) {
  return error instanceof ApiRequestError
    && (error.status === 404 || error.status === 405)
    && /^Request failed: (404|405)$/.test(error.message);
}

async function creditsApiFetch(path: string, init: RequestInit = {}) {
  if (Date.now() < creditsServiceRetryAfter) throw creditsServiceUnavailableError();
  try {
    return await sessionApiFetch(path, init);
  } catch (error) {
    if (isMissingCreditsRoute(error)) {
      creditsServiceRetryAfter = Date.now() + CREDIT_SERVICE_RETRY_DELAY_MS;
      throw creditsServiceUnavailableError();
    }
    throw error;
  }
}

export function isCreditsServiceUnavailable(error: unknown) {
  return error instanceof ApiRequestError && error.code === "CREDITS_SERVICE_UNAVAILABLE";
}

export interface CreditAccount {
  playerId: string;
  playerName: string;
  balance: number;
  currency: "CR";
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  playerId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  category: string;
  source: string;
  reason: string;
  actorId: string;
  relatedId: string;
  reversalOf: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreditAccountDetail {
  account: CreditAccount;
  transactions: CreditTransaction[];
}

export function creditRequestId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}

export async function loadCreditAccount(playerId?: string, before?: string): Promise<CreditAccountDetail> {
  const params = new URLSearchParams({ limit: "100" });
  if (playerId) params.set("playerId", playerId);
  if (before) params.set("before", before);
  return creditsApiFetch(`/credits/account?${params.toString()}`, { method: "GET" }) as Promise<CreditAccountDetail>;
}

export async function loadCreditAccounts(): Promise<CreditAccount[]> {
  const body = await creditsApiFetch("/credits/accounts", { method: "GET" });
  return Array.isArray(body?.accounts) ? body.accounts as CreditAccount[] : [];
}

export async function adjustCredits(input: {
  playerId?: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}) {
  return creditsApiFetch("/credits/adjust", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || creditRequestId("credit-adjustment"),
    }),
  }) as Promise<{ ok: true; account: CreditAccount; transaction: CreditTransaction; duplicate: boolean }>;
}

export async function reverseCreditTransaction(input: {
  transactionId: string;
  reason: string;
  idempotencyKey?: string;
}) {
  return creditsApiFetch("/credits/reverse", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || creditRequestId(`credit-reversal:${input.transactionId}`),
    }),
  }) as Promise<{ ok: true; account: CreditAccount; transaction: CreditTransaction; duplicate: boolean }>;
}

export async function purchaseCommerceCart(cart: Array<{ shopId: string; itemId: string; quantity: number }>, idempotencyKey: string) {
  return creditsApiFetch("/commerce/purchase", {
    method: "POST",
    body: JSON.stringify({ cart, idempotencyKey }),
  }) as Promise<{
    ok: true;
    duplicate: boolean;
    orderId: string;
    total: number;
    account: CreditAccount;
    transaction?: CreditTransaction;
    grantedItems: Record<string, unknown>[];
  }>;
}

export async function saveCommerceCatalog<T extends { id: string }>(
  changes: T[],
  deletions: Array<{ id: string; revision: number }>,
) {
  return creditsApiFetch("/commerce/admin/catalog/save", {
    method: "POST",
    body: JSON.stringify({ changes, deletions }),
  }) as Promise<{ ok: true; shops: T[] }>;
}
