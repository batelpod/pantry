// Rules and formatting (js/ui/format.js): low, expiring, shopping list, "time ago".

import "../helpers/node-setup.mjs";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const f = await import("../../js/ui/format.js");

// A date `days` from today, as the database stores it: "2026-11-09"
function dayFromToday(days) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("num: shows quantities nicely", () => {
  test("whole numbers have no decimals", () => {
    assert.equal(f.num(2), "2");
    assert.equal(f.num("3.00"), "3");
  });
  test("fractions show one decimal", () => {
    assert.equal(f.num(1.5), "1.5");
    assert.equal(f.num(0.25), "0.3");
  });
});

describe("isLowQty: at or below the 'buy more' level", () => {
  test("below is low", () => assert.equal(f.isLowQty(1, 2), true));
  test("exactly at the level is low", () => assert.equal(f.isLowQty(2, 2), true));
  test("above is not low", () => assert.equal(f.isLowQty(3, 2), false));
  test("works with text numbers from the database", () => assert.equal(f.isLowQty("0.5", "1"), true));
});

describe("daysLeft and expiresSoon", () => {
  test("no expiry date → null, not expiring", () => {
    assert.equal(f.daysLeft({ expires_on: null }), null);
    assert.equal(f.expiresSoon({ expires_on: null }), false);
  });
  test("today is 0 days", () => assert.equal(f.daysLeft({ expires_on: dayFromToday(0) }), 0));
  test("in 3 days is soon", () => {
    assert.equal(f.daysLeft({ expires_on: dayFromToday(3) }), 3);
    assert.equal(f.expiresSoon({ expires_on: dayFromToday(3) }), true);
  });
  test(`exactly ${f.SOON_DAYS} days is still soon`, () =>
    assert.equal(f.expiresSoon({ expires_on: dayFromToday(f.SOON_DAYS) }), true));
  test("8 days is not soon", () => assert.equal(f.expiresSoon({ expires_on: dayFromToday(8) }), false));
  test("already expired counts as soon (negative days)", () => {
    assert.equal(f.daysLeft({ expires_on: dayFromToday(-2) }), -2);
    assert.equal(f.expiresSoon({ expires_on: dayFromToday(-2) }), true);
  });
});

describe("timeAgo", () => {
  const ago = (secs) => new Date(Date.now() - secs * 1000).toISOString();
  test("under a minute → just now", () => assert.equal(f.timeAgo(ago(20)), "just now"));
  test("minutes", () => assert.equal(f.timeAgo(ago(5 * 60)), "5 minutes ago"));
  test("hours", () => assert.equal(f.timeAgo(ago(2 * 3600)), "2 hours ago"));
  test("one day → yesterday", () => assert.equal(f.timeAgo(ago(86400)), "yesterday"));
  test("one week → last week", () => assert.equal(f.timeAgo(ago(7 * 86400)), "last week"));
  test("years", () => assert.equal(f.timeAgo(ago(2 * 365 * 86400)), "2 years ago"));
});

describe("onShoppingList", () => {
  const item = (over) => ({ qty: 5, min_qty: 1, on_list: false, in_cart: false, ...over });
  test("well stocked → not on list", () => assert.equal(f.onShoppingList(item()), false));
  test("low → on list automatically", () => assert.equal(f.onShoppingList(item({ qty: 1 })), true));
  test("added by hand → on list", () => assert.equal(f.onShoppingList(item({ on_list: true })), true));
  test("in the cart → stays on list", () => assert.equal(f.onShoppingList(item({ in_cart: true })), true));
});

describe("suggestedBuy: how many to buy", () => {
  test("enough to get back above the level", () => assert.equal(f.suggestedBuy({ qty: 1, min_qty: 2 }), 2));
  test("out of something with level 3 → 4", () => assert.equal(f.suggestedBuy({ qty: 0, min_qty: 3 }), 4));
  test("always at least 1", () => assert.equal(f.suggestedBuy({ qty: 9, min_qty: 1 }), 1));
  test("rounds fractions up", () => assert.equal(f.suggestedBuy({ qty: 0.5, min_qty: 1 }), 2));
  test("a chosen amount wins", () => assert.equal(f.suggestedBuy({ qty: 0, min_qty: 3, buy_qty: 6 }), 6));
});
