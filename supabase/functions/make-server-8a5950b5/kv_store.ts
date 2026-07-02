import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const client = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

export const set = async (key: string, value: any): Promise<void> => {
  const supabase = client();
  const { error } = await supabase.from("kv_store_8a5950b5").upsert({
    key,
    value,
  });
  if (error) throw new Error(error.message);
};

export const get = async (key: string): Promise<any> => {
  const supabase = client();
  const { data, error } = await supabase
    .from("kv_store_8a5950b5")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.value;
};

export const del = async (key: string): Promise<void> => {
  const supabase = client();
  const { error } = await supabase
    .from("kv_store_8a5950b5")
    .delete()
    .eq("key", key);

  if (error) throw new Error(error.message);
};

export const mset = async (keys: string[], values: any[]): Promise<void> => {
  const supabase = client();
  const rows = keys.map((k, i) => ({ key: k, value: values[i] }));
  const { error } = await supabase.from("kv_store_8a5950b5").upsert(rows);
  if (error) throw new Error(error.message);
};

export const mget = async (keys: string[]): Promise<any[]> => {
  const supabase = client();
  const { data, error } = await supabase
    .from("kv_store_8a5950b5")
    .select("key, value")
    .in("key", keys);

  if (error) throw new Error(error.message);

  const map = new Map((data ?? []).map((row) => [row.key, row.value]));
  return keys.map((k) => map.get(k));
};

export const mdel = async (keys: string[]): Promise<void> => {
  const supabase = client();
  const { error } = await supabase
    .from("kv_store_8a5950b5")
    .delete()
    .in("key", keys);

  if (error) throw new Error(error.message);
};

export const getByPrefix = async (prefix: string): Promise<any[]> => {
  const supabase = client();
  const { data, error } = await supabase
    .from("kv_store_8a5950b5")
    .select("key, value")
    .like("key", prefix + "%");

  if (error) throw new Error(error.message);
  return data?.map((d) => d.value) ?? [];
};