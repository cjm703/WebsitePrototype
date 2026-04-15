const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const rawSupabasePublicKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "",
).trim();

if (!rawSupabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL in frontend environment");
}

if (!rawSupabasePublicKey) {
  throw new Error(
    "Missing VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY in frontend environment",
  );
}

export const supabaseUrl = rawSupabaseUrl;
export const supabasePublicKey = rawSupabasePublicKey;
export const supabaseFunctionBase = `${supabaseUrl}/functions/v1/make-server-8a5950b5`;

export function buildSupabasePublicHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${supabasePublicKey}`,
    apikey: supabasePublicKey,
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}
