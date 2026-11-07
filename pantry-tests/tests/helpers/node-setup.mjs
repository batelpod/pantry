// Setup for unit tests running in Node.
//
// 1. The app loads the Supabase library from a web address (jsDelivr).
//    Here we redirect that address to our fake, so no network is used.
// 2. A few browser things the app uses (`location`) are given test values.
//
// Each unit test file imports this first, then loads app files with `await import(...)`.

import { register } from "node:module";

register(new URL("./cdn-hooks.mjs", import.meta.url));

globalThis.location = { origin: "https://batelpod.github.io", pathname: "/pantry/", search: "" };
