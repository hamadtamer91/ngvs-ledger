import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !publicKey) {
  // eslint-disable-next-line no-console
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — check your .env file.");
}

export const supabase = url && publicKey ? createClient(url, publicKey) : null;

// Base URL for calling Supabase Edge Functions.
export const functionsUrl = url ? `${url.replace(/\/$/, "")}/functions/v1` : "";
