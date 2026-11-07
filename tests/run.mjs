// Runs all tests and the coverage report. This is what `npm test` does,
// on GitHub (automatically) or on a computer.
//
//   1. Unit tests   (tests/unit/*.test.js) in Node: rules and data functions
//   2. Screen tests (tests/ui/*.test.js) in a headless Chromium browser
//   3. Coverage report: fails if below the goal (see tests/coverage-report.mjs)
//
// Exit code 0 = everything passed, 1 = something failed.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { report } from "./coverage-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.rmSync(path.join(ROOT, "coverage"), { recursive: true, force: true });

function run(title, args, env = {}) {
  console.log(`\n=== ${title} ===\n`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
  return r.status === 0;
}

const unitOk = run("Unit tests", ["--test", "--test-reporter=spec", "tests/unit/*.test.js"],
  { NODE_V8_COVERAGE: path.join(ROOT, "coverage/raw-node") });

const uiOk = run("Screen tests", ["--test", "--test-reporter=spec", "--test-concurrency=2", "tests/ui/*.test.js"]);

const coverageOk = report();

console.log(`\nUnit tests: ${unitOk ? "✅ passed" : "❌ failed"} · Screen tests: ${uiOk ? "✅ passed" : "❌ failed"} · Coverage: ${coverageOk ? "✅" : "❌"}`);
process.exit(unitOk && uiOk && coverageOk ? 0 : 1);
