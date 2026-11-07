// Household functions (js/household.js): create, invite, join, members, names.

import "../helpers/node-setup.mjs";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../fakes/supabase-fake.js";

const hh = await import("../../js/household.js");

beforeEach(() => {
  fake.reset();
  fake.signIn({ id: "u1", email: "a@example.com" });
});

describe("getMyMembership", () => {
  test("null when not in a household yet", async () => {
    assert.equal(await hh.getMyMembership("u1"), null);
  });
  test("returns household name and my role", async () => {
    await hh.createHousehold("  Our Home ", " Batel ");
    const me = await hh.getMyMembership("u1");
    assert.equal(me.household_name, "Our Home");
    assert.equal(me.display_name, "Batel");
    assert.equal(me.role, "owner");
  });
  test("falls back to a default name if the household name is missing", async () => {
    fake.tables.household_members.push({ household_id: "gone", user_id: "u1", display_name: "B", role: "member" });
    assert.equal((await hh.getMyMembership("u1")).household_name, "Our home");
  });
  test("error is passed on", async () => {
    fake.failNext("from:household_members:select", "boom");
    await assert.rejects(hh.getMyMembership("u1"), /boom/);
  });
});

describe("createHousehold", () => {
  test("can't create a second one", async () => {
    await hh.createHousehold("A", "B");
    await assert.rejects(hh.createHousehold("C", "D"), /already in a household/);
  });
});

describe("invites and joining", () => {
  test("invite link points back to this app with the code", async () => {
    await hh.createHousehold("Home", "Batel");
    const { code, link } = await hh.createInviteLink();
    assert.match(code, /^CODE\d+$/);
    assert.equal(link, `https://batelpod.github.io/pantry/?invite=${code}`);
  });
  test("someone else can join with the code (any letter case)", async () => {
    await hh.createHousehold("Home", "Batel");
    const { code } = await hh.createInviteLink();
    fake.signIn({ id: "u2", email: "dana@example.com" });
    const name = await hh.joinHousehold(code.toLowerCase(), "Dana");
    assert.equal(name, "Home");
    assert.equal((await hh.getMyMembership("u2")).role, "member");
  });
  test("a wrong code shows the database's message", async () => {
    await assert.rejects(hh.joinHousehold("WRONG", "Dana"), /wrong or has expired/);
  });
  test("no household → can't invite", async () => {
    await assert.rejects(hh.createInviteLink(), /not in a household/);
  });
  test("an error without a message gets a friendly default", async () => {
    fake.failNext("rpc:create_invite", "");
    await assert.rejects(hh.createInviteLink(), /Something went wrong/);
  });
});

describe("members and display names", () => {
  test("lists members and lets me rename myself", async () => {
    const hid = await (async () => { await hh.createHousehold("Home", "Batel"); return (await hh.getMyMembership("u1")).household_id; })();
    await hh.updateDisplayName(hid, "u1", "Batel P");
    const members = await hh.listMembers(hid);
    assert.deepEqual(members.map((m) => m.display_name), ["Batel P"]);
  });
  test("list error is passed on", async () => {
    fake.failNext("from:household_members:select", "boom");
    await assert.rejects(hh.listMembers("h1"), /boom/);
  });
  test("rename error is passed on", async () => {
    fake.failNext("from:household_members:update", "boom");
    await assert.rejects(hh.updateDisplayName("h1", "u1", "X"), /boom/);
  });
});
