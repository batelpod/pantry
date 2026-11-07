// App settings.
//
// SUPABASE_URL and SUPABASE_ANON_KEY are filled in during step 2.
// The "anon" key is designed to be public: it's safe in this file because
// the database's security rules decide what each logged-in user can see.
// NEVER put the "service_role" key here.

export const SUPABASE_URL = "";      // e.g. "https://abcdxyz.supabase.co"
export const SUPABASE_ANON_KEY = ""; // long key starting with "eyJ..."

// Storage spots shown in the app, in display order.
export const PLACES = ["Pantry", "Fridge", "Freezer", "Spices", "Cleaning", "Bathroom", "Other"];
