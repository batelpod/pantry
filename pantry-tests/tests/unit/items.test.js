// Item data functions (js/items.js), against the fake Supabase.

import "../helpers/node-setup.mjs";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../fakes/supabase-fake.js";

const items = await import("../../js/items.js");

const lastCall = () => fake.calls.at(-1);

beforeEach(() => {
  fake.reset();
  fake.signIn({ id: "u1", email: "a@example.com" });
  fake.tables.items.push(
    { id: "i1", household_id: "h1", name: "Rice", qty: 2, min_qty: 1, unit: "kg", in_cart: false, on_list: false },
    { id: "i2", household_id: "h1", name: "Beans", qty: 0, min_qty: 2, unit: "cans", in_cart: true, buy_qty: 3, on_list: false },
    { id: "x9", household_id: "OTHER", name: "Not ours", qty: 1, min_qty: 0, unit: "pcs" },
  );
});

describe("listItems", () => {
  test("returns only this household's items, sorted by name", async () => {
    const list = await items.listItems("h1");
    assert.deepEqual(list.map((i) => i.name), ["Beans", "Rice"]);
    assert.deepEqual(lastCall().filters, [["household_id", "h1"]]);
  });
  test("a database error becomes a readable error", async () => {
    fake.failNext("from:items:select", "permission denied");
    await assert.rejects(items.listItems("h1"), /permission denied/);
  });
});

describe("addItem", () => {
  test("saves the item into the household and returns it", async () => {
    const saved = await items.addItem("h1", { name: "Oil", qty: 1, unit: "bottles", min_qty: 1, location: "Pantry" });
    assert.equal(saved.name, "Oil");
    assert.equal(lastCall().values.household_id, "h1");
    assert.equal(saved.updated_by, "u1");
  });
  test("error is passed on", async () => {
    fake.failNext("from:items:insert", "value too long");
    await assert.rejects(items.addItem("h1", { name: "x" }), /value too long/);
  });
});

describe("updateItem and deleteItem", () => {
  test("updates only the chosen item", async () => {
    const saved = await items.updateItem("i1", { qty: 7 });
    assert.equal(saved.qty, 7);
    assert.deepEqual(lastCall().filters, [["id", "i1"]]);
  });
  test("deletes the chosen item", async () => {
    await items.deleteItem("i1");
    assert.equal(fake.tables.items.some((i) => i.id === "i1"), false);
  });
  test("delete error is passed on", async () => {
    fake.failNext("from:items:delete", "nope");
    await assert.rejects(items.deleteItem("i1"), /nope/);
  });
  test("update error is passed on", async () => {
    fake.failNext("from:items:update", "nope");
    await assert.rejects(items.updateItem("i1", { qty: 1 }), /nope/);
  });
});

describe("adjustQty (+ / − buttons)", () => {
  test("sends one change with the total taps", async () => {
    const row = await items.adjustQty("i1", 3);
    assert.equal(row.qty, 5);
    assert.deepEqual(lastCall(), { type: "rpc", name: "adjust_qty", args: { p_item: "i1", p_delta: 3 } });
  });
  test("error is passed on", async () => {
    fake.failNext("rpc:adjust_qty", "offline");
    await assert.rejects(items.adjustQty("i1", 1), /offline/);
  });
});

describe("finishShopping", () => {
  test("adds what's in the cart and returns updated items", async () => {
    const updated = await items.finishShopping("h1");
    assert.equal(updated.length, 1);
    assert.equal(updated[0].qty, 3);
    assert.equal(updated[0].in_cart, false);
  });
  test("returns an empty list when nothing comes back", async () => {
    fake.tables.items.forEach((i) => (i.in_cart = false));
    assert.deepEqual(await items.finishShopping("h1"), []);
  });
  test("error is passed on", async () => {
    fake.failNext("rpc:finish_shopping", "nope");
    await assert.rejects(items.finishShopping("h1"), /nope/);
  });
});

describe("watchItems (live updates)", () => {
  test("hears added, changed and deleted items, and stops when asked", async () => {
    const seen = [];
    const stop = items.watchItems("h1", (it) => seen.push(["upsert", it.name]), (id) => seen.push(["delete", id]));
    fake.emit("INSERT", { id: "i5", household_id: "h1", name: "Tea" });
    fake.emit("UPDATE", { id: "i1", household_id: "h1", name: "Rice" });
    fake.emit("UPDATE", { id: "x9", household_id: "OTHER", name: "Not ours" });  // other household: ignored
    fake.emit("DELETE", { id: "i2" });
    assert.deepEqual(seen, [["upsert", "Tea"], ["upsert", "Rice"], ["delete", "i2"]]);

    stop();
    fake.emit("INSERT", { id: "i6", household_id: "h1", name: "Late" });
    assert.equal(seen.length, 3);
  });
});
