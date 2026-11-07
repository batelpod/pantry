# Working Notes

Read this first when picking the project back up. It says where we are,
how the code is organised, and what's next, so nobody has to re-read all the code.

## Current status

- **Step:** 1 (Setup), in progress
- **Live app:** https://batelpod.github.io/pantry (once GitHub Pages is on)
- **Repo:** https://github.com/batelpod/pantry
- **Supabase project:** not created yet (step 2)

## Next action

Turn on GitHub Pages and confirm the placeholder page loads on a phone.
Then start step 2: create the Supabase project.

## How the code is organised

| File | What it does |
|---|---|
| `index.html` | The single page. Loads the styles and `js/app.js`. |
| `css/styles.css` | All styling. Colours and fonts are variables at the top. Light + dark mode. |
| `js/config.js` | Settings: Supabase URL and public key (filled in during step 2). |
| `js/app.js` | Starting point of the app. |
| `PLAN.md` | Goals, decisions, data model, step checklist. |
| `NOTES.md` | This file: status, structure, change log. |

Planned (added in later steps): `js/supabase.js` (connection), `js/auth.js` (log in,
households, invites), `js/items.js` (inventory data), `js/ui/*.js` (screens),
`supabase/schema.sql` (tables + security rules, run once in Supabase).

## Conventions

- No build tools. Every file is served as-is by GitHub Pages.
- Libraries load from a CDN with a pinned version.
- Only the Supabase **public (anon) key** ever goes in the code. Never the service key.
- Every database rule lives in `supabase/schema.sql` so it can be reviewed.

## Change log

- **2026-11-07** · Step 1: created repo, PLAN.md, NOTES.md, placeholder page.
