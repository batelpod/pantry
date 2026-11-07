// The main screen: everything in the house, grouped by place.
//
//  - Search box and place filters (sticky at the top while scrolling)
//  - Summary: how many items, how many to buy, how many expire soon (tap to filter)
//  - Each row: name, tags (low / out / expiring), "updated by … · time ago", − / + buttons
//  - "+ Add item" button, and tap an item's name to edit or delete it
//  - Live: changes by others in the household appear right away

import { show, esc, toast } from "./dom.js";
import { listItems, addItem, updateItem, deleteItem, adjustQty, watchItems } from "../items.js";
import { listMembers } from "../household.js";
import { PLACES } from "../config.js";

const UNITS = ["pcs", "packs", "cans", "bottles", "jars", "boxes", "bags", "rolls", "kg", "g", "L", "ml"];
const SOON_DAYS = 7;   // "expiring soon" = within this many days

// Everything this screen knows, in one place.
const state = {
  user: null, me: null,
  items: new Map(),     // id → item from the database
  names: new Map(),     // user id → display name
  pending: new Map(),   // id → { delta, timer }: taps not sent yet
  inflight: new Map(),  // id → delta sent, waiting for the answer
  q: "", place: "All", view: "all",  // view: all | low | soon
  loaded: false,
  stopWatching: null,
};

// ---------- Small helpers ----------

const num = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// Quantity on screen = database value + taps on their way.
const shownQty = (it) =>
  Math.max(0, Number(it.qty) + (state.pending.get(it.id)?.delta || 0) + (state.inflight.get(it.id) || 0));

const isOut = (it) => shownQty(it) <= 0;
const isLow = (it) => shownQty(it) <= Number(it.min_qty);

function daysLeft(it) {
  if (!it.expires_on) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(it.expires_on + "T00:00:00") - today) / 86400000);
}
const expiresSoon = (it) => { const d = daysLeft(it); return d !== null && d <= SOON_DAYS; };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function timeAgo(iso) {
  const secs = (new Date(iso) - Date.now()) / 1000;
  const steps = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  return "just now";
}

function whoDidIt(it) {
  if (it.updated_by === state.user.id) return "you";
  return state.names.get(it.updated_by) || "someone";
}

// ---------- Screen ----------

export async function showInventory(user, me, { onHousehold }) {
  stopInventory();
  Object.assign(state, { user, me, q: "", place: "All", view: "all", loaded: false });
  state.items.clear();

  const app = show(`
    <header class="topbar">
      <div class="brand">
        <p class="eyebrow">${esc(me.household_name)}</p>
        <h1>Pantry</h1>
      </div>
      <button class="btn small" type="button" id="household" aria-label="Household and settings">Household</button>
    </header>

    <div class="stats">
      <button class="stat" type="button" data-view="all"><b id="nAll">–</b><span>items</span></button>
      <button class="stat warn" type="button" data-view="low"><b id="nLow">–</b><span>to buy</span></button>
      <button class="stat crit" type="button" data-view="soon"><b id="nSoon">–</b><span>expire soon</span></button>
    </div>

    <div class="toolbar">
      <input class="search" id="search" type="search" placeholder="Search…" aria-label="Search items" autocomplete="off">
      <div class="chips" id="places" role="group" aria-label="Filter by place"></div>
    </div>

    <div id="list"><p class="empty">Loading…</p></div>

    <button class="fab" type="button" id="add">+ Add item</button>
    <div id="sheet"></div>
  `);

  app.querySelector("#household").onclick = () => { stopInventory(); onHousehold(); };
  app.querySelector("#add").onclick = () => openSheet(null);
  app.querySelector("#search").oninput = (e) => { state.q = e.target.value; renderList(); };
  app.querySelector(".stats").onclick = (e) => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    state.view = state.view === b.dataset.view ? "all" : b.dataset.view;
    renderList();
  };
  app.querySelector("#places").onclick = (e) => {
    const b = e.target.closest("[data-place]"); if (!b) return;
    state.place = b.dataset.place; renderList();
  };
  app.querySelector("#list").onclick = onListClick;

  await load();

  // Live updates from others in the household.
  state.stopWatching = watchItems(
    me.household_id,
    (item) => { if (!state.items.has(item.id)) loadNames(); state.items.set(item.id, item); renderList(); },
    (id) => { if (state.items.delete(id)) renderList(); },
  );
  // Coming back to the app after a while: reload in case we missed changes.
  document.addEventListener("visibilitychange", onVisible);
  // Keep "2 minutes ago" fresh.
  state.clock = setInterval(renderList, 60000);
}

// Stop live updates (called when leaving this screen or logging out).
export function stopInventory() {
  state.stopWatching?.(); state.stopWatching = null;
  clearInterval(state.clock);
  document.removeEventListener("visibilitychange", onVisible);
  for (const p of state.pending.values()) clearTimeout(p.timer);
  state.pending.clear(); state.inflight.clear();
}

function onVisible() { if (document.visibilityState === "visible") load(); }

async function loadNames() {
  try {
    const members = await listMembers(state.me.household_id);
    state.names = new Map(members.map((m) => [m.user_id, m.display_name]));
    renderList();
  } catch { /* names are a nice-to-have; keep going */ }
}

async function load() {
  try {
    const [items] = await Promise.all([listItems(state.me.household_id), loadNames()]);
    state.items = new Map(items.map((it) => [it.id, it]));
    state.loaded = true;
  } catch (err) {
    document.getElementById("list").innerHTML =
      `<p class="empty">Couldn't load the pantry: ${esc(err.message)}<br><button class="btn small" type="button" onclick="location.reload()">Try again</button></p>`;
    return;
  }
  renderList();
}

// ---------- List ----------

function visibleItems() {
  const q = state.q.trim().toLowerCase();
  return [...state.items.values()].filter((it) =>
    (state.place === "All" || (it.location || "Other") === state.place) &&
    (state.view !== "low" || isLow(it)) &&
    (state.view !== "soon" || expiresSoon(it)) &&
    (!q || `${it.name} ${it.category || ""}`.toLowerCase().includes(q)));
}

function renderList() {
  const list = document.getElementById("list");
  if (!list || !state.loaded) return;
  const all = [...state.items.values()];

  // Summary numbers + which one is selected
  document.getElementById("nAll").textContent = all.length;
  document.getElementById("nLow").textContent = all.filter(isLow).length;
  document.getElementById("nSoon").textContent = all.filter(expiresSoon).length;
  document.querySelectorAll(".stat").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.view === state.view && state.view !== "all")));

  // Place chips: only places that have items
  const counts = {};
  all.forEach((it) => { const p = it.location || "Other"; counts[p] = (counts[p] || 0) + 1; });
  const places = ["All", ...PLACES.filter((p) => counts[p]), ...Object.keys(counts).filter((p) => !PLACES.includes(p))];
  if (!places.includes(state.place)) state.place = "All";
  document.getElementById("places").innerHTML = places.map((p) =>
    `<button class="chip" type="button" data-place="${esc(p)}" aria-pressed="${state.place === p}">${esc(p)}${p === "All" ? "" : ` <span>${counts[p]}</span>`}</button>`).join("");

  if (!all.length) {
    list.innerHTML = `<div class="empty"><strong>Nothing here yet.</strong><br>Tap “+ Add item” to log the first thing on your shelves.</div>`;
    return;
  }
  const items = visibleItems();
  if (!items.length) {
    list.innerHTML = `<p class="empty">Nothing matches. Try another place or clear the search.</p>`;
    return;
  }

  // Group by place, in PLACES order; low items first, then A→Z.
  const groups = new Map();
  items.forEach((it) => {
    const p = it.location || "Other";
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(it);
  });
  const order = [...groups.keys()].sort((a, b) => (PLACES.indexOf(a) + 1 || 99) - (PLACES.indexOf(b) + 1 || 99));

  list.innerHTML = order.map((place) => {
    const rows = groups.get(place)
      .sort((a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name))
      .map(rowHtml).join("");
    return `<section class="group"><h2>${esc(place)}</h2><ul class="items">${rows}</ul></section>`;
  }).join("");
}

function rowHtml(it) {
  const tags = [];
  if (isOut(it)) tags.push(`<span class="tag crit">Out</span>`);
  else if (isLow(it)) tags.push(`<span class="tag warn">Low</span>`);
  const d = daysLeft(it);
  if (d !== null && d < 0) tags.push(`<span class="tag crit">Expired</span>`);
  else if (d === 0) tags.push(`<span class="tag crit">Expires today</span>`);
  else if (d !== null && d <= SOON_DAYS) tags.push(`<span class="tag warn">Expires in ${d} day${d === 1 ? "" : "s"}</span>`);

  const status = isOut(it) ? "out" : isLow(it) ? "low" : "";
  return `
    <li class="item ${status}">
      <button class="item-main" type="button" data-edit="${esc(it.id)}">
        <strong>${esc(it.name)}</strong>
        <span class="item-meta">${it.category ? `<span>${esc(it.category)}</span>` : ""}${tags.join("")}</span>
        <span class="item-who">Updated by ${esc(whoDidIt(it))} · ${esc(timeAgo(it.updated_at))}</span>
      </button>
      <div class="stepper">
        <button type="button" data-delta="-1" data-id="${esc(it.id)}" aria-label="One less ${esc(it.name)}">−</button>
        <span class="qty"><b>${esc(num(shownQty(it)))}</b><small>${esc(it.unit)}</small></span>
        <button type="button" data-delta="1" data-id="${esc(it.id)}" aria-label="One more ${esc(it.name)}">+</button>
      </div>
    </li>`;
}

function onListClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.delta) bump(b.dataset.id, Number(b.dataset.delta));
  else if (b.dataset.edit) openSheet(state.items.get(b.dataset.edit));
}

// ---------- + / − : update the screen now, send to the database after a short pause ----------

function bump(id, delta) {
  const it = state.items.get(id); if (!it) return;
  if (delta < 0 && shownQty(it) <= 0) return;
  const p = state.pending.get(id) || { delta: 0, timer: null };
  p.delta += delta;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => send(id), 600);   // several quick taps → one save
  state.pending.set(id, p);
  renderList();
}

async function send(id) {
  const p = state.pending.get(id); if (!p) return;
  state.pending.delete(id);
  if (!p.delta) return;
  state.inflight.set(id, (state.inflight.get(id) || 0) + p.delta);
  try {
    const row = await adjustQty(id, p.delta);
    if (row) state.items.set(id, row);
  } catch (err) {
    toast("Couldn't save the change: " + err.message);
  } finally {
    const left = (state.inflight.get(id) || 0) - p.delta;
    left ? state.inflight.set(id, left) : state.inflight.delete(id);
    renderList();
  }
}

// ---------- Add / edit sheet ----------

function openSheet(item) {
  const it = item || {
    name: "", category: "", location: state.place !== "All" ? state.place : "Pantry",
    qty: 1, unit: "pcs", min_qty: 1, expires_on: "",
  };
  const categories = [...new Set([...state.items.values()].map((x) => x.category).filter(Boolean))].sort();
  const placeOptions = [...new Set([...PLACES, it.location])]
    .map((p) => `<option${p === it.location ? " selected" : ""}>${esc(p)}</option>`).join("");

  const host = document.getElementById("sheet");
  host.innerHTML = `
    <div class="overlay" id="overlay">
      <form class="sheet form" id="itemForm" autocomplete="off" aria-labelledby="sheetTitle">
        <h2 id="sheetTitle">${item ? "Edit item" : "Add item"}</h2>
        <label>Name <input id="f-name" required maxlength="80" value="${esc(it.name)}" placeholder="e.g. Basmati rice"></label>
        <div class="two">
          <label>Place <select id="f-location">${placeOptions}</select></label>
          <label>Category <input id="f-category" maxlength="40" list="catList" value="${esc(it.category || "")}" placeholder="e.g. Grains"></label>
        </div>
        <div class="two">
          <label>Quantity <input id="f-qty" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.qty))}"></label>
          <label>Unit <input id="f-unit" required maxlength="20" list="unitList" value="${esc(it.unit)}"></label>
        </div>
        <div class="two">
          <label>Buy more at or below <input id="f-min" type="number" inputmode="decimal" min="0" step="any" value="${esc(num(it.min_qty))}"></label>
          <label>Expires <input id="f-expires" type="date" value="${esc(it.expires_on || "")}"></label>
        </div>
        ${item ? `<p class="muted small">Last updated by ${esc(whoDidIt(it))} · ${esc(timeAgo(it.updated_at))}</p>` : ""}
        <p class="error" role="alert"></p>
        <div class="sheet-actions">
          ${item ? `<button class="btn danger" type="button" id="delete">Delete</button>` : ""}
          <span class="spacer"></span>
          <button class="btn" type="button" id="cancel">Cancel</button>
          <button class="btn primary" type="submit">${item ? "Save" : "Add"}</button>
        </div>
        <datalist id="catList">${categories.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <datalist id="unitList">${UNITS.map((u) => `<option value="${esc(u)}">`).join("")}</datalist>
      </form>
    </div>`;

  const form = host.querySelector("#itemForm");
  const f = (id) => form.elements[id];
  const close = () => { host.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  host.querySelector("#overlay").onclick = (e) => { if (e.target.id === "overlay") close(); };
  host.querySelector("#cancel").onclick = close;
  if (!item) f("f-name").focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fields = {
      name: f("f-name").value.trim(),
      location: f("f-location").value,
      category: f("f-category").value.trim() || null,
      qty: Math.max(0, Number(f("f-qty").value) || 0),
      unit: f("f-unit").value.trim() || "pcs",
      min_qty: Math.max(0, Number(f("f-min").value) || 0),
      expires_on: f("f-expires").value || null,
    };
    if (!fields.name) return;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const saved = item ? await updateItem(item.id, fields) : await addItem(state.me.household_id, fields);
      state.items.set(saved.id, saved);
      // Any taps not yet sent for this item are replaced by the typed quantity.
      state.pending.delete(saved.id);
      close(); renderList();
      toast(item ? "Saved" : `Added ${saved.name}`);
    } catch (err) {
      form.querySelector(".error").textContent = err.message;
      button.disabled = false;
    }
  };

  if (item) {
    let armed = false;
    host.querySelector("#delete").onclick = async (e) => {
      if (!armed) { armed = true; e.target.textContent = "Tap again to delete"; return; }
      e.target.disabled = true;
      try {
        await deleteItem(item.id);
        state.items.delete(item.id);
        close(); renderList();
        toast(`Deleted ${item.name}`);
      } catch (err) {
        form.querySelector(".error").textContent = err.message;
        e.target.disabled = false;
      }
    };
  }
}
