-- =====================================================================
-- Home Pantry · database setup · Step 4: shopping list
--
-- Run AFTER 02-items.sql. Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again.
--
-- Adds to items:
--   on_list   added to the shopping list by hand (low items are on it automatically)
--   in_cart   ticked off while shopping (shared, so everyone shopping sees it)
--   buy_qty   how many we're buying (empty = 1)
--
-- finish_shopping() adds what's in the cart to the pantry and clears the list.
-- =====================================================================

alter table public.items add column if not exists on_list boolean not null default false;
alter table public.items add column if not exists in_cart boolean not null default false;
alter table public.items add column if not exists buy_qty numeric(10,2) check (buy_qty is null or buy_qty > 0);


-- ---------- "Updated by" should mean the pantry changed ----------
-- Ticking something on the shopping list shouldn't count as "updating" the item,
-- so the stamp only moves when a pantry field changes. (Replaces the step 3 version.)

create or replace function public.stamp_item()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
  end if;

  -- An item can't be moved to another household, and its creation info is fixed.
  new.household_id := old.household_id;
  new.created_at   := old.created_at;
  new.created_by   := old.created_by;

  if (new.name, new.category, new.location, new.qty, new.unit, new.min_qty,
      new.expires_on, new.barcode, new.photo_path)
     is distinct from
     (old.name, old.category, old.location, old.qty, old.unit, old.min_qty,
      old.expires_on, old.barcode, old.photo_path)
  then
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;


-- ---------- Finish shopping ----------
-- For every item in the cart: add buy_qty (or 1) to the quantity, then take it
-- off the list. Security rules still apply (security invoker).

create or replace function public.finish_shopping(p_household uuid)
returns setof public.items
language sql security invoker
as $$
  update public.items
     set qty     = qty + coalesce(buy_qty, 1),
         in_cart = false,
         on_list = false,
         buy_qty = null
   where household_id = p_household
     and in_cart
  returning *;
$$;

revoke execute on function public.finish_shopping(uuid) from public, anon;
grant  execute on function public.finish_shopping(uuid) to authenticated;
