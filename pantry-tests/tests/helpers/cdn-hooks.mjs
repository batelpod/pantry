// Node module hook: when app code imports the Supabase library from the CDN,
// hand it our fake instead (tests/fakes/supabase-fake.js).

const FAKE = new URL("../fakes/supabase-fake.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://cdn.jsdelivr.net/npm/@supabase/supabase-js")) {
    return { url: FAKE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
