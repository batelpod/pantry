# Working Notes

Read this first when picking the project back up. It says where we are,
how the code is organised, and what's next, so nobody has to re-read all the code.

## Current status

- **Step:** 2 (Users & household): code written, waiting to be uploaded and tested live
- **Live app:** https://batelpod.github.io/pantry
- **Repo:** https://github.com/batelpod/pantry
- **Supabase project:** `yyqeisscqglobpaawssk` (region: Central EU / Frankfurt)
  - Site URL + redirect URL set to `https://batelpod.github.io/pantry/`
  - Publishable key is in `js/config.js` (public by design)

## Next action

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Upload the step 2 files to GitHub.
3. Test on a phone: sign up → confirm email → create household → invite a second person → they join.
4. Then start step 3: items table + inventory screen.

## How the code is organised

| File | What it does |
|---|---|
| `index.html` | The single page. Loads the styles and `js/app.js`. |
| `css/styles.css` | All styling. Colours and fonts are variables at the top. Light + dark mode. |
| `js/config.js` | Supabase URL + publishable key; list of places. |
| `js/supabase.js` | Creates the one shared Supabase connection (library pinned to v2.45.4 on jsDelivr). |
| `js/app.js` | Decides which screen to show: log in, new password, household setup, or home. |
| `js/auth.js` | Sign up, log in, log out, password reset. |
| `js/household.js` | Create household, invite link, join with code, list members, change display name. |
| `js/ui/dom.js` | Helpers: escape text, show a screen, toast messages, busy buttons, remembered invite code. |
| `js/ui/auth-screens.js` | Log in, sign up, forgot password, check-your-email, set new password screens. |
| `js/ui/household-screens.js` | Join/create household screen; home screen with members + invite. |
| `supabase/schema.sql` | Database tables, security rules, and functions. Run once in the SQL Editor. |
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

## Conventions

- No build tools. Every file is served as-is by GitHub Pages.
- Libraries load from a CDN with a pinned version.
- Only the Supabase **publishable** key ever goes in the code. Never the secret/service key.
- Every database rule lives in `supabase/schema.sql` so it can be reviewed.
- All text shown from the database goes through `esc()` before entering HTML.

## Known limits

- Supabase's built-in email sender only allows a few emails per hour. Fine for a household;
  if it becomes a problem, connect a custom email sender (SMTP) in Supabase settings.

## Change log

- **2026-11-07** · Step 1: created repo, PLAN.md, NOTES.md, placeholder page. GitHub Pages live.
- **2026-11-07** · Step 2: accounts (sign up, log in, reset password), households, invites,
  members list, display names. Added `supabase/schema.sql`.
