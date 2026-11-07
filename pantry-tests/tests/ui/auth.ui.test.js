// Screens: log in, sign up, forgot password, set new password, invite links.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startBrowser, stopBrowser, openApp, fakeState, household } from "../helpers/browser.mjs";

before(startBrowser);
after(stopBrowser);

describe("logged out", () => {
  test("shows the log in screen", async () => {
    const page = await openApp({ setup: household({ loggedIn: false }) });
    await page.waitForSelector("#login");
    assert.equal(await page.textContent("h1"), "Home Pantry");
    assert.deepEqual(await page.done(), []);
  });

  test("wrong password shows a clear message; right password logs in", async () => {
    const page = await openApp({ setup: household({ loggedIn: false }) });
    await page.fill("#email", "batel@example.com");
    await page.fill("#password", "wrong");
    await page.click("#login button[type=submit]");
    await page.waitForSelector("#login .error:not(:empty)");
    assert.equal(await page.textContent("#login .error"), "Email or password is wrong.");

    await page.fill("#password", "goodpass1");
    await page.click("#login button[type=submit]");
    await page.waitForSelector(".topbar");                // in the pantry
    assert.equal(await page.textContent(".topbar h1"), "Pantry");
    assert.deepEqual(await page.done(), []);
  });

  test("sign up asks you to check your email", async () => {
    const page = await openApp({ setup: household({ loggedIn: false }) });
    await page.click("#toSignUp");
    await page.fill("#email", "new@example.com");
    await page.fill("#password", "longpassword");
    await page.click("#signup button[type=submit]");
    await page.waitForSelector("text=Check your email");
    assert.match(await page.textContent(".card"), /new@example\.com/);
    await page.click("#back");
    await page.waitForSelector("#login");
    assert.deepEqual(await page.done(), []);
  });

  test("sign up without email confirmation goes straight to household setup", async () => {
    const page = await openApp({ setup: { ...household({ loggedIn: false }), confirmEmail: false } });
    await page.click("#toSignUp");
    await page.click("#toLogIn");          // the link back works
    await page.click("#toSignUp");
    await page.fill("#email", "new@example.com");
    await page.fill("#password", "longpassword");
    await page.click("#signup button[type=submit]");
    await page.waitForSelector("#join");
    assert.deepEqual(await page.done(), []);
  });

  test("forgot password sends a reset email, with the email filled in", async () => {
    const page = await openApp({ setup: household({ loggedIn: false }) });
    await page.fill("#email", "batel@example.com");
    await page.click("#forgot");
    assert.equal(await page.inputValue("#email"), "batel@example.com");
    await page.click("#forgot button[type=submit]");
    await page.waitForSelector("text=Check your email");
    const call = await fakeState(page, (f) => f.calls.find((c) => c.fn === "resetPasswordForEmail"));
    assert.equal(call.email, "batel@example.com");
    assert.deepEqual(await page.done(), []);
  });

  test("forgot password: back returns to log in", async () => {
    const page = await openApp({ setup: household({ loggedIn: false }) });
    await page.click("#forgot");
    await page.click("#back");
    await page.waitForSelector("#login");
    assert.deepEqual(await page.done(), []);
  });
});

describe("invite links", () => {
  test("remembers the code through log in and fills it in", async () => {
    const setup = household({ loggedIn: false });
    setup.tables.household_members = [];    // Batel isn't in a household yet
    const page = await openApp({ setup, query: "?invite=abc123" });
    await page.waitForSelector(".banner");
    assert.match(await page.textContent(".banner"), /invited/);
    assert.equal(new URL(page.url()).search, "", "the code is removed from the address bar");

    await page.fill("#email", "batel@example.com");
    await page.fill("#password", "goodpass1");
    await page.click("#login button[type=submit]");
    await page.waitForSelector("#join");
    assert.equal(await page.inputValue("#join-code"), "ABC123");
    assert.deepEqual(await page.done(), []);
  });

  test("already in a household: the invite is ignored with a message", async () => {
    const page = await openApp({ setup: household(), query: "?invite=XYZ" });
    await page.waitForSelector(".topbar");
    await page.waitForSelector(".toast");
    assert.match(await page.textContent(".toast"), /already in a household/);
    assert.deepEqual(await page.done(), []);
  });
});

describe("password reset link", () => {
  test("opening the reset link asks for a new password", async () => {
    const page = await openApp({ setup: household() });
    await page.waitForSelector(".topbar");
    // What Supabase does when someone opens the link from the reset email:
    await page.evaluate(() => window.__fake.authListeners.forEach((cb) => cb("PASSWORD_RECOVERY", window.__fake.session)));
    await page.waitForSelector("#setpw");
    await page.fill("#password", "brandnewpass");
    await page.click("#setpw button[type=submit]");
    await page.waitForSelector(".topbar");
    const call = await fakeState(page, (f) => f.calls.find((c) => c.fn === "updateUser"));
    assert.deepEqual(call.attrs, { password: "brandnewpass" });
    assert.deepEqual(await page.done(), []);
  });

  test("a rejected new password shows the reason", async () => {
    const page = await openApp({ setup: { ...household(), failures: { "auth:updateUser": "Password is too weak" } } });
    await page.waitForSelector(".topbar");
    await page.evaluate(() => window.__fake.authListeners.forEach((cb) => cb("PASSWORD_RECOVERY", window.__fake.session)));
    await page.waitForSelector("#setpw");
    await page.fill("#password", "weakweak");
    await page.click("#setpw button[type=submit]");
    await page.waitForSelector("#setpw .error:not(:empty)");
    assert.equal(await page.textContent("#setpw .error"), "Password is too weak");
    assert.deepEqual(await page.done(), []);
  });
});

describe("problems", () => {
  test("can't load your household → a friendly error with Try again", async () => {
    const page = await openApp({ setup: { ...household(), failures: { "from:household_members:select": "network down" } } });
    await page.waitForSelector("text=Can't reach the pantry");
    assert.match(await page.textContent("#app"), /network down/);
    assert.deepEqual(await page.done(), []);
  });
});
