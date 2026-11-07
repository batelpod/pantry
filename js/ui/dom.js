// Small helpers shared by all screens.

// Escape text before putting it into HTML, so names like "<b>" show as text
// and can never inject code.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Replace what's on screen with new HTML.
export function show(html) {
  const app = document.getElementById("app");
  app.innerHTML = html;
  window.scrollTo(0, 0);
  return app;
}

// A short message at the bottom of the screen that disappears by itself.
export function toast(message) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());   // one at a time
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// Run an async action from a form: disables the button while working
// and shows any error message inside the form.
export async function busy(form, action) {
  const button = form.querySelector("button[type=submit]");
  const errorBox = form.querySelector(".error");
  if (errorBox) errorBox.textContent = "";
  if (button) button.disabled = true;
  try {
    await action();
  } catch (err) {
    if (errorBox) errorBox.textContent = err.message || "Something went wrong.";
    else toast(err.message || "Something went wrong.");
  } finally {
    if (button && button.isConnected) button.disabled = false;
  }
}

// Remember an invite code from the link until the person has logged in.
// (Browser storage can be blocked; then we simply ask for the code again.)
export const pendingInvite = {
  get() { try { return sessionStorage.getItem("pantry.invite"); } catch { return null; } },
  set(code) { try { sessionStorage.setItem("pantry.invite", code); } catch {} },
  clear() { try { sessionStorage.removeItem("pantry.invite"); } catch {} },
};
