// The shopping list.
//
//  - On the list: everything low or out (automatic) + anything added by hand
//  - "Add to list" box: search the pantry, or add something new
//  - Tick items as they go in the cart; set how many you're buying
//  - Ticks are shared live, so two people shopping see the same cart
//  - "Finish shopping" adds what's in the cart to the pantry and clears the list
//  - Copy / Share the list as text

import { show, esc, toast } from "./dom.js";
import { listItems, addItem, updateItem, finishShopping, watchItems } from "../items.js";
import { num, onShoppingList, suggestedBuy, isLowQty } from "./format.js";
import { PLACES } from "../config.js";

const state = { me: null, items: new Map(), stopWatching: null, saveTimers: new Map(), finishing: false };

export async function showShopping(user, me, { onBack }) {
  stopShopping();
  Object.assign(state, { me, items: new Map(), finishing: false });

  const app = show(`
    <button class="link back" type="button" id="back">← Back to pantry</button>
    <header class="brand">
      <p class="eyebrow">${esc(me.household_name)}</p>
      <h1>Shopping list</h1>
    </header>

    <form class="addbar" id="addForm" autocomplete="off">
      <input class="search" id="addInput" list="pantryNames" placeholder="Add to list…" aria-label="Add something to the shopping list">
      <button class="btn primary" type="submit">Add</button>
      <datalist id="pantryNames"></datalist>
    </form>

    <div id="shop"><p class="empty">Loading…</p></div>

    <div class="bottombar" id="bottombar" hidden>
      <button class="btn" type="button" id="share">Share list</button>
      <button class="btn primary" type="button" id="finish">Finish shopping</button>
    </div>
  `);

  app.querySelector("#back").onclick = () => { stopShopping(); onBack(); };
  app.querySelector("#addForm").onsubmit = onAdd;
  app.querySelector("#shop").onclick = onClick;
  app.querySelector("#share").onclick = shareList;
  app.querySelector("#finish").onclick = onFinish;

  await load();
  state.stopWatching = watchItems(
    me.household_id,
    (item) => { state.items.set(item.id, item); render(); },
    (id) => { if (state.items.delete(id)) render(); },
  );
  document.addEventListener("visibilitychange", onVisible);
}

export function stopShopping() {
  state.stopWatching?.(); state.stopWatching = null;
  document.removeEventListener("visibilitychange", onVisible);
  for (const t of state.saveTimers.values()) clearTimeout(t);
  state.saveTimers.clear();
}

function onVisible() { if (document.visibilityState === "visible") load(); }

async function load() {
  try {
    const items = await listItems(state.me.household_id);
    state.items = new Map(items.map((it) => [it.id, it]));
    render();
  } catch (err) {
    document.getElementById("shop").innerHTML = `<p class="empty">Couldn't load the list: ${esc(err.message)}</p>`;
  }
}

// ---------- Drawing the list ----------

const byPlace = (a, b) =>
  ((PLACES.indexOf(a.location) + 1 || 99) - (PLACES.indexOf(b.location) + 1 || 99)) || a.name.localeCompare(b.name);

function render() {
  const box = document.getElementById("shop");
  if (!box) return;
  const all = [...state.items.values()];
  const list = all.filter(onShoppingList);
  const toBuy = list.filter((it) => !it.in_cart).sort(byPlace);
  const inCart = list.filter((it) => it.in_cart).sort(byPlace);

  // Suggestions for the "Add to list" box: pantry items not already on the list.
  document.getElementById("pantryNames").innerHTML = all
    .filter((it) => !onShoppingList(it)).map((it) => `<option value="${esc(it.name)}">`).join("");

  const bar = document.getElementById("bottombar");
  bar.hidden = !list.length;
  const finish = document.getElementById("finish");
  finish.disabled = !inCart.length || state.finishing;
  finish.textContent = inCart.length ? `Finish shopping (${inCart.length})` : "Finish shopping";

  if (!list.length) {
    box.innerHTML = `<div class="empty"><strong>Nothing to buy.</strong><br>Low items appear here automatically. You can also add things above.</div>`;
    return;
  }

  box.innerHTML = `
    <section class="group">
      <h2>To buy · ${toBuy.length}</h2>
      ${toBuy.length ? `<ul class="items">${toBuy.map(rowHtml).join("")}</ul>` : `<p class="muted">Everything's in the cart.</p>`}
    </section>
    ${inCart.length ? `
    <section class="group">
      <h2>In the cart · ${inCart.length}</h2>
      <ul class="items">${inCart.map(rowHtml).join("")}</ul>
    </section>` : ""}`;
}

function rowHtml(it) {
  const low = isLowQty(it.qty, it.min_qty);
  const why = Number(it.qty) <= 0 ? "Out" : low ? `Have ${num(it.qty)} ${it.unit}` : "Added by hand";
  const buy = suggestedBuy(it);
  return `
    <li class="item shop ${it.in_cart ? "done" : ""}">
      <button class="tick" type="button" data-tick="${esc(it.id)}" role="checkbox" aria-checked="${it.in_cart}"
        aria-label="${it.in_cart ? "Put back" : "In the cart"}: ${esc(it.name)}"></button>
      <div class="item-main static">
        <strong>${esc(it.name)}</strong>
        <span class="item-meta"><span>${esc(it.location)} · ${esc(why)}</span>
          ${it.on_list && !low ? `<button class="link tiny" type="button" data-remove="${esc(it.id)}">Remove</button>` : ""}</span>
      </div>
      <div class="stepper" aria-label="How many to buy">
        <button type="button" data-buy="-1" data-id="${esc(it.id)}" aria-label="Buy one less">−</button>
        <span class="qty"><b>${esc(num(buy))}</b><small>${esc(it.unit)}</small></span>
        <button type="button" data-buy="1" data-id="${esc(it.id)}" aria-label="Buy one more">+</button>
      </div>
    </li>`;
}

// ---------- Actions ----------

// Change an item on screen right away, then save it.
async function change(id, fields, { delay = 0 } = {}) {
  const it = state.items.get(id); if (!it) return;
  state.items.set(id, { ...it, ...fields });
  render();
  clearTimeout(state.saveTimers.get(id));
  const save = async () => {
    state.saveTimers.delete(id);
    try {
      const saved = await updateItem(id, fields);
      state.items.set(id, saved);
    } catch (err) {
      state.items.set(id, it);            // undo on screen
      toast("Couldn't save: " + err.message);
    }
    render();
  };
  delay ? state.saveTimers.set(id, setTimeout(save, delay)) : save();
}

function onClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  const it = state.items.get(b.dataset.tick || b.dataset.id || b.dataset.remove);
  if (!it) return;

  if (b.dataset.tick) {
    // Remember how many we're buying, so "Finish" adds the right amount.
    change(it.id, { in_cart: !it.in_cart, buy_qty: suggestedBuy(it) });
  } else if (b.dataset.buy) {
    const next = Math.max(1, suggestedBuy(it) + Number(b.dataset.buy));
    change(it.id, { buy_qty: next }, { delay: 600 });   // quick taps → one save
  } else if (b.dataset.remove) {
    change(it.id, { on_list: false, in_cart: false, buy_qty: null });
  }
}

async function onAdd(e) {
  e.preventDefault();
  const input = document.getElementById("addInput");
  const name = input.value.trim();
  if (!name) return;
  input.value = "";

  const existing = [...state.items.values()].find((it) => it.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (onShoppingList(existing)) toast(`${existing.name} is already on the list`);
    else change(existing.id, { on_list: true });
    return;
  }
  // Not in the pantry yet: add it as a new item with nothing in stock.
  try {
    const item = await addItem(state.me.household_id, {
      name, location: "Other", qty: 0, unit: "pcs", min_qty: 0, on_list: true,
    });
    state.items.set(item.id, item);
    render();
    toast(`Added ${item.name}. Its place and details can be set in the pantry.`);
  } catch (err) {
    toast("Couldn't add: " + err.message);
  }
}

async function onFinish() {
  const inCart = [...state.items.values()].filter((it) => onShoppingList(it) && it.in_cart);
  if (!inCart.length) return;
  const btn = document.getElementById("finish");
  if (btn.dataset.armed !== "1") {      // ask once more, inside the page
    btn.dataset.armed = "1";
    btn.textContent = `Add ${inCart.length} to pantry?`;
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ""; render(); } }, 4000);
    return;
  }
  btn.dataset.armed = "";
  state.finishing = true; render();
  try {
    // Make sure any pending "how many" changes are saved first.
    for (const [id, t] of state.saveTimers) {
      clearTimeout(t); state.saveTimers.delete(id);
      const it = state.items.get(id);
      await updateItem(id, { buy_qty: it.buy_qty });
    }
    const updated = await finishShopping(state.me.household_id);
    updated.forEach((it) => state.items.set(it.id, it));
    toast(`Added ${updated.length} item${updated.length === 1 ? "" : "s"} to the pantry`);
  } catch (err) {
    toast("Couldn't finish: " + err.message);
  } finally {
    state.finishing = false; render();
  }
}

async function shareList() {
  const list = [...state.items.values()].filter((it) => onShoppingList(it) && !it.in_cart).sort(byPlace);
  const text = "Shopping list\n" + list.map((it) => `- ${it.name} × ${num(suggestedBuy(it))} ${it.unit}`).join("\n");
  if (navigator.share) {
    try { await navigator.share({ title: "Shopping list", text }); return; }
    catch (err) { if (err.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); toast("List copied"); }
  catch { toast("Couldn't copy on this device"); }
}
