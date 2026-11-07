# Working Notes

Read this first when picking the project back up. It says where we are,
how the code is organised, and what's next, so nobody has to re-read all the code.

## Current status

- **Step:** 4 (Shopping list): uploaded, being tested. Steps 1–3 done and tested.
- **Current version:** `v=4` (see "Releasing a new version" below)
- **Live app:** https://batelpod.github.io/pantry
- **Repo:** https://github.com/batelpod/pantry
- **Supabase project:** `yyqeisscqglobpaawssk` (region: Central EU / Frankfurt)
  - Site URL + redirect URL set to `https://batelpod.github.io/pantry/`
  - Publishable key is in `js/config.js` (public by design)

## Next action

1. Make sure `supabase/03-shopping.sql` has been run in the Supabase SQL Editor (step 4 code is uploaded).
2. Test: shopping list, tick items, finish shopping, share; ticks show on a second phone.
3. Propose step 5 (item history) and wait for the owner's OK before building.
4. Saved for later: switch to Claude Code on the web + Supabase connector (see PLAN.md, "Later").

## How the code is organised

| File | What it does |
|---|---|
| `index.html` | The single page. Loads the styles and `js/app.js`; holds the version-number list (import map). |
| `css/styles.css` | All styling. Colours and fonts are variables at the top. Light + dark mode. |
| `js/config.js` | Supabase URL + publishable key; list of places. |
| `js/supabase.js` | Creates the one shared Supabase connection (library pinned to v2.45.4 on jsDelivr). |
| `js/app.js` | Decides which screen to show: log in, new password, household setup, or the pantry. |
| `js/auth.js` | Sign up, log in, log out, password reset. |
| `js/household.js` | Create household, invite link, join with code, list members, change display name. |
| `js/ui/dom.js` | Helpers: escape text, show a screen, toast messages, busy buttons, remembered invite code. |
| `js/ui/auth-screens.js` | Log in, sign up, forgot password, check-your-email, set new password screens. |
| `js/ui/household-screens.js` | Join/create household screen; Household page (members, invite, your name). |
| `js/items.js` | Items data: list, add, edit, delete, adjust quantity, watch live changes. |
| `js/ui/format.js` | Shared rules + formatting: low, expiring soon, on shopping list, time ago, numbers. |
| `js/ui/shopping-screen.js` | Shopping list: add to list, tick into cart, how many to buy, finish, share. |
| `js/ui/inventory-screen.js` | Main pantry screen: summary, search, place filters, grouped list, − / +, add/edit sheet. |
| `supabase/schema.sql` | Step 2 database: households, members, invites + security rules. Run first. |
| `supabase/02-items.sql` | Step 3 database: items table, who-changed-it trigger, `adjust_qty()`, live updates. Run second. |
| `supabase/03-shopping.sql` | Step 4 database: shopping columns, smarter "updated by" trigger, `finish_shopping()`. Run third. |
| `PLAN.md` | Goals, decisions, data model, step checklist. |
| `NOTES.md` | This file: status, structure, change log. |

## How users & households work

- Everyone signs up with email + password (Supabase Auth). Email confirmation is on.
- A person belongs to **one** household (`household_members.user_id` is unique).
- First person creates the household and becomes **owner**. Others join with an invite.
- Invites: `create_invite()` makes a 10-character code valid 7 days, reusable until it expires.
  The link is `…/pantry/?invite=CODE`; the app remembers the code through sign-up/log-in.
- Display name is per household and is what others see ("updated by …").
- Security: RLS on all tables; `is_member(household_id)` is the core check.
  Creating, inviting and joining only happen through the SQL functions.

## How the inventory works

- Item fields: name, category, location (place), qty, unit, min_qty ("buy more at or below"),
  expires_on. `barcode` and `photo_path` columns exist already for steps 6–7.
- **Low** = qty ≤ min_qty. **Out** = qty 0. **Expiring soon** = within 7 days (`SOON_DAYS`).
- `updated_by` / `updated_at` are set by a database trigger, so they can't be faked.
  The app turns `updated_by` into a name using the members list.
- + / − taps update the screen instantly and are sent as one `adjust_qty(id, delta)` call
  600 ms after the last tap. The database adds the delta, so simultaneous taps by two people both count.
- Live updates: Supabase Realtime on `items`. The app also reloads when you come back to it.

## How the shopping list works

- On the list if: low (qty ≤ min_qty) **or** `on_list` (added by hand) **or** `in_cart`.
  Rule lives in `onShoppingList()` in `js/ui/format.js`.
- Ticking sets `in_cart` and saves `buy_qty` (default = enough to get back above min_qty).
- `finish_shopping()` adds `buy_qty` to qty for everything in the cart and clears
  `in_cart`, `on_list`, `buy_qty`.
- Adding a name that isn't in the pantry creates a new item (place "Other", qty 0).
- Ticking / list changes do **not** change "Updated by". Only pantry fields do (trigger in 03).

## Releasing a new version

Phones keep copies of files for a while. To make sure everyone gets new code:
1. In `index.html`, find & replace `v=4` with the next number (e.g. `v=5`) everywhere.
2. If a new `.js` file was added, add a line for it in the import map list.
3. Update "Current version" at the top of this file.

## Conventions

- **Working agreement:** before starting any step, propose what it will include and wait for the owner's OK. Never move on to the next step without asking.
- No build tools. Every file is served as-is by GitHub Pages.
- Libraries load from a CDN with a pinned version.
- Only the Supabase **publishable** key ever goes in the code. Never the secret/service key.
- Every database rule lives in the `supabase/` folder (numbered files, run in order) so it can be reviewed.
- All text shown from the database goes through `esc()` before entering HTML.

## Known limits

- Supabase's built-in email sender only allows a few emails per hour. Fine for a household;
  if it becomes a problem, connect a custom email sender (SMTP) in Supabase settings.

## Change log

- **2026-11-07** · Step 1: created repo, PLAN.md, NOTES.md, placeholder page. GitHub Pages live.
- **2026-11-07** · Step 2: accounts (sign up, log in, reset password), households, invites,
  members list, display names. Added `supabase/schema.sql`.
- **2026-11-07** · Step 3: inventory screen, items table, add/edit/delete, + / −, search,
  place filters, low/expiring summary, "updated by", live updates. Household page moved
  behind the "Household" button. Added `supabase/02-items.sql`.
- **2026-11-07** · Step 4 (v=4): shopping list screen, tick into cart, how many to buy,
  finish shopping, share/copy list, "Add to shopping list" option on items, version
  numbers on files. Added `supabase/03-shopping.sql`, `js/ui/format.js`, `js/ui/shopping-screen.js`.
- **2026-11-07** · Decided to keep uploading manually for now; switching to Claude Code on the web
  + Supabase connector saved as a later step in PLAN.md.
