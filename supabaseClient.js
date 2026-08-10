import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check your .env file.");
}

export const supabase = createClient(url, anonKey);

// Base URL for calling the create-user Edge Function
export const functionsUrl = `${url.replace(".supabase.co", ".functions.supabase.co")}`;
