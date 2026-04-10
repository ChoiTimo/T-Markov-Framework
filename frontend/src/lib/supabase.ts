/**
 * Supabase client — initialized from VITE_ env vars.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[SmartWAN] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth will not work."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
