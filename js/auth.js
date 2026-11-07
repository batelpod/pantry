// Accounts: sign up, log in, log out, password reset.
// Each function returns data or throws an Error with a readable message.

import { supabase } from "./supabase.js";

// Where links in Supabase emails send people back to: this app's own address.
const appUrl = () => location.origin + location.pathname;

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { emailRedirectTo: appUrl() },
  });
  if (error) throw friendly(error);
  // If email confirmation is on (the default), there's no session yet:
  // the person must click the link in their email first.
  return { needsConfirmation: !data.session };
}

export async function logIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw friendly(error);
}

export async function logOut() {
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  if (error) throw friendly(error);
}

export async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw friendly(error);
}

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// Supabase's messages are mostly fine; this makes the common ones clearer.
// Always returns a standard Error, like the other data files do.
function friendly(error) {
  const m = error.message || "";
  if (/invalid login credentials/i.test(m)) return new Error("Email or password is wrong.");
  if (/email not confirmed/i.test(m)) return new Error("Please confirm your email first. Check your inbox for the link.");
  return new Error(m || "Something went wrong. Please try again.");
}
