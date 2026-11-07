# Home Pantry: Project Plan

A mobile-first web app for our household to track food and household supplies:
what we have, where it is, what's running low, and who changed what.

## Goals

- Everyone in the household can add, edit, delete and update items.
- Each item shows who updated it last and when, plus a history of changes.
- Shopping list of everything at or below its "buy more" level.
- Barcode scanning (live camera) with product lookup.
- A photo for each item.
- Works great on a phone; can be added to the home screen.
- Code is easy to read and review: no build step, plain HTML/CSS/JavaScript.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Hosting | GitHub Pages: `batelpod.github.io/pantry` | Free, serves straight from this repo |
| Backend | Supabase (free plan) | Logins, shared database, photo storage in one place |
| Accounts | Our own app accounts (email + password), not Claude accounts | Household members just need an email |
| Households | One household, members join by invite | Keeps data private to the household |
| Permissions | Every member can add, edit and delete | Requested by owner |
| Language | English | Requested by owner |
| Code style | Plain JavaScript modules, no frameworks, no build tools | Easy to review; nothing to install |
| Barcode lookup | Open Food Facts (free, public) | No API key needed |
| Security | Supabase Row Level Security: only household members can read/write | Public code, private data |

## Data model (draft, finalised in step 2–3)

- **households**: id, name, created_by, created_at
- **household_members**: household_id, user_id, display_name, role (owner / member), joined_at
- **invites**: code, household_id, created_by, expires_at, used_by
- **items**: id, household_id, name, category, location, qty, unit, min_qty,
  expires_on, barcode, photo_path, created_at, updated_at, updated_by
- **item_events** (history): id, item_id, household_id, user_id, action
  (created / qty / edited / deleted), delta, details, created_at.
  Keep the latest 50 per item.

Places: Pantry, Fridge, Freezer, Spices, Cleaning, Bathroom, Other.

## Steps

Each step ends with code uploaded to GitHub, the app checked on a phone,
and NOTES.md updated.

- [x] **1. Setup**: GitHub account, repository, project skeleton, GitHub Pages live
- [x] **2. Users & household**: Supabase project, sign up / log in / log out,
      create household, invite link, join household, display names
- [x] **3. Core inventory**: database tables + security rules; list grouped by place;
      add / edit / delete; + / − buttons; search and place filters;
      "updated by … · time ago"; live updates from other members
- [x] **4. Shopping list**: low-stock view, tick off while shopping, copy/share list
- [ ] **5. Item history**: log every change, show per-item timeline
- [ ] **6. Photos**: take or pick a photo, store in Supabase Storage, thumbnails
- [ ] **7. Barcodes**: live camera scanning, look up product in Open Food Facts,
      scan an existing item to jump to it / +1
- [ ] **8. Polish**: add-to-home-screen (PWA), offline-friendly, expiry reminders,
      final code review

## Later: work without uploading files

Saved for later (agreed 2026-11-07). Not started.

- [ ] **Claude Code on the web**: connect claude.ai/code to GitHub (Claude GitHub app,
      access to the `pantry` repo only). Claude makes changes and opens a pull request;
      owner reviews on GitHub and clicks Merge. No more zips or manual uploads.
- [ ] **Supabase connector**: connect Supabase in claude.ai Settings → Connectors so Claude
      can run the database scripts (after showing them and getting an OK).
- First message for the new session: "Read NOTES.md and PLAN.md first. We're working step by
  step, and you must propose each step and wait for my OK before writing code."

