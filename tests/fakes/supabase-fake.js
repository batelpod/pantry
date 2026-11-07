// A pretend Supabase, used only by the tests.
//
// It stands in for the real supabase-js library (same function names), keeps
// all data in memory, and records every call so tests can check them.
// It runs both in Node (unit tests) and in the browser (screen tests).
//
// Tests control it through `fake`:
//   fake.reset()                      start fresh
//   fake.signIn(user)                 pretend someone is logged in
//   fake.tables.items.push({...})     put data in
//   fake.failNext("rpc:create_invite", "message")   make the next such call fail
//   fake.emit("UPDATE", row)          pretend another phone changed an item (live update)
//   fake.calls                        everything the app asked for

const blank = () => ({ households: [], household_members: [], invites: [], items: [] });

export const fake = {
  tables: blank(),
  session: null,
  passwords: {},            // email → password, for log in
  confirmEmail: true,       // sign up needs email confirmation (Supabase default)
  calls: [],
  failures: {},             // "rpc:name" / "from:table:op" / "auth:fn" → message
  authListeners: [],
  channels: [],
  nextId: 1,

  reset() {
    Object.assign(this, {
      tables: blank(), session: null, passwords: {}, confirmEmail: true,
      calls: [], failures: {}, authListeners: [], channels: [], nextId: 1,
    });
  },
  signIn(user = { id: "u1", email: "batel@example.com" }) {
    this.session = { user };
    return user;
  },
  failNext(key, message) { this.failures[key] = message; },
  emit(event, row) {
    for (const ch of this.channels) {
      for (const l of ch.listeners) {
        if (l.spec.event !== event) continue;
        if (l.spec.filter) {
          const [col, val] = l.spec.filter.split("=eq.");
          if (String(row[col]) !== val) continue;
        }
        l.cb(event === "DELETE" ? { old: { id: row.id } } : { new: { ...row } });
      }
    }
  },
};
globalThis.__fake = fake;   // lets browser tests reach it

// ---------- helpers ----------

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}${fake.nextId++}`;
const err = (message) => ({ message });
const uid = () => fake.session?.user?.id ?? null;

function failure(key) {
  if (key in fake.failures) {
    const m = fake.failures[key];
    delete fake.failures[key];
    return err(m);
  }
  return null;
}

function stamp(row, isNew) {
  const t = now();
  if (isNew) { row.created_at = t; row.created_by = uid(); }
  row.updated_at = t; row.updated_by = uid();
  return row;
}

const itemDefaults = () => ({
  category: null, location: "Pantry", qty: 0, unit: "pcs", min_qty: 0, expires_on: null,
  barcode: null, photo_path: null, on_list: false, in_cart: false, buy_qty: null,
});

// ---------- table queries: supabase.from("items").select(...).eq(...) ----------

function query(table) {
  const q = { op: "select", filters: [], values: null, single: false, maybe: false, order: null };
  const api = {
    select() { return api; },
    insert(v) { q.op = "insert"; q.values = v; return api; },
    update(v) { q.op = "update"; q.values = v; return api; },
    delete() { q.op = "delete"; return api; },
    eq(col, val) { q.filters.push([col, val]); return api; },
    order(col) { q.order = col; return api; },
    single() { q.single = true; return api; },
    maybeSingle() { q.single = true; q.maybe = true; return api; },
    then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
  };

  function run() {
    fake.calls.push({ type: "from", table, op: q.op, filters: q.filters, values: q.values });
    const f = failure(`from:${table}:${q.op}`);
    if (f) return { data: null, error: f };

    const rows = fake.tables[table];
    const match = (r) => q.filters.every(([c, v]) => r[c] === v);
    let out;
    if (q.op === "insert") {
      const row = table === "items" ? { ...itemDefaults(), ...q.values } : { ...q.values };
      row.id ??= id("i");
      if (table === "items") stamp(row, true);
      rows.push(row);
      out = [row];
    } else if (q.op === "update") {
      out = rows.filter(match);
      out.forEach((r) => { Object.assign(r, q.values); if (table === "items") stamp(r); });
    } else if (q.op === "delete") {
      out = rows.filter(match);
      fake.tables[table] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
      if (q.order) out = [...out].sort((a, b) => String(a[q.order]).localeCompare(String(b[q.order])));
    }

    out = out.map((r) => (table === "household_members"
      ? { ...r, households: { name: fake.tables.households.find((h) => h.id === r.household_id)?.name } }
      : { ...r }));

    if (q.single) {
      if (!out.length && !q.maybe) return { data: null, error: err("No rows found") };
      return { data: out[0] ?? null, error: null };
    }
    return { data: out, error: null };
  }
  return api;
}

// ---------- database functions: supabase.rpc("name", args) ----------

const rpcs = {
  create_household({ p_name, p_display_name }) {
    if (fake.tables.household_members.some((m) => m.user_id === uid())) throw err("You are already in a household.");
    const hid = id("h");
    fake.tables.households.push({ id: hid, name: p_name.trim(), created_by: uid() });
    fake.tables.household_members.push({ household_id: hid, user_id: uid(), display_name: p_display_name.trim(), role: "owner", joined_at: now() });
    return hid;
  },
  join_household({ p_code, p_display_name }) {
    if (fake.tables.household_members.some((m) => m.user_id === uid())) throw err("You are already in a household.");
    const inv = fake.tables.invites.find((i) => i.code === p_code.trim().toUpperCase());
    if (!inv) throw err("This invite code is wrong or has expired.");
    fake.tables.household_members.push({ household_id: inv.household_id, user_id: uid(), display_name: p_display_name.trim(), role: "member", joined_at: now() });
    return fake.tables.households.find((h) => h.id === inv.household_id).name;
  },
  create_invite() {
    const me = fake.tables.household_members.find((m) => m.user_id === uid());
    if (!me) throw err("You are not in a household.");
    const code = "CODE" + String(fake.nextId++).padStart(6, "0");
    fake.tables.invites.push({ code, household_id: me.household_id });
    return code;
  },
  adjust_qty({ p_item, p_delta }) {
    const r = fake.tables.items.find((i) => i.id === p_item);
    if (!r) return null;
    r.qty = Math.max(0, Number(r.qty) + p_delta);
    return { ...stamp(r) };
  },
  finish_shopping({ p_household }) {
    const cart = fake.tables.items.filter((i) => i.household_id === p_household && i.in_cart);
    cart.forEach((i) => {
      i.qty = Number(i.qty) + Number(i.buy_qty ?? 1);
      Object.assign(i, { in_cart: false, on_list: false, buy_qty: null });
      stamp(i);
    });
    return cart.map((i) => ({ ...i }));
  },
};

async function rpc(name, args = {}) {
  fake.calls.push({ type: "rpc", name, args });
  const f = failure(`rpc:${name}`);
  if (f) return { data: null, error: f };
  try { return { data: rpcs[name](args), error: null }; }
  catch (e) { return { data: null, error: e }; }
}

// ---------- logins: supabase.auth.* ----------

function emitAuth(event) {
  for (const cb of fake.authListeners) cb(event, fake.session);
}

const auth = {
  async getSession() { return { data: { session: fake.session } }; },
  onAuthStateChange(cb) {
    fake.authListeners.push(cb);
    setTimeout(() => cb("INITIAL_SESSION", fake.session), 0);
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async signUp({ email, password, options }) {
    fake.calls.push({ type: "auth", fn: "signUp", email, options });
    const f = failure("auth:signUp"); if (f) return { data: {}, error: f };
    fake.passwords[email] = password;
    if (fake.confirmEmail) return { data: { session: null }, error: null };
    fake.signIn({ id: id("new-user-"), email }); emitAuth("SIGNED_IN");
    return { data: { session: fake.session }, error: null };
  },
  async signInWithPassword({ email, password }) {
    fake.calls.push({ type: "auth", fn: "signInWithPassword", email });
    const f = failure("auth:signInWithPassword"); if (f) return { error: f };
    if (fake.passwords[email] !== password) return { error: err("Invalid login credentials") };
    fake.signIn({ id: "u1", email }); emitAuth("SIGNED_IN");
    return { error: null };
  },
  async signOut() {
    fake.calls.push({ type: "auth", fn: "signOut" });
    fake.session = null; emitAuth("SIGNED_OUT");
    return { error: null };
  },
  async resetPasswordForEmail(email, options) {
    fake.calls.push({ type: "auth", fn: "resetPasswordForEmail", email, options });
    return { error: failure("auth:resetPasswordForEmail") };
  },
  async updateUser(attrs) {
    fake.calls.push({ type: "auth", fn: "updateUser", attrs });
    return { error: failure("auth:updateUser") };
  },
};

// ---------- live updates: supabase.channel(...).on(...).subscribe() ----------

function channel(name) {
  const ch = { name, listeners: [] };
  const api = {
    on(_type, spec, cb) { ch.listeners.push({ spec, cb }); return api; },
    subscribe() { fake.channels.push(ch); return api; },
    _ch: ch,
  };
  return api;
}

export function createClient(url, key, options) {
  fake.calls.push({ type: "createClient", url, key, options });
  return {
    from: query,
    rpc,
    auth,
    channel,
    removeChannel(api) { fake.channels = fake.channels.filter((c) => c !== api._ch); },
  };
}

// Browser tests can prepare data before the app starts by setting
// window.__fakeSetup = { session, tables, passwords, confirmEmail } (see tests/helpers/browser.mjs).
if (globalThis.__fakeSetup) {
  const s = globalThis.__fakeSetup;
  if (s.session) fake.session = s.session;
  if (s.tables) Object.assign(fake.tables, s.tables);
  if (s.passwords) fake.passwords = s.passwords;
  if ("confirmEmail" in s) fake.confirmEmail = s.confirmEmail;
  if (s.failures) fake.failures = s.failures;
}
