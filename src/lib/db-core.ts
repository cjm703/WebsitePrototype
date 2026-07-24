import { sessionApiFetch } from "./api-client";

type Identifiable = { id: string };

const collectionSnapshots = new Map<string, Set<string>>();
const tagSnapshots = new Map<string, Set<string>>();

function encoded(value: string) {
  return encodeURIComponent(value);
}

function rememberIds(cache: Map<string, Set<string>>, key: string, rows: Identifiable[]) {
  cache.set(key, new Set(rows.map((row) => String(row.id))));
}

function deletedSinceLoad(
  cache: Map<string, Set<string>>,
  key: string,
  rows: Identifiable[],
) {
  const previous = cache.get(key);
  if (!previous) return [];
  const next = new Set(rows.map((row) => String(row.id)));
  return Array.from(previous).filter((id) => !next.has(id));
}

export async function listCollection<T extends Identifiable>(table: string): Promise<T[]> {
  const body = await sessionApiFetch(`/data/collection/${encoded(table)}`, {
    method: "GET",
  });
  const rows = Array.isArray(body?.rows) ? body.rows as T[] : [];
  rememberIds(collectionSnapshots, table, rows);
  return rows;
}

export async function replaceCollection<T extends Identifiable>(
  table: string,
  rows: T[],
): Promise<void> {
  const deleteIds = deletedSinceLoad(collectionSnapshots, table, rows);
  await sessionApiFetch(`/data/collection/${encoded(table)}/sync`, {
    method: "POST",
    body: JSON.stringify({ rows, deleteIds }),
  });
  rememberIds(collectionSnapshots, table, rows);
}

export async function loadPlayerDoc<T>(
  table: string,
  playerId: string,
  fallback: T,
): Promise<T> {
  const body = await sessionApiFetch(
    `/data/player-doc/${encoded(table)}/${encoded(playerId)}`,
    { method: "GET" },
  );
  return (body?.data as T | null | undefined) ?? fallback;
}

export async function savePlayerDoc<T>(
  table: string,
  playerId: string,
  data: T,
): Promise<void> {
  await sessionApiFetch(
    `/data/player-doc/${encoded(table)}/${encoded(playerId)}`,
    {
      method: "POST",
      body: JSON.stringify({ data }),
    },
  );
}

export async function listTagCollection<T extends Identifiable>(
  kind: "item" | "card" | "info" | "status" | "wiki",
): Promise<T[]> {
  const body = await sessionApiFetch(`/data/tags/${encoded(kind)}`, {
    method: "GET",
  });
  const rows = Array.isArray(body?.rows) ? body.rows as T[] : [];
  rememberIds(tagSnapshots, kind, rows);
  return rows;
}

export async function replaceTagCollection<T extends Identifiable>(
  kind: "item" | "card" | "info" | "status" | "wiki",
  rows: T[],
): Promise<void> {
  const deleteIds = deletedSinceLoad(tagSnapshots, kind, rows);
  await sessionApiFetch(`/data/tags/${encoded(kind)}/sync`, {
    method: "POST",
    body: JSON.stringify({ rows, deleteIds }),
  });
  rememberIds(tagSnapshots, kind, rows);
}

export async function loadSingletonDoc<T>(
  table: string,
  id: string,
  fallback: T,
): Promise<T> {
  const body = await sessionApiFetch(`/data/doc/${encoded(table)}/${encoded(id)}`, {
    method: "GET",
  });
  return (body?.data as T | null | undefined) ?? fallback;
}

export async function saveSingletonDoc<T>(
  table: string,
  id: string,
  data: T,
): Promise<void> {
  await sessionApiFetch(`/data/doc/${encoded(table)}/${encoded(id)}`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function deleteSingletonDoc(table: string, id: string): Promise<void> {
  await sessionApiFetch(`/data/doc/${encoded(table)}/${encoded(id)}`, {
    method: "DELETE",
  });
}
