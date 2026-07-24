import { createClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "./supabase-env";

export const supabase = createClient(supabaseUrl, supabasePublicKey);

type SupabaseRealtimeChannel = ReturnType<typeof supabase.channel>;

export function removeSupabaseChannelSafely(channel: SupabaseRealtimeChannel) {
  let attempts = 0;
  const removeWhenSettled = () => {
    if (channel.state === "joining" && attempts < 220) {
      attempts += 1;
      globalThis.setTimeout(removeWhenSettled, 50);
      return;
    }
    void supabase.removeChannel(channel).catch(() => undefined);
  };
  removeWhenSettled();
}
