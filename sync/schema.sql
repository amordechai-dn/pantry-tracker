-- ============================================================================
-- HomeStock — Supabase schema, indexes, Row-Level Security (RLS) and the
-- device-linking RPCs. Paste this whole file into the Supabase SQL Editor and
-- run it once. See sync/SYNC_SETUP.md for the click-by-click walkthrough.
--
-- SECURITY MODEL (no passwords)
--   * Every device signs in with Supabase ANONYMOUS auth, so each device has its
--     own auth.uid() (a real JWT subject) — not a guessable column.
--   * A "household" is the shared cloud identity. Its id is the user_id stored
--     on every data row (this is the "backend user UUID" a local profile links
--     to). Multiple devices (auth.uid()s) belong to one household.
--   * household_members maps auth.uid() -> household_id. RLS checks membership,
--     so a device can only read/write rows whose user_id is a household it
--     belongs to. Nothing keys off a raw, guessable column.
--   * Devices join a household by redeeming a crypto-random link token. Tokens
--     are stored ONLY as a SHA-256 digest (pgcrypto) and never returned/logged.
--   * The frontend uses ONLY the anon key. There is NO service_role key in the
--     client — RLS + anon auth are the enforcement boundary.
-- ============================================================================

-- pgcrypto provides digest()/gen_random_uuid(). On Supabase it lives in the
-- `extensions` schema, so every SECURITY DEFINER function below sets
-- search_path = public, extensions (otherwise digest() is "not found").
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------- identity --
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  member_uid   uuid not null,                    -- auth.uid() of a device
  created_at   timestamptz not null default now(),
  primary key (household_id, member_uid)
);
create index if not exists idx_hm_member on household_members(member_uid);

-- Crypto-random link tokens (digest only). Short-lived, single household.
create table if not exists device_links (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  token_hash   bytea not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists idx_dl_household on device_links(household_id);

-- Convenience: households the current caller belongs to.
create or replace function my_households()
returns setof uuid language sql stable security definer set search_path = public, extensions as $$
  select household_id from household_members where member_uid = auth.uid();
$$;

-- --------------------------------------------------------------- data model --
-- Every user-owned table carries: id (stable uuid), user_id (= household id),
-- created_at, updated_at. `updated_at` drives last-write-wins on the client.

-- Data-row ids are TEXT: they are the client's own stable record ids (the app
-- generates string ids offline). user_id is always the household UUID.
create table if not exists users (
  id          uuid primary key,               -- = household id (the identity)
  user_id     uuid not null,                  -- self (kept for uniform RLS)
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists products (
  id          text primary key,
  user_id     uuid not null,
  barcode     text,
  name        text,
  name_en     text,
  name_he     text,
  image_hash  text,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_products_user    on products(user_id);
create index if not exists idx_products_barcode  on products(user_id, barcode);

create table if not exists inventory_items (
  id          text primary key,
  user_id     uuid not null,
  product_id  uuid,
  barcode     text,
  name        text,
  name_en     text,
  name_he     text,
  quantity    numeric,
  image_hash  text,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_inv_user     on inventory_items(user_id);
create index if not exists idx_inv_product  on inventory_items(user_id, product_id);
create index if not exists idx_inv_barcode  on inventory_items(user_id, barcode);

create table if not exists shopping_lists (
  id          text primary key,
  user_id     uuid not null,
  name        text,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_sl_user on shopping_lists(user_id);

create table if not exists shopping_list_items (
  id          text primary key,
  user_id     uuid not null,
  list_id     uuid,
  product_id  uuid,
  name        text,
  quantity    numeric,
  checked     boolean default false,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_sli_user on shopping_list_items(user_id);
create index if not exists idx_sli_list on shopping_list_items(user_id, list_id);

create table if not exists monthly_plans (
  id          text primary key,
  user_id     uuid not null,
  period      text,                            -- e.g. "2026-08"
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_mp_user on monthly_plans(user_id);

create table if not exists barcode_mappings (
  id          text primary key,               -- client uses "<barcode>"
  user_id     uuid not null,
  barcode     text not null,
  product_id  uuid,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, barcode)
);
create index if not exists idx_bcm_user    on barcode_mappings(user_id);
create index if not exists idx_bcm_barcode on barcode_mappings(user_id, barcode);

create table if not exists user_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)
);
create index if not exists idx_us_user on user_settings(user_id);

create table if not exists sync_metadata (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  device_id   text,
  last_sync_at timestamptz,
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, device_id)
);
create index if not exists idx_sm_user on sync_metadata(user_id);

-- ----------------------------------------------------- RLS: deny by default --
alter table households          enable row level security;
alter table household_members   enable row level security;
alter table device_links        enable row level security;
alter table users               enable row level security;
alter table products            enable row level security;
alter table inventory_items     enable row level security;
alter table shopping_lists      enable row level security;
alter table shopping_list_items enable row level security;
alter table monthly_plans       enable row level security;
alter table barcode_mappings    enable row level security;
alter table user_settings       enable row level security;
alter table sync_metadata       enable row level security;

-- A caller may only touch rows whose user_id is a household they belong to.
-- (Applied uniformly to every data table.)
do $$
declare t text;
begin
  foreach t in array array[
    'users','products','inventory_items','shopping_lists','shopping_list_items',
    'monthly_plans','barcode_mappings','user_settings','sync_metadata'
  ] loop
    execute format('drop policy if exists %I on %I;', t||'_rls', t);
    execute format($f$
      create policy %I on %I
        using      (user_id in (select my_households()))
        with check (user_id in (select my_households()));
    $f$, t||'_rls', t);
  end loop;
end $$;

-- household_members: a caller can see rows for households they are in, and can
-- insert ONLY their own membership (used by redeem_link_token, below).
drop policy if exists hm_select on household_members;
create policy hm_select on household_members
  for select using (household_id in (select my_households()));

drop policy if exists hm_insert_self on household_members;
create policy hm_insert_self on household_members
  for insert with check (member_uid = auth.uid());

-- device_links: only members of the household may see/manage its tokens.
drop policy if exists dl_all on device_links;
create policy dl_all on device_links
  using      (household_id in (select my_households()))
  with check (household_id in (select my_households()));

-- households: members may read their own household row.
drop policy if exists hh_select on households;
create policy hh_select on households
  for select using (id in (select my_households()));

-- --------------------------------------------------------------- link RPCs --
-- First device: create a household and enroll the caller as the first member.
create or replace function create_household()
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into households default values returning id into hid;
  insert into household_members(household_id, member_uid) values (hid, auth.uid());
  return hid;
end $$;

-- Existing member: mint a link token (stored only as a digest). Raw token is
-- provided by the caller (crypto-random on the client) and never persisted.
create or replace function create_link_token(p_token text, p_expires_minutes int default 60)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare hid uuid; lid uuid;
begin
  select household_id into hid from household_members where member_uid = auth.uid() limit 1;
  if hid is null then raise exception 'no household for caller'; end if;
  insert into device_links(household_id, token_hash, expires_at)
    values (hid, digest(p_token, 'sha256'), now() + make_interval(mins => p_expires_minutes))
    returning id into lid;
  return lid;
end $$;

-- New device: redeem a token to join the household. SECURITY DEFINER so a
-- not-yet-member caller can enroll themselves iff they present a valid token.
create or replace function redeem_link_token(p_token text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select household_id into hid from device_links
    where token_hash = digest(p_token, 'sha256') and expires_at > now()
    limit 1;
  if hid is null then raise exception 'invalid or expired token'; end if;
  insert into household_members(household_id, member_uid)
    values (hid, auth.uid())
    on conflict do nothing;
  return hid;
end $$;

-- Regenerate: revoke every outstanding token for the caller's household.
create or replace function revoke_link_tokens()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare hid uuid; n int;
begin
  select household_id into hid from household_members where member_uid = auth.uid() limit 1;
  if hid is null then raise exception 'no household for caller'; end if;
  delete from device_links where household_id = hid;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function create_household()            to anon, authenticated;
grant execute on function create_link_token(text, int)  to anon, authenticated;
grant execute on function redeem_link_token(text)       to anon, authenticated;
grant execute on function revoke_link_tokens()          to anon, authenticated;
grant execute on function my_households()               to anon, authenticated;
