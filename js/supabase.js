// The one shared connection to Supabase. Every other file imports `supabase` from here.
//
// The library loads from the jsDelivr CDN, pinned to an exact version so it
// never changes under us. To upgrade, change the version number and test.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,     // stay logged in after closing the app
    autoRefreshToken: true,
    detectSessionInUrl: true, // pick up the login from email links (confirm, reset)
  },
});
