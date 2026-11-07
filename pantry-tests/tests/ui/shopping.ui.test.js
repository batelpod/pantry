// Screen: the shopping list. What's on it, add by name, tick into cart, how many, finish, share.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBrowser, stopBrowser, openApp, fakeState, household } from "../helpers/browser.mjs";

before(startBrowser);
after(stopBrowser);

const sample = () => household({ items: [
  { name: "Chickpeas", location: "Pantry", qty: 1, unit: "cans", min_qty: 2 },     // low → on list
  { name: "Dish soap", location: "Cleaning", qty: 0, unit: "bottles", min_qty: 1 }, // out → on list
  { name: "Tahini", location: "Pantry", qty: 3, unit: "jars", min_qty: 1, on_list: true }, // by hand
  { name: "Rice", location: "Pantry", qty: 5, unit: "kg", min_qty: 1 },             // fine → not on list
] });

async function openShopping(setup = sample()) {
  const page = await openApp({ setup });
  await page.waitForSelector("#shopping");
  await page.click("#shopping");
  await page.waitForSelector("#shop .item, #shop .empty:not(:has-text('Loading'))");
  return page;
}
const groupNames = (page) => page.$$eval(".group", (gs) => gs.map((g) =>
  [g.querySelector("h2").textContent, [...g.querySelectorAll("strong")].map((s) => s.textContent)]));
const row = (page, name) => page.locator(".item", { hasText: name });

describe("what's on the list", () => {
  test("low, out and added-by-hand items; well-stocked ones aren't", async () => {
    const page = await openShopping();
    assert.deepEqual(await groupNames(page), [["To buy · 3", ["Chickpeas", "Tahini", "Dish soap"]]]);
    assert.match(await row(page, "Chickpeas").textContent(), /Have 1 cans/);
    assert.match(await row(page, "Dish soap").textContent(), /Out/);
    assert.match(await row(page, "Tahini").textContent(), /Added by hand/);
    assert.equal(await row(page, "Chickpeas").locator(".qty b").textContent(), "2", "suggested amount");
    assert.deepEqual(await page.done(), []);
  });

  test("empty list says so", async () => {
    const page = await openShopping(household({ items: [{ name: "Rice", qty: 5, min_qty: 1 }] }));
    await page.waitForSelector("text=Nothing to buy.");
    assert.equal(await page.isHidden("#bottombar"), true);
    assert.deepEqual(await page.done(), []);
  });
});

describe("adding to the list", () => {
  test("a pantry item by name (any case)", async () => {
    const page = await openShopping();
    await page.fill("#addInput", "rice");
    await page.click("#addForm button");
    await page.waitForSelector(".item:has-text('Rice')");
    assert.equal(await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Rice").on_list), true);
    assert.deepEqual(await page.done(), []);
  });

  test("something already on the list → a message, nothing doubled", async () => {
    const page = await openShopping();
    await page.fill("#addInput", "Chickpeas");
    await page.click("#addForm button");
    await page.waitForSelector(".toast");
    assert.match(await page.textContent(".toast"), /already on the list/);
    assert.deepEqual(await page.done(), []);
  });

  test("something new creates a pantry item with nothing in stock", async () => {
    const page = await openShopping();
    await page.fill("#addInput", "Birthday candles");
    await page.click("#addForm button");
    await page.waitForSelector(".item:has-text('Birthday candles')");
    const it = await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Birthday candles"));
    assert.equal(it.qty, 0);
    assert.equal(it.location, "Other");
    assert.equal(it.on_list, true);
    assert.deepEqual(await page.done(), []);
  });

  test("an empty box does nothing; an add error is shown", async () => {
    const page = await openShopping({ ...sample(), failures: { "from:items:insert": "offline" } });
    await page.click("#addForm button");
    await page.fill("#addInput", "Candles");
    await page.click("#addForm button");
    await page.waitForSelector(".toast");
    assert.match(await page.textContent(".toast"), /Couldn't add: offline/);
    assert.deepEqual(await page.done(), []);
  });

  test("remove something added by hand", async () => {
    const page = await openShopping();
    await row(page, "Tahini").locator("[data-remove]").click();
    await page.waitForFunction(() => !document.querySelector("#shop")?.textContent.includes("Tahini"));
    assert.equal(await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Tahini").on_list), false);
    assert.deepEqual(await page.done(), []);
  });
});

describe("shopping", () => {
  test("tick into the cart, change amounts, untick", async () => {
    const page = await openShopping();
    const plus = row(page, "Chickpeas").locator('[data-buy="1"]');
    await plus.click(); await plus.click();
    assert.equal(await row(page, "Chickpeas").locator(".qty b").textContent(), "4");
    await row(page, "Chickpeas").locator('[data-buy="-1"]').click();
    assert.equal(await row(page, "Chickpeas").locator(".qty b").textContent(), "3");
    await page.waitForTimeout(800);                      // amount is saved after a pause

    await row(page, "Chickpeas").locator(".tick").click();
    await page.waitForSelector("h2:has-text('In the cart · 1')");
    assert.equal(await page.textContent("#finish"), "Finish shopping (1)");
    const saved = await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Chickpeas"));
    assert.equal(saved.in_cart, true);
    assert.equal(saved.buy_qty, 3);

    await row(page, "Chickpeas").locator(".tick").click();     // put back
    await page.waitForFunction(() => !document.body.textContent.includes("In the cart"));
    assert.deepEqual(await page.done(), []);
  });

  test("finish shopping asks once more, then adds to the pantry", async () => {
    const page = await openShopping();
    await row(page, "Chickpeas").locator(".tick").click();
    await row(page, "Dish soap").locator(".tick").click();
    await page.waitForSelector("h2:has-text('In the cart · 2')");
    await page.click("#finish");
    assert.equal(await page.textContent("#finish"), "Add 2 to pantry?");
    await page.click("#finish");
    await page.waitForSelector(".toast:has-text('Added 2 items to the pantry')");
    const t = await fakeState(page, (f) => Object.fromEntries(f.tables.items.map((i) => [i.name, [i.qty, i.in_cart]])));
    assert.deepEqual(t["Chickpeas"], [3, false]);   // 1 + 2
    assert.deepEqual(t["Dish soap"], [2, false]);   // 0 + 2
    assert.deepEqual(await groupNames(page), [["To buy · 1", ["Tahini"]]]);
    assert.deepEqual(await page.done(), []);
  });

  test("finish saves a just-changed amount first", async () => {
    const page = await openShopping();
    await row(page, "Chickpeas").locator(".tick").click();
    await page.waitForSelector("h2:has-text('In the cart · 1')");
    await row(page, "Chickpeas").locator('[data-buy="1"]').click();   // not saved yet…
    await page.click("#finish"); await page.click("#finish");          // …finish right away
    await page.waitForSelector(".toast:has-text('Added 1 item to the pantry')");
    assert.equal(await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Chickpeas").qty), 4); // 1 + 3
    assert.deepEqual(await page.done(), []);
  });

  test("the extra 'are you sure' goes away after a few seconds", async () => {
    const page = await openShopping();
    await row(page, "Chickpeas").locator(".tick").click();
    await page.waitForSelector("h2:has-text('In the cart · 1')");
    await page.click("#finish");
    await page.waitForFunction(() => document.querySelector("#finish").textContent === "Finish shopping (1)", null, { timeout: 6000 });
    assert.deepEqual(await page.done(), []);
  });

  test("errors: tick fails → undone with a message; finish fails → message", async () => {
    const page = await openShopping({ ...sample(), failures: { "from:items:update": "offline" } });
    await row(page, "Chickpeas").locator(".tick").click();
    await page.waitForSelector(".toast:has-text('Couldn\\'t save: offline')");
    assert.equal(await page.isVisible("text=In the cart"), false);

    await row(page, "Chickpeas").locator(".tick").click();
    await page.waitForSelector("h2:has-text('In the cart · 1')");
    await page.evaluate(() => window.__fake.failNext("rpc:finish_shopping", "server busy"));
    await page.click("#finish"); await page.click("#finish");
    await page.waitForSelector(".toast:has-text('Couldn\\'t finish: server busy')");
    assert.deepEqual(await page.done(), []);
  });
});

describe("sharing and live updates", () => {
  test("share copies the list as text (when the phone has no share menu)", async () => {
    const page = await openShopping();
    await page.click("#share");
    await page.waitForSelector(".toast:has-text('List copied')");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(text, "Shopping list\n- Chickpeas × 2 cans\n- Tahini × 1 jars\n- Dish soap × 2 bottles");
    assert.deepEqual(await page.done(), []);
  });

  test("uses the phone's share menu when there is one", async () => {
    const page = await openShopping();
    await page.evaluate(() => { navigator.share = async (d) => { window.__shared = d; }; });
    await page.click("#share");
    await page.waitForFunction(() => window.__shared);
    assert.equal(await page.evaluate(() => window.__shared.title), "Shopping list");
    assert.deepEqual(await page.done(), []);
  });

  test("another shopper's tick appears right away; back to pantry", async () => {
    const page = await openShopping();
    await page.evaluate(() => {
      const soap = window.__fake.tables.items.find((i) => i.name === "Dish soap");
      window.__fake.emit("UPDATE", { ...soap, in_cart: true, buy_qty: 2 });
      window.__fake.emit("DELETE", { id: window.__fake.tables.items.find((i) => i.name === "Tahini").id });
    });
    await page.waitForSelector("h2:has-text('In the cart · 1')");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));  // reload on return
    await page.click("#back");
    await page.waitForSelector(".topbar");
    assert.deepEqual(await page.done(), []);
  });
});
