// Starting point of the app. It decides which screen to show:
//
//   not logged in            → log in / sign up
//   opened a reset link      → choose a new password
//   logged in, no household  → create or join a household
//   logged in, in household  → home
//
// It re-checks whenever the login state changes (log in, log out, email link).

import { supabase } from "./supabase.js";
import { show, esc, toast, pendingInvite } from "./ui/dom.js";
import { showLogIn, showSetPassword } from "./ui/auth-screens.js";
import { showHouseholdSetup, showHome } from "./ui/household-screens.js";
import { getMyMembership } from "./household.js";

// 1. If the page was opened from an invite link (?invite=CODE), remember the
//    code and tidy the address bar.
const params = new URLSearchParams(location.search);
if (params.get("invite")) {
  pendingInvite.set(params.get("invite").toUpperCase());
  history.replaceState(null, "", location.pathname);
}

let resettingPassword = false;
let routing = false;

// 2. Pick and show the right screen.
async function route() {
  if (routing) return;
  routing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) return showLogIn();
    if (resettingPassword) {
      return showSetPassword(() => { resettingPassword = false; toast("Password updated"); route(); });
    }

    const me = await getMyMembership(user.id);
    if (!me) return showHouseholdSetup(user, route);

    if (pendingInvite.get()) {           // already in a household: ignore the invite
      pendingInvite.clear();
      toast("You're already in a household");
    }
    showHome(user, me);
  } catch (err) {
    show(`
      <section class="card">
        <h2>Can't reach the pantry</h2>
        <p class="muted">${esc(err.message || "Check your internet connection.")}</p>
        <button class="btn primary" type="button" onclick="location.reload()">Try again</button>
      </section>`);
  } finally {
    routing = false;
  }
}

// 3. React to login changes. Supabase also fires this once when the page loads.
//    (We call route() on the next tick: Supabase advises against awaiting its
//    own calls directly inside this callback.)
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") resettingPassword = true;
  if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
  setTimeout(route, 0);
});
