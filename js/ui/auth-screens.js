// Screens for people who aren't logged in:
// log in, sign up, forgot password, and set a new password (after the reset email).

import { show, esc, busy, pendingInvite } from "./dom.js";
import { logIn, signUp, sendPasswordReset, setNewPassword } from "../auth.js";

const inviteNote = () => pendingInvite.get()
  ? `<p class="banner">You've been invited to a household. Log in or create an account to join.</p>` : "";

export function showLogIn() {
  const app = show(`
    <header class="brand"><h1>Home Pantry</h1><p class="muted">Log in to see your household's pantry.</p></header>
    ${inviteNote()}
    <form class="card form" id="login">
      <label>Email <input id="email" type="email" autocomplete="email" required></label>
      <label>Password <input id="password" type="password" autocomplete="current-password" required></label>
      <p class="error" role="alert"></p>
      <button class="btn primary" type="submit">Log in</button>
      <button class="link" type="button" id="forgot">Forgot password?</button>
    </form>
    <p class="center muted">New here? <button class="link" type="button" id="toSignUp">Create an account</button></p>
  `);
  const form = app.querySelector("#login");
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form, () => logIn(form.email.value.trim(), form.password.value));
    // On success, app.js notices the login and shows the next screen.
  };
  app.querySelector("#toSignUp").onclick = showSignUp;
  app.querySelector("#forgot").onclick = () => showForgot(form.email.value.trim());
}

export function showSignUp() {
  const app = show(`
    <header class="brand"><h1>Create account</h1><p class="muted">Each person in the house gets their own account.</p></header>
    ${inviteNote()}
    <form class="card form" id="signup">
      <label>Email <input id="email" type="email" autocomplete="email" required></label>
      <label>Password <input id="password" type="password" autocomplete="new-password" minlength="8" required>
        <small class="muted">At least 8 characters.</small></label>
      <p class="error" role="alert"></p>
      <button class="btn primary" type="submit">Create account</button>
    </form>
    <p class="center muted">Already have an account? <button class="link" type="button" id="toLogIn">Log in</button></p>
  `);
  const form = app.querySelector("#signup");
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form, async () => {
      const email = form.email.value.trim();
      const { needsConfirmation } = await signUp(email, form.password.value);
      if (needsConfirmation) showCheckEmail(email, "confirm your account");
    });
  };
  app.querySelector("#toLogIn").onclick = showLogIn;
}

function showForgot(prefill = "") {
  const app = show(`
    <header class="brand"><h1>Reset password</h1><p class="muted">We'll email you a link to choose a new one.</p></header>
    <form class="card form" id="forgot">
      <label>Email <input id="email" type="email" autocomplete="email" required value="${esc(prefill)}"></label>
      <p class="error" role="alert"></p>
      <button class="btn primary" type="submit">Send reset link</button>
    </form>
    <p class="center"><button class="link" type="button" id="back">Back to log in</button></p>
  `);
  const form = app.querySelector("#forgot");
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form, async () => {
      await sendPasswordReset(form.email.value.trim());
      showCheckEmail(form.email.value.trim(), "reset your password");
    });
  };
  app.querySelector("#back").onclick = showLogIn;
}

function showCheckEmail(email, purpose) {
  const app = show(`
    <header class="brand"><h1>Check your email</h1></header>
    <section class="card">
      <p>We sent a link to <strong>${esc(email)}</strong>. Open it on this phone to ${esc(purpose)}.</p>
      <p class="muted">Can't find it? Look in spam, or wait a minute and try again.</p>
    </section>
    <p class="center"><button class="link" type="button" id="back">Back to log in</button></p>
  `);
  app.querySelector("#back").onclick = showLogIn;
}

// Shown when someone opens the link from a password-reset email.
export function showSetPassword(onDone) {
  const app = show(`
    <header class="brand"><h1>Choose a new password</h1></header>
    <form class="card form" id="setpw">
      <label>New password <input id="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="error" role="alert"></p>
      <button class="btn primary" type="submit">Save password</button>
    </form>
  `);
  const form = app.querySelector("#setpw");
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form, async () => { await setNewPassword(form.password.value); onDone(); });
  };
}
