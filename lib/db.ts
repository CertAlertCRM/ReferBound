import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key.
// Never import this file from a client component.
let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches fetch and can cache GET responses in its Data Cache,
      // which serves stale query results to server components. Force every
      // Supabase request to bypass that cache — this data must always be live.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return _client;
}

export const DOCS_BUCKET = "docs";
