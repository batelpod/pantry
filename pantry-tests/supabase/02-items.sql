-- =====================================================================
-- Home Pantry · database setup · Step 3: items
--
-- Run AFTER schema.sql. How: Supabase → SQL Editor → New query →
-- paste this whole file → Run. Safe to run again.
--
-- What it creates:
--   items        everything in the house: name, place, quantity, "buy more" level…
--   adjust_qty() the + / − buttons: adds to the quantity in one step, so two
--                people tapping at once never overwrite each other
--   a trigger    stamps who changed an item and when. The app can't fake it.
--   realtime     lets other phones see changes the moment they happen
-- =====================================================================


-- ---------- Table ----------

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  category      text check (char_length(category) <= 40),
  location      text not null default 'Pantry' check (char_length(location) between 1 and 30),
  qty           numeric(10,2) not null default 0 check (qty >= 0),
  unit          text not null default 'pcs' check (char_length(unit) between 1 and 20),
  min_qty       numeric(10,2) not null default 0 check (min_qty >= 0),  -- "buy more at or below"
  expires_on    date,
  barcode       text,          -- used in step 7
  photo_path    text,          -- used in step 6
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists items_household_idx on public.items (household_id);


-- ---------- Who changed it, and when (set by the database, not the app) ----------

create or replace function public.stamp_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    -- An item can't be moved to another household, and its creation info is fixed.
    new.household_id := old.household_id;
    new.created_at   := old.created_at;
    new.created_by   := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_item on public.items;
create trigger stamp_item
  before insert or update on public.items
  for each row execute function public.stamp_item();


-- ---------- Security: only household members can see or change items ----------

alter table public.items enable row level security;
revoke all on public.items from anon;

drop policy if exists "members read items"   on public.items;
drop policy if exists "members add items"    on public.items;
drop policy if exists "members edit items"   on public.items;
drop policy if exists "members delete items" on public.items;

create policy "members read items"   on public.items
  for select to authenticated using (public.is_member(household_id));
create policy "members add items"    on public.items
  for insert to authenticated with check (public.is_member(household_id));
create policy "members edit items"   on public.items
  for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members delete items" on public.items      -- everyone in the house may delete
  for delete to authenticated using (public.is_member(household_id));


-- ---------- + / − buttons ----------
-- "security invoker" means the security rules above still apply:
-- you can only adjust items in your own household.

create or replace function public.adjust_qty(p_item uuid, p_delta numeric)
returns public.items
language sql security invoker
as $$
  update public.items
     set qty = greatest(0, qty + p_delta)
   where id = p_item
  returning *;
$$;

revoke execute on function public.adjust_qty(uuid, numeric) from public, anon;
grant  execute on function public.adjust_qty(uuid, numeric) to authenticated;


-- ---------- Live updates ----------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
