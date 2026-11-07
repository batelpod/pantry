// Items: load, add, edit, delete, change quantity, and watch for live changes.
// The rules (only your household; who changed it) live in supabase/02-items.sql.

import { supabase } from "./supabase.js";

const COLUMNS =
  "id, household_id, name, category, location, qty, unit, min_qty, expires_on, barcode, photo_path, created_at, updated_at, updated_by";

function check(error) {
  if (error) throw new Error(error.message || "Something went wrong. Please try again.");
}

export async function listItems(householdId) {
  const { data, error } = await supabase
    .from("items").select(COLUMNS).eq("household_id", householdId).order("name");
  check(error);
  return data;
}

// `fields` = { name, category, location, qty, unit, min_qty, expires_on }
export async function addItem(householdId, fields) {
  const { data, error } = await supabase
    .from("items").insert({ ...fields, household_id: householdId }).select(COLUMNS).single();
  check(error);
  return data;
}

export async function updateItem(id, fields) {
  const { data, error } = await supabase
    .from("items").update(fields).eq("id", id).select(COLUMNS).single();
  check(error);
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  check(error);
}

// Add `delta` (e.g. +1, -2) to an item's quantity. Returns the updated item.
export async function adjustQty(id, delta) {
  const { data, error } = await supabase.rpc("adjust_qty", { p_item: id, p_delta: delta });
  check(error);
  return data;
}

// Call onUpsert(item) when an item is added or changed, onDelete(id) when one is removed,
// by anyone in the household. Returns a function that stops watching.
export function watchItems(householdId, onUpsert, onDelete) {
  const mine = { schema: "public", table: "items", filter: `household_id=eq.${householdId}` };
  const channel = supabase
    .channel(`items:${householdId}`)
    .on("postgres_changes", { event: "INSERT", ...mine }, (p) => onUpsert(p.new))
    .on("postgres_changes", { event: "UPDATE", ...mine }, (p) => onUpsert(p.new))
    // Supabase can't filter delete events by household; security rules still
    // apply, and we ignore ids we don't have.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "items" }, (p) => onDelete(p.old.id))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
