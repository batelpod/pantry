// Screen: the pantry. Grouping, summary, filters, + / −, add / edit / delete, live updates.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBrowser, stopBrowser, openApp, fakeState, household, dayFromToday } from "../helpers/browser.mjs";

before(startBrowser);
after(stopBrowser);

const sample = () => household({ items: [
  { name: "Basmati rice", category: "Grains", location: "Pantry", qty: 2, unit: "kg", min_qty: 1, minutesAgo: 120, by: "u2" },
  { name: "Chickpeas", location: "Pantry", qty: 1, unit: "cans", min_qty: 2, by: "u1" },
  { name: "Milk", location: "Fridge", qty: 3, unit: "L", min_qty: 1, expires_on: dayFromToday(2) },
  { name: "Dish soap", location: "Cleaning", qty: 0, unit: "bottles", min_qty: 1 },
  { name: "Old yogurt", location: "Fridge", qty: 1, min_qty: 0, expires_on: dayFromToday(-1) },
  { name: "Cream", location: "Fridge", qty: 1, min_qty: 0, expires_on: dayFromToday(0) },
  { name: "Tahini", location: "Basement", qty: 2, min_qty: 0, on_list: true },
] });

const names = (page) => page.$$eval(".item-main strong", (els) => els.map((e) => e.textContent));
const row = (page, name) => page.locator(".item", { hasText: name });

describe("the list", () => {
  test("empty pantry explains how to start", async () => {
    const page = await openApp({ setup: household() });
    await page.waitForSelector("text=Nothing here yet.");
    assert.deepEqual(await page.done(), []);
  });

  test("groups by place, low items first, with summary numbers", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    const groups = await page.$$eval(".group h2", (els) => els.map((e) => e.textContent));
    assert.deepEqual(groups, ["Pantry", "Fridge", "Cleaning", "Basement"], "known places in order, unknown last");
    assert.deepEqual((await names(page)).slice(0, 2), ["Chickpeas", "Basmati rice"], "low first");
    assert.equal(await page.textContent("#nAll"), "7");
    assert.equal(await page.textContent("#nLow"), "3");   // chickpeas, soap, tahini (on list)
    assert.equal(await page.textContent("#nSoon"), "3");  // milk, yogurt, cream
    assert.deepEqual(await page.done(), []);
  });

  test("shows tags and who updated each item", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    assert.match(await row(page, "Basmati rice").textContent(), /Updated by Dana · 2 hours ago/);
    assert.match(await row(page, "Chickpeas").textContent(), /Low.*Updated by you/s);
    assert.match(await row(page, "Dish soap").textContent(), /Out/);
    assert.match(await row(page, "Milk").textContent(), /Expires in 2 days/);
    assert.match(await row(page, "Old yogurt").textContent(), /Expired/);
    assert.match(await row(page, "Cream").textContent(), /Expires today/);
    assert.match(await row(page, "Tahini").textContent(), /On list/);
    assert.deepEqual(await page.done(), []);
  });

  test("unknown member shows as 'someone'", async () => {
    const page = await openApp({ setup: household({ items: [{ name: "Salt", by: "gone-user" }] }) });
    await page.waitForSelector(".item");
    assert.match(await row(page, "Salt").textContent(), /Updated by someone/);
    assert.deepEqual(await page.done(), []);
  });
});

describe("filters and search", () => {
  test("to buy, expire soon, place, search, and nothing-matches", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");

    await page.click('[data-view="low"]');
    assert.deepEqual((await names(page)).sort(), ["Chickpeas", "Dish soap", "Tahini"]);
    await page.click('[data-view="low"]');               // tap again = show all
    assert.equal((await names(page)).length, 7);

    await page.click('[data-view="soon"]');
    assert.deepEqual((await names(page)).sort(), ["Cream", "Milk", "Old yogurt"]);
    await page.click('[data-view="all"]');

    await page.click('[data-place="Cleaning"]');
    assert.deepEqual(await names(page), ["Dish soap"]);
    await page.click('[data-place="All"]');

    await page.fill("#search", "grain");                 // searches category too
    assert.deepEqual(await names(page), ["Basmati rice"]);
    await page.fill("#search", "zzz");
    await page.waitForSelector("text=Nothing matches");
    assert.deepEqual(await page.done(), []);
  });
});

describe("+ / − buttons", () => {
  test("quick taps show at once and are saved as one change", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    const plus = row(page, "Basmati rice").locator('[data-delta="1"]');
    await plus.click(); await plus.click(); await plus.click();
    assert.equal(await row(page, "Basmati rice").locator(".qty b").textContent(), "5");
    await page.waitForTimeout(900);
    const calls = await fakeState(page, (f) => f.calls.filter((c) => c.name === "adjust_qty").map((c) => c.args.p_delta));
    assert.deepEqual(calls, [3]);
    assert.match(await row(page, "Basmati rice").textContent(), /Updated by you · just now/);
    assert.deepEqual(await page.done(), []);
  });

  test("− stops at zero", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await row(page, "Dish soap").locator('[data-delta="-1"]').click();
    assert.equal(await row(page, "Dish soap").locator(".qty b").textContent(), "0");
    await page.waitForTimeout(800);
    assert.equal((await fakeState(page, (f) => f.calls.filter((c) => c.name === "adjust_qty"))).length, 0);
    assert.deepEqual(await page.done(), []);
  });

  test("a failed save shows a message and puts the number back", async () => {
    const page = await openApp({ setup: { ...sample(), failures: { "rpc:adjust_qty": "offline" } } });
    await page.waitForSelector(".item");
    await row(page, "Milk").locator('[data-delta="-1"]').click();
    assert.equal(await row(page, "Milk").locator(".qty b").textContent(), "2");
    await page.waitForSelector(".toast");
    assert.match(await page.textContent(".toast"), /Couldn't save the change: offline/);
    assert.equal(await row(page, "Milk").locator(".qty b").textContent(), "3");
    assert.deepEqual(await page.done(), []);
  });
});

describe("add, edit, delete", () => {
  test("add an item (place follows the chosen filter)", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await page.click('[data-place="Fridge"]');
    await page.click("#add");
    assert.equal(await page.inputValue("#f-location"), "Fridge");
    await page.fill("#f-name", "Butter");
    await page.fill("#f-qty", "2");
    await page.fill("#f-unit", "packs");
    await page.click("#itemForm button[type=submit]");
    await page.waitForSelector(".toast:has-text('Added Butter')");
    assert.ok((await names(page)).includes("Butter"));
    const saved = await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Butter"));
    assert.equal(saved.location, "Fridge");
    assert.equal(saved.household_id, "h1");
    assert.deepEqual(await page.done(), []);
  });

  test("edit an item, including putting it on the shopping list", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await row(page, "Basmati rice").locator(".item-main").click();
    assert.match(await page.textContent("#itemForm"), /Last updated by Dana/);
    await page.fill("#f-qty", "4");
    await page.fill("#f-expires", dayFromToday(30));
    await page.check("#f-onlist");
    await page.click("#itemForm button[type=submit]");
    await page.waitForSelector(".toast:has-text('Saved')");
    const saved = await fakeState(page, (f) => f.tables.items.find((i) => i.name === "Basmati rice"));
    assert.equal(saved.qty, 4);
    assert.equal(saved.on_list, true);
    assert.equal(saved.expires_on, dayFromToday(30));
    assert.deepEqual(await page.done(), []);
  });

  test("a failed save shows the reason in the form", async () => {
    const page = await openApp({ setup: { ...sample(), failures: { "from:items:update": "value too long" } } });
    await page.waitForSelector(".item");
    await row(page, "Milk").locator(".item-main").click();
    await page.click("#itemForm button[type=submit]");
    await page.waitForSelector("#itemForm .error:not(:empty)");
    assert.equal(await page.textContent("#itemForm .error"), "value too long");
    assert.deepEqual(await page.done(), []);
  });

  test("delete needs two taps", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await row(page, "Milk").locator(".item-main").click();
    await page.click("#delete");
    assert.equal(await page.textContent("#delete"), "Tap again to delete");
    assert.ok((await names(page)).includes("Milk"), "not deleted after one tap");
    await page.click("#delete");
    await page.waitForSelector(".toast:has-text('Deleted Milk')");
    assert.ok(!(await names(page)).includes("Milk"));
    assert.deepEqual(await page.done(), []);
  });

  test("a failed delete shows the reason", async () => {
    const page = await openApp({ setup: { ...sample(), failures: { "from:items:delete": "not allowed" } } });
    await page.waitForSelector(".item");
    await row(page, "Milk").locator(".item-main").click();
    await page.click("#delete"); await page.click("#delete");
    await page.waitForSelector("#itemForm .error:not(:empty)");
    assert.equal(await page.textContent("#itemForm .error"), "not allowed");
    assert.deepEqual(await page.done(), []);
  });

  test("the sheet closes with Cancel, Escape, or tapping outside", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await page.click("#add"); await page.click("#cancel");
    assert.equal(await page.$("#itemForm"), null);
    await page.click("#add"); await page.keyboard.press("Escape");
    assert.equal(await page.$("#itemForm"), null);
    await page.click("#add"); await page.mouse.click(195, 20);   // the dark area above the sheet
    assert.equal(await page.$("#itemForm"), null);
    assert.deepEqual(await page.done(), []);
  });
});

describe("live updates and loading", () => {
  test("another member's change appears without refreshing", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await page.evaluate(() => {
      const rice = { ...window.__fake.tables.items.find((i) => i.name === "Basmati rice"), qty: 9, updated_by: "u2", updated_at: new Date().toISOString() };
      window.__fake.emit("UPDATE", rice);
      window.__fake.emit("INSERT", { ...rice, id: "new1", name: "Coffee", qty: 1, min_qty: 0 });
      window.__fake.emit("DELETE", { id: window.__fake.tables.items.find((i) => i.name === "Milk").id });
    });
    assert.equal(await row(page, "Basmati rice").locator(".qty b").textContent(), "9");
    assert.match(await row(page, "Basmati rice").textContent(), /Updated by Dana · just now/);
    assert.ok((await names(page)).includes("Coffee"));
    assert.ok(!(await names(page)).includes("Milk"));
    assert.deepEqual(await page.done(), []);
  });

  test("coming back to the app reloads the list", async () => {
    const page = await openApp({ setup: sample() });
    await page.waitForSelector(".item");
    await page.evaluate(() => { window.__fake.tables.items.push({ ...window.__fake.tables.items[0], id: "z", name: "Zaatar" }); });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForSelector("text=Zaatar");
    assert.deepEqual(await page.done(), []);
  });

  test("a loading error explains what happened", async () => {
    const page = await openApp({ setup: { ...sample(), failures: { "from:items:select": "server unavailable" } } });
    await page.waitForSelector("text=Couldn't load the pantry");
    assert.match(await page.textContent("#list"), /server unavailable/);
    assert.deepEqual(await page.done(), []);
  });
});
