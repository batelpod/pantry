// Households: create one, invite people, join with a code, list members.
// The rules (who may do what) live in the database: supabase/schema.sql.

import { supabase } from "./supabase.js";

// Throws a plain Error using the database's message (e.g. "This invite code is wrong…").
function check(error) {
  if (error) throw new Error(error.message || "Something went wrong. Please try again.");
}

// The current user's membership, or null if they haven't joined a household yet.
// Returns { household_id, display_name, role, household_name }.
export async function getMyMembership(userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, display_name, role, households(name)")
    .eq("user_id", userId)
    .maybeSingle();
  check(error);
  if (!data) return null;
  return { ...data, household_name: data.households?.name ?? "Our home" };
}

export async function createHousehold(name, displayName) {
  const { error } = await supabase.rpc("create_household", { p_name: name, p_display_name: displayName });
  check(error);
}

export async function joinHousehold(code, displayName) {
  const { data, error } = await supabase.rpc("join_household", { p_code: code, p_display_name: displayName });
  check(error);
  return data; // household name
}

// Returns an invite link like https://batelpod.github.io/pantry/?invite=7F3A9C01BE
export async function createInviteLink() {
  const { data: code, error } = await supabase.rpc("create_invite");
  check(error);
  return { code, link: `${location.origin}${location.pathname}?invite=${code}` };
}

export async function listMembers(householdId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, display_name, role, joined_at")
    .eq("household_id", householdId)
    .order("joined_at");
  check(error);
  return data;
}

export async function updateDisplayName(householdId, userId, displayName) {
  const { error } = await supabase
    .from("household_members")
    .update({ display_name: displayName })
    .eq("household_id", householdId)
    .eq("user_id", userId);
  check(error);
}
