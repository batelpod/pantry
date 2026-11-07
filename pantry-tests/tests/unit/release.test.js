// Release checks for index.html: every app file is in the version list,
// and all version numbers match (see "Releasing a new version" in NOTES.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

function jsFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? jsFiles(`${dir}/${d.name}`) : d.name.endsWith(".js") ? [`./${dir}/${d.name}`] : []);
}

test("every app JavaScript file is in the version list", () => {
  const missing = jsFiles("js").filter((f) => !(f in map));
  assert.deepEqual(missing, [], `add these to the import map in index.html: ${missing.join(", ")}`);
});

test("every entry points to its own file with ?v=", () => {
  for (const [from, to] of Object.entries(map)) assert.equal(to.split("?v=")[0], from);
});

test("all version numbers match, including the stylesheet", () => {
  const versions = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
  assert.equal(versions.size, 1, `found different versions: ${[...versions].join(", ")}`);
});
