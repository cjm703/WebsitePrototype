import { supabase } from "./supabaseClient";

type Row = { id: string; data: unknown; updated_at?: string };

export async function listCollection<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select("data")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => row.data as T);
}

export async function replaceCollection<T extends { id: string }>(
  table: string,
  rows: T[],
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("id");

  if (existingError) throw existingError;

  const nextIds = new Set(rows.map((r) => r.id));
  const existingIds = (existing ?? []).map((r: any) => String(r.id));
  const toDelete = existingIds.filter((id) => !nextIds.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .in("id", toDelete);

    if (deleteError) throw deleteError;
  }

  if (rows.length === 0) return;

  const payload: Row[] = rows.map((row) => ({
    id: row.id,
    data: row,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from(table)
    .upsert(payload, { onConflict: "id" });

  if (upsertError) throw upsertError;
}

export async function loadPlayerDoc<T>(
  table: string,
  playerId: string,
  fallback: T,
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select("data")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) throw error;
  return (data?.data as T | undefined) ?? fallback;
}

export async function savePlayerDoc<T>(
  table: string,
  playerId: string,
  data: T,
): Promise<void> {
  const { error } = await supabase.from(table).upsert(
    {
      player_id: playerId,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );

  if (error) throw error;
}

export async function listTagCollection<T>(kind: "item" | "card" | "info" | "status" | "wiki"): Promise<T[]> {
  const { data, error } = await supabase
    .from("app_tags")
    .select("data")
    .eq("kind", kind)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => row.data as T);
}

export async function replaceTagCollection<T extends { id: string }>(
  kind: "item" | "card" | "info" | "status" | "wiki",
  rows: T[],
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("app_tags")
    .select("id")
    .eq("kind", kind);

  if (existingError) throw existingError;

  const nextIds = new Set(rows.map((r) => `${kind}:${r.id}`));
  const existingIds = (existing ?? []).map((r: any) => String(r.id));
  const toDelete = existingIds.filter((id) => !nextIds.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("app_tags")
      .delete()
      .in("id", toDelete);

    if (deleteError) throw deleteError;
  }

  if (rows.length === 0) return;

  const payload = rows.map((row) => ({
    id: `${kind}:${row.id}`,
    kind,
    data: row,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("app_tags")
    .upsert(payload, { onConflict: "id" });

  if (upsertError) throw upsertError;
}