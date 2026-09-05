import { sessionApiFetch } from "./api-client";

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
  return sessionApiFetch(`/credits/account?${params.toString()}`, { method: "GET" }) as Promise<CreditAccountDetail>;
}

export async function loadCreditAccounts(): Promise<CreditAccount[]> {
  const body = await sessionApiFetch("/credits/accounts", { method: "GET" });
  return Array.isArray(body?.accounts) ? body.accounts as CreditAccount[] : [];
}

export async function adjustCredits(input: {
  playerId?: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}) {
  return sessionApiFetch("/credits/adjust", {
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
  return sessionApiFetch("/credits/reverse", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey || creditRequestId(`credit-reversal:${input.transactionId}`),
    }),
  }) as Promise<{ ok: true; account: CreditAccount; transaction: CreditTransaction; duplicate: boolean }>;
}

export async function purchaseCommerceCart(cart: Array<{ shopId: string; itemId: string; quantity: number }>, idempotencyKey: string) {
  return sessionApiFetch("/commerce/purchase", {
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
  return sessionApiFetch("/commerce/admin/catalog/save", {
    method: "POST",
    body: JSON.stringify({ changes, deletions }),
  }) as Promise<{ ok: true; shops: T[] }>;
}
