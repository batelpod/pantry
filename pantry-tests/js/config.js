// App settings.
//
// The publishable key is designed to be public: it's safe in this file
// because the database's security rules (supabase/schema.sql) decide what
// each logged-in user can see. NEVER put the "secret" / "service_role" key here.

export const SUPABASE_URL = "https://yyqeisscqglobpaawssk.supabase.co";
export const SUPABASE_KEY = "sb_publishable_4Jx_6HTeBheKFYjhvngszA_F9Gu7T-k";

// Storage spots shown in the app, in display order.
export const PLACES = ["Pantry", "Fridge", "Freezer", "Spices", "Cleaning", "Bathroom", "Other"];
