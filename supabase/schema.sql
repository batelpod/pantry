-- =====================================================================
-- Home Pantry · database setup · Step 2: users & households
--
-- How to run: Supabase dashboard → SQL Editor → New query →
-- paste this whole file → Run. Safe to run again (it skips what exists).
--
-- What it creates:
--   households         one row per household
--   household_members  who belongs to which household (one household per person)
--   invites            invite codes, valid 7 days, reusable until they expire
--
-- Security: Row Level Security (RLS) is ON for every table, so a logged-in
-- person only ever sees their own household. Creating a household, making
-- an invite and joining go through functions below, which check the rules.
-- =====================================================================


-- ---------- Tables ----------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  created_by  uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)                      -- a person belongs to one household
);

create table if not exists public.invites (
  code          text primary key,
  household_id  uuid not null references public.households(id) on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days'
);


-- ---------- Helper: is the current user a member of this household? ----------
-- "security definer" lets it look at household_members without tripping
-- over that table's own security rules (which would loop forever).

create or replace function public.is_member(hh uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members
    where household_id = hh and user_id = auth.uid()
  );
$$;


-- ---------- Row Level Security ----------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.invites           enable row level security;

-- Logged-out visitors get nothing at all.
revoke all on public.households, public.household_members, public.invites from anon;

-- households: members can see and rename their own household.
drop policy if exists "members read household"   on public.households;
drop policy if exists "members rename household" on public.households;
create policy "members read household"   on public.households
  for select to authenticated using (public.is_member(id));
create policy "members rename household" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
revoke insert, delete on public.households from authenticated;   -- use create_household()
revoke update on public.households from authenticated;
grant  update (name) on public.households to authenticated;

-- household_members: see everyone in your household; change only your own
-- display name; you may leave (delete your own row).
drop policy if exists "members read members"   on public.household_members;
drop policy if exists "edit own member row"    on public.household_members;
drop policy if exists "leave household"        on public.household_members;
create policy "members read members" on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy "edit own member row"  on public.household_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave household"      on public.household_members
  for delete to authenticated using (user_id = auth.uid());
revoke insert on public.household_members from authenticated;    -- use create/join functions
revoke update on public.household_members from authenticated;
grant  update (display_name) on public.household_members to authenticated;

-- invites: members can see and cancel their household's invites.
drop policy if exists "members read invites"   on public.invites;
drop policy if exists "members delete invites" on public.invites;
create policy "members read invites"   on public.invites
  for select to authenticated using (public.is_member(household_id));
create policy "members delete invites" on public.invites
  for delete to authenticated using (public.is_member(household_id));
revoke insert, update on public.invites from authenticated;      -- use create_invite()


-- ---------- Functions the app calls ----------

-- Create a new household and make the caller its owner.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household.';
  end if;

  insert into households (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into new_id;

  insert into household_members (household_id, user_id, display_name, role)
  values (new_id, auth.uid(), trim(p_display_name), 'owner');

  return new_id;
end;
$$;

-- Make an invite code for the caller's household. Valid for 7 days.
create or replace function public.create_invite()
returns text
language plpgsql security definer set search_path = public
as $$
declare hh uuid; new_code text;
begin
  select household_id into hh from household_members where user_id = auth.uid();
  if hh is null then raise exception 'You are not in a household.'; end if;

  -- 10 random letters/digits, e.g. 7F3A9C01BE
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into invites (code, household_id, created_by) values (new_code, hh, auth.uid());

  delete from invites where expires_at < now();   -- tidy up old codes
  return new_code;
end;
$$;

-- Join a household using an invite code. Returns the household's name.
create or replace function public.join_household(p_code text, p_display_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare inv invites%rowtype; hh_name text;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household.';
  end if;

  select * into inv from invites
  where code = upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'This invite code is wrong or has expired.'; end if;

  insert into household_members (household_id, user_id, display_name, role)
  values (inv.household_id, auth.uid(), trim(p_display_name), 'member');

  select name into hh_name from households where id = inv.household_id;
  return hh_name;
end;
$$;

-- Only logged-in users may call these.
revoke execute on function public.is_member(uuid)               from public, anon;
revoke execute on function public.create_household(text, text)  from public, anon;
revoke execute on function public.create_invite()               from public, anon;
revoke execute on function public.join_household(text, text)    from public, anon;
grant  execute on function public.is_member(uuid)               to authenticated;
grant  execute on function public.create_household(text, text)  to authenticated;
grant  execute on function public.create_invite()               to authenticated;
grant  execute on function public.join_household(text, text)    to authenticated;
