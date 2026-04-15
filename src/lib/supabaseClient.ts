import { createClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseUrl } from "./supabase-env";

export const supabase = createClient(supabaseUrl, supabasePublicKey);
