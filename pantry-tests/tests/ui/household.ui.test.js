// Screens: create or join a household, Household page (members, invite, your name, log out).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBrowser, stopBrowser, openApp, fakeState, household } from "../helpers/browser.mjs";

before(startBrowser);
after(stopBrowser);

const newcomer = () => {
  const s = household();
  s.tables.household_members = s.tables.household_members.filter((m) => m.user_id !== "u1");
  return s;
};

describe("household setup", () => {
  test("create a new household → lands in the pantry as owner", async () => {
    const setup = household();
    setup.tables = { households: [], household_members: [], invites: [], items: [] };
    const page = await openApp({ setup });
    await page.waitForSelector("#create");
    await page.fill("#create-hh", "Beach House");
    await page.fill("#create-name", "Batel");
    await page.click("#create button[type=submit]");
    await page.waitForSelector(".topbar");
    assert.equal(await page.textContent(".eyebrow"), "Beach House");
    assert.deepEqual(await page.done(), []);
  });

  test("join with a wrong code shows why", async () => {
    const page = await openApp({ setup: newcomer() });
    await page.waitForSelector("#join");
    await page.fill("#join-code", "NOPE");
    await page.fill("#join-name", "Batel");
    await page.click("#join button[type=submit]");
    await page.waitForSelector("#join .error:not(:empty)");
    assert.match(await page.textContent("#join .error"), /wrong or has expired/);
    assert.deepEqual(await page.done(), []);
  });

  test("join with a right code → in the household's pantry", async () => {
    const setup = newcomer();
    setup.tables.invites = [{ code: "GOOD123", household_id: "h1" }];
    const page = await openApp({ setup });
    await page.waitForSelector("#join");
    await page.fill("#join-code", "good123");
    await page.fill("#join-name", "Batel");
    await page.click("#join button[type=submit]");
    await page.waitForSelector(".topbar");
    assert.equal(await page.textContent(".eyebrow"), "Our Home");
    assert.deepEqual(await page.done(), []);
  });

  test("log out from the setup screen", async () => {
    const page = await openApp({ setup: newcomer() });
    await page.waitForSelector("#join");
    await page.click("#logout");
    await page.waitForSelector("#login");
    assert.deepEqual(await page.done(), []);
  });
});

describe("Household page", () => {
  const openHousehold = async () => {
    const page = await openApp({ setup: household() });
    await page.waitForSelector("#household");
    await page.click("#household");
    await page.waitForSelector("#members li .avatar");
    return page;
  };

  test("lists members, marks you and the owner", async () => {
    const page = await openHousehold();
    const text = (await page.textContent("#members")).replace(/\s+/g, " ");
    assert.match(text, /Batel \(you\) Owner/);
    assert.match(text, /Dana/);
    assert.deepEqual(await page.done(), []);
  });

  test("invite: makes a link with a code and copies it", async () => {
    const page = await openHousehold();
    await page.click("#invite");
    await page.waitForSelector("#inviteLink");
    const link = await page.inputValue("#inviteLink");
    assert.match(link, /\?invite=CODE\d+$/);
    await page.click("#copy");
    await page.waitForSelector(".toast");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);
    assert.deepEqual(await page.done(), []);
  });

  test("invite error is shown", async () => {
    const page = await openApp({ setup: { ...household(), failures: { "rpc:create_invite": "Too many invites" } } });
    await page.click("#household");
    await page.waitForSelector("#invite");
    await page.click("#invite");
    await page.waitForSelector(".toast");
    assert.equal(await page.textContent(".toast"), "Too many invites");
    assert.deepEqual(await page.done(), []);
  });

  test("change your name", async () => {
    const page = await openHousehold();
    await page.fill("#display-name", "Batel P");
    await page.click("#rename button[type=submit]");
    await page.waitForSelector("h1:has-text('Hi, Batel P')");
    const me = await fakeState(page, (f) => f.tables.household_members.find((m) => m.user_id === "u1"));
    assert.equal(me.display_name, "Batel P");
    assert.deepEqual(await page.done(), []);
  });

  test("members list error is shown in the list", async () => {
    const page = await openApp({ setup: household() });
    await page.waitForSelector("#household");
    await page.evaluate(() => window.__fake.failNext("from:household_members:select", "can't load"));
    await page.click("#household");
    await page.waitForSelector("#members .error");
    assert.equal(await page.textContent("#members .error"), "can't load");
    assert.deepEqual(await page.done(), []);
  });

  test("back to the pantry, and log out", async () => {
    const page = await openHousehold();
    await page.click("#back");
    await page.waitForSelector(".topbar");
    await page.click("#household");
    await page.waitForSelector("#logout");
    await page.click("#logout");
    await page.waitForSelector("#login");
    assert.deepEqual(await page.done(), []);
  });
});
