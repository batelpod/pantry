// Coverage report: which lines of the app's code (js/) ran during the tests.
//
// Both kinds of tests record raw coverage in the format V8 (the JavaScript engine
// in Node and Chrome) produces:
//   coverage/raw-node/   from unit tests (Node writes these itself)
//   coverage/raw/        from screen tests (tests/helpers/browser.mjs saves these)
// This script combines them, prints a table, writes coverage/index.html,
// and fails if total line coverage is below the threshold.
//
// How a line counts: a line with code is "covered" if the code at its start ran
// in at least one test. Blank lines, comments and lines with only closing
// brackets are not counted.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const THRESHOLD = 80; // percent of lines

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "coverage");

// ---------- collect ----------

function appFiles(dir = path.join(ROOT, "js")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? appFiles(path.join(dir, d.name)) : d.name.endsWith(".js") ? [path.join(dir, d.name)] : []);
}

function rawEntries() {
  const entries = [];
  for (const sub of ["raw", "raw-node"]) {
    const dir = path.join(OUT, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const e of data.result || []) {
        if (!e.url?.startsWith("file://")) continue;
        const file = fileURLToPath(e.url.split("?")[0]);
        if (file.startsWith(path.join(ROOT, "js") + path.sep)) entries.push({ file, functions: e.functions });
      }
    }
  }
  return entries;
}

// ---------- measure ----------

// Which lines hold code worth counting?
function codeLines(source) {
  const lines = source.split("\n");
  let offset = 0, inBlockComment = false;
  const result = [];
  lines.forEach((text, i) => {
    const trimmed = text.trim();
    const first = offset + (text.length - text.trimStart().length);
    let counts = trimmed !== "";
    if (inBlockComment) { counts = false; if (trimmed.includes("*/")) inBlockComment = false; }
    else if (trimmed.startsWith("/*")) { counts = false; if (!trimmed.includes("*/")) inBlockComment = true; }
    else if (trimmed.startsWith("//")) counts = false;
    else if (/^[\]})>;,`'"\s]*$/.test(trimmed)) counts = false;   // only closing brackets
    result.push({ number: i + 1, text, offset: first, counts });
    offset += text.length + 1;
  });
  return result;
}

// How many times did the code at `offset` run? The innermost (smallest) range wins.
function countAt(functions, offset) {
  let best = null;
  for (const fn of functions) {
    for (const r of fn.ranges) {
      if (r.startOffset <= offset && offset < r.endOffset &&
          (!best || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) best = r;
    }
  }
  return best ? best.count : 0;
}

export function measure() {
  const entries = rawEntries();
  return appFiles().map((file) => {
    const source = fs.readFileSync(file, "utf8");
    const lines = codeLines(source);
    const runs = entries.filter((e) => e.file === file);
    for (const line of lines) {
      line.covered = line.counts && runs.some((r) => countAt(r.functions, line.offset) > 0);
    }
    const total = lines.filter((l) => l.counts).length;
    const covered = lines.filter((l) => l.covered).length;
    return { file: path.relative(ROOT, file), lines, total, covered, pct: total ? (100 * covered) / total : 100 };
  }).sort((a, b) => a.file.localeCompare(b.file));
}

// ---------- report ----------

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const pctText = (p) => `${p.toFixed(1)}%`;

function writeHtml(files, total) {
  const style = `<style>
    body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#1c2420;background:#fff}
    table{border-collapse:collapse}td,th{padding:4px 12px;border-bottom:1px solid #dde3de;text-align:left}
    .num{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#b3261e}.ok{color:#2f6b4f}
    pre{font:12px/1.6 ui-monospace,Menlo,monospace;margin:0}.l{display:block;padding:0 8px;white-space:pre-wrap}
    .y{background:#e2eee7}.n{background:#fbe3e1}.ln{display:inline-block;width:3em;color:#5d6a63;user-select:none}
  </style>`;
  const rows = files.map((f) => `<tr><td><a href="#${encodeURIComponent(f.file)}">${esc(f.file)}</a></td>
    <td class="num">${f.covered}/${f.total}</td><td class="num ${f.pct < THRESHOLD ? "bad" : "ok"}">${pctText(f.pct)}</td></tr>`).join("");
  const sources = files.map((f) => `<h2 id="${encodeURIComponent(f.file)}">${esc(f.file)} · ${pctText(f.pct)}</h2><pre>${
    f.lines.map((l) => `<span class="l ${l.counts ? (l.covered ? "y" : "n") : ""}"><span class="ln">${l.number}</span>${esc(l.text)}</span>`).join("")}</pre>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>Home Pantry · test coverage</title>${style}
    <h1>Test coverage: ${pctText(total)}</h1><p>Goal: at least ${THRESHOLD}% of lines. Green = ran during tests, red = never ran.</p>
    <table><tr><th>File</th><th class="num">Lines</th><th class="num">Covered</th></tr>${rows}</table>${sources}`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}

export function report() {
  const files = measure();
  const sumTotal = files.reduce((s, f) => s + f.total, 0);
  const sumCovered = files.reduce((s, f) => s + f.covered, 0);
  const total = sumTotal ? (100 * sumCovered) / sumTotal : 100;

  const width = Math.max(...files.map((f) => f.file.length), 5);
  console.log("\nCoverage (lines of app code that ran during tests)\n");
  console.log(`${"File".padEnd(width)}  ${"Lines".padStart(9)}  ${"%".padStart(6)}`);
  for (const f of files) {
    console.log(`${f.file.padEnd(width)}  ${`${f.covered}/${f.total}`.padStart(9)}  ${pctText(f.pct).padStart(6)}`);
  }
  console.log(`${"TOTAL".padEnd(width)}  ${`${sumCovered}/${sumTotal}`.padStart(9)}  ${pctText(total).padStart(6)}`);

  writeHtml(files, total);
  console.log(`\nDetailed report: coverage/index.html`);

  // On GitHub, also show the table on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [`## Test coverage: ${pctText(total)} (goal ${THRESHOLD}%)`, "", "| File | Lines | Covered |", "|---|---:|---:|",
      ...files.map((f) => `| \`${f.file}\` | ${f.covered}/${f.total} | ${f.pct < THRESHOLD ? "⚠️ " : ""}${pctText(f.pct)} |`),
      `| **Total** | **${sumCovered}/${sumTotal}** | **${pctText(total)}** |`, ""].join("\n");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }

  const ok = total >= THRESHOLD;
  console.log(ok ? `\n✅ Coverage ${pctText(total)} meets the ${THRESHOLD}% goal.` : `\n❌ Coverage ${pctText(total)} is below the ${THRESHOLD}% goal.`);
  return ok;
}

// Run directly: node tests/coverage-report.mjs
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(report() ? 0 : 1);
