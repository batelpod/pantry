// Helpers for screen tests: start the app in a real (headless) Chromium browser,
// phone-sized, with the fake Supabase instead of the real one.
// Also records which lines of the app's code ran, for the coverage report.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_PATH = path.join(ROOT, "tests/fakes/supabase-fake.js");
const RAW_DIR = path.join(ROOT, "coverage/raw");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };

// A tiny web server for the repo folder, like GitHub Pages but on this computer.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://x");
      let file = path.join(ROOT, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      try {
        const body = await fs.readFile(file);
        res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
      } catch { res.writeHead(404).end("not found"); }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let browser, server, baseUrl;

// Call once per test file (in before()).
export async function startBrowser() {
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
}

// Call once per test file (in after()).
export async function stopBrowser() {
  await browser?.close();
  await new Promise((r) => server?.close(r));
}

// Open the app. `setup` = starting data for the fake: { session, tables, passwords, confirmEmail, failures }.
// `query` = extra address part, e.g. "?invite=ABC".
export async function openApp({ setup = {}, query = "", colorScheme = "light" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();

  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });

  const fakeSource = await fs.readFile(FAKE_PATH, "utf8");
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fakeSource }));
  await page.addInitScript((s) => { window.__fakeSetup = s; }, setup);

  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(baseUrl + query);

  // Close the page and save what code ran.
  page.done = async () => {
    const entries = await page.coverage.stopJSCoverage();
    const result = entries
      .filter((e) => e.url.startsWith(baseUrl) && new URL(e.url).pathname.startsWith("/js/"))
      .map((e) => ({ url: "file://" + path.join(ROOT, new URL(e.url).pathname), functions: e.functions }));
    await fs.mkdir(RAW_DIR, { recursive: true });
    await fs.writeFile(path.join(RAW_DIR, `browser-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`), JSON.stringify({ result }));
    await context.close();
    return page.errors;
  };
  return page;
}

// Read the fake's state or run something on it, inside the page.
export const fakeState = (page, fn = (f) => f) => page.evaluate(`(${fn.toString()})(window.__fake)`);

// Common starting data: Batel (owner) and Dana in "Our Home".
export function household({ items = [], loggedIn = true } = {}) {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  return {
    session: loggedIn ? { user: { id: "u1", email: "batel@example.com" } } : null,
    passwords: { "batel@example.com": "goodpass1" },
    tables: {
      households: [{ id: "h1", name: "Our Home" }],
      household_members: [
        { household_id: "h1", user_id: "u1", display_name: "Batel", role: "owner", joined_at: "2026-01-01" },
        { household_id: "h1", user_id: "u2", display_name: "Dana", role: "member", joined_at: "2026-01-02" },
      ],
      invites: [],
      items: items.map((it, i) => ({
        id: `i${i + 1}`, household_id: "h1", category: null, location: "Pantry", qty: 1, unit: "pcs", min_qty: 0,
        expires_on: null, barcode: null, photo_path: null, on_list: false, in_cart: false, buy_qty: null,
        created_at: ago(5000), updated_at: ago(it.minutesAgo ?? 60), updated_by: it.by ?? "u2", ...it,
      })),
    },
  };
}

// A date `days` from today, like the database stores it.
export function dayFromToday(days) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
