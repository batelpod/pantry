// Starting point of the app.
//
// Step 1: shows a placeholder page so we can confirm hosting works.
// From step 2 on, this file decides which screen to show
// (log in, join household, or the inventory).

import { SUPABASE_URL } from "./config.js";

const app = document.getElementById("app");

const steps = [
  ["Setup", true],
  ["Users & household", false],
  ["Core inventory", false],
  ["Shopping list", false],
  ["Item history", false],
  ["Photos", false],
  ["Barcodes", false],
  ["Polish", false],
];

app.innerHTML = `
  <h1>Home Pantry</h1>
  <p class="muted">The app is online. Features arrive step by step.</p>
  <section class="card">
    <ul class="checklist">
      ${steps.map(([name, done]) => `<li class="${done ? "done" : ""}">${name}</li>`).join("")}
    </ul>
  </section>
  <p class="muted">Database: ${SUPABASE_URL ? "configured" : "not connected yet"}</p>
`;
