// Account functions (js/auth.js): sign up, log in, log out, password reset.

import "../helpers/node-setup.mjs";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../fakes/supabase-fake.js";

const auth = await import("../../js/auth.js");

beforeEach(() => fake.reset());

describe("signUp", () => {
  test("asks for email confirmation (Supabase default)", async () => {
    const res = await auth.signUp("a@example.com", "password1");
    assert.deepEqual(res, { needsConfirmation: true });
    // email links must come back to the app
    assert.equal(fake.calls.at(-1).options.emailRedirectTo, "https://batelpod.github.io/pantry/");
  });
  test("logs straight in when confirmation is off", async () => {
    fake.confirmEmail = false;
    assert.deepEqual(await auth.signUp("a@example.com", "password1"), { needsConfirmation: false });
  });
  test("error is passed on", async () => {
    fake.failNext("auth:signUp", "User already registered");
    await assert.rejects(auth.signUp("a@example.com", "password1"), /already registered/);
  });
});

describe("logIn", () => {
  test("right password logs in", async () => {
    fake.passwords["a@example.com"] = "password1";
    await auth.logIn("a@example.com", "password1");
    assert.equal((await auth.currentUser()).email, "a@example.com");
  });
  test("wrong password → clear message", async () => {
    await assert.rejects(auth.logIn("a@example.com", "nope"), { message: "Email or password is wrong." });
  });
  test("unconfirmed email → tells you to check your inbox", async () => {
    fake.failNext("auth:signInWithPassword", "Email not confirmed");
    await assert.rejects(auth.logIn("a@example.com", "x"), /check your inbox/i);
  });
  test("other errors keep their message", async () => {
    fake.failNext("auth:signInWithPassword", "Too many requests");
    await assert.rejects(auth.logIn("a@example.com", "x"), /Too many requests/);
  });
});

describe("logOut, currentUser", () => {
  test("no one logged in → null", async () => assert.equal(await auth.currentUser(), null));
  test("log out clears the session", async () => {
    fake.signIn();
    await auth.logOut();
    assert.equal(await auth.currentUser(), null);
  });
});

describe("password reset", () => {
  test("reset email links back to the app", async () => {
    await auth.sendPasswordReset("a@example.com");
    assert.equal(fake.calls.at(-1).options.redirectTo, "https://batelpod.github.io/pantry/");
  });
  test("reset error is passed on", async () => {
    fake.failNext("auth:resetPasswordForEmail", "rate limit");
    await assert.rejects(auth.sendPasswordReset("a@example.com"), /rate limit/);
  });
  test("set a new password", async () => {
    await auth.setNewPassword("newpass123");
    assert.deepEqual(fake.calls.at(-1).attrs, { password: "newpass123" });
  });
  test("new password error is passed on", async () => {
    fake.failNext("auth:updateUser", "Password should be at least 8 characters");
    await assert.rejects(auth.setNewPassword("x"), /at least 8/);
  });
});

describe("connection settings (js/config.js)", () => {
  test("points at a Supabase project and uses only the public key", async () => {
    const cfg = await import("../../js/config.js");
    assert.match(cfg.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
    assert.match(cfg.SUPABASE_KEY, /^sb_publishable_/, "only the public key may be in the code");
    assert.ok(cfg.PLACES.includes("Pantry"));
  });
});
