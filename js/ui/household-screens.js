// Screens for logged-in people:
// - setup: create a household or join one with an invite code
// - household: household name, members, invite button, your display name

import { show, esc, busy, toast, pendingInvite } from "./dom.js";
import { createHousehold, joinHousehold, createInviteLink, listMembers, updateDisplayName } from "../household.js";
import { logOut } from "../auth.js";

// ---------- Setup: no household yet ----------

export function showHouseholdSetup(user, onDone) {
  const code = pendingInvite.get() || "";
  const app = show(`
    <header class="brand"><h1>Welcome</h1><p class="muted">Signed in as ${esc(user.email)}</p></header>

    <form class="card form" id="join">
      <h2>Join your household</h2>
      <p class="muted">Got an invite link or code from someone at home?</p>
      <label>Invite code <input id="join-code" required autocapitalize="characters" value="${esc(code)}" placeholder="e.g. 7F3A9C01BE"></label>
      <label>Your name <input id="join-name" required maxlength="40" autocomplete="given-name" placeholder="How others see you"></label>
      <p class="error" role="alert"></p>
      <button class="btn primary" type="submit">Join household</button>
    </form>

    <form class="card form" id="create">
      <h2>Or start a new household</h2>
      <label>Household name <input id="create-hh" required maxlength="60" placeholder="e.g. The Levi home"></label>
      <label>Your name <input id="create-name" required maxlength="40" autocomplete="given-name"></label>
      <p class="error" role="alert"></p>
      <button class="btn" type="submit">Create household</button>
    </form>

    <p class="center"><button class="link" type="button" id="logout">Log out</button></p>
  `);

  const join = app.querySelector("#join");
  join.onsubmit = (e) => {
    e.preventDefault();
    busy(join, async () => {
      const name = await joinHousehold(join.elements["join-code"].value, join.elements["join-name"].value.trim());
      pendingInvite.clear();
      toast(`Welcome to ${name}!`);
      onDone();
    });
  };

  const create = app.querySelector("#create");
  create.onsubmit = (e) => {
    e.preventDefault();
    busy(create, async () => {
      await createHousehold(create.elements["create-hh"].value.trim(), create.elements["create-name"].value.trim());
      toast("Household created");
      onDone();
    });
  };

  app.querySelector("#logout").onclick = logOut;
  // Put the cursor in the right place: name if we already have a code.
  join.elements[code ? "join-name" : "join-code"].focus();
}

// ---------- Household page (opened from the inventory's "Household" button) ----------

export async function showHousehold(user, me, onBack) {
  const app = show(`
    <button class="link back" type="button" id="back">← Back to pantry</button>
    <header class="brand">
      <p class="eyebrow">${esc(me.household_name)}</p>
      <h1>Hi, ${esc(me.display_name)}</h1>
    </header>

    <section class="card">
      <div class="row-between"><h2>Household</h2><button class="btn small" type="button" id="invite">Invite someone</button></div>
      <div id="inviteBox"></div>
      <ul class="members" id="members"><li class="muted">Loading members…</li></ul>
    </section>

    <form class="card form" id="rename">
      <h2>Your name</h2>
      <label>Shown to others as <input id="display-name" required maxlength="40" value="${esc(me.display_name)}"></label>
      <p class="error" role="alert"></p>
      <button class="btn" type="submit">Save</button>
    </form>

    <p class="center muted">${esc(user.email)} · <button class="link" type="button" id="logout">Log out</button></p>
  `);

  const renderMembers = async () => {
    try {
      const members = await listMembers(me.household_id);
      app.querySelector("#members").innerHTML = members.map((m) => `
        <li>
          <span class="avatar" aria-hidden="true">${esc(m.display_name.charAt(0).toUpperCase())}</span>
          <span>${esc(m.display_name)}${m.user_id === user.id ? " <span class='muted'>(you)</span>" : ""}</span>
          ${m.role === "owner" ? `<span class="pill">Owner</span>` : ""}
        </li>`).join("");
    } catch (err) {
      app.querySelector("#members").innerHTML = `<li class="error">${esc(err.message)}</li>`;
    }
  };
  renderMembers();

  app.querySelector("#invite").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const { code, link } = await createInviteLink();
      app.querySelector("#inviteBox").innerHTML = `
        <div class="invite">
          <p>Send this link to someone at home. It works for 7 days.</p>
          <input id="inviteLink" readonly value="${esc(link)}" aria-label="Invite link">
          <p class="muted">Or tell them the code: <strong class="mono">${esc(code)}</strong></p>
          <div class="row">
            <button class="btn primary small" type="button" id="share">Share</button>
            <button class="btn small" type="button" id="copy">Copy link</button>
          </div>
        </div>`;
      const shareText = `Join our Home Pantry: ${link}`;
      const shareBtn = app.querySelector("#share");
      if (!navigator.share) shareBtn.hidden = true;
      shareBtn.onclick = () => navigator.share({ title: "Home Pantry", text: shareText }).catch(() => {});
      app.querySelector("#copy").onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast("Link copied"); }
        catch { const i = app.querySelector("#inviteLink"); i.select(); toast("Select and copy the link"); }
      };
    } catch (err) {
      toast(err.message);
    } finally {
      e.target.disabled = false;
    }
  };

  const rename = app.querySelector("#rename");
  rename.onsubmit = (e) => {
    e.preventDefault();
    busy(rename, async () => {
      const name = rename.elements["display-name"].value.trim();
      await updateDisplayName(me.household_id, user.id, name);
      me.display_name = name;
      app.querySelector("h1").textContent = `Hi, ${name}`;
      toast("Name saved");
      renderMembers();
    });
  };

  app.querySelector("#logout").onclick = logOut;
  app.querySelector("#back").onclick = onBack;
}
