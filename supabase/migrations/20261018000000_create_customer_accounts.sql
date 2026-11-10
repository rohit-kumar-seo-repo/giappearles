create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  phone text not null default '' check (char_length(phone) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home' check (char_length(label) between 1 and 40),
  recipient_name text not null check (char_length(recipient_name) between 2 and 100),
  phone text not null check (char_length(phone) between 10 and 20),
  address_line1 text not null check (char_length(address_line1) between 5 and 160),
  address_line2 text not null default '' check (char_length(address_line2) <= 160),
  city text not null check (char_length(city) between 1 and 80),
  state text not null check (char_length(state) between 1 and 80),
  postal_code text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_id_idx
  on public.customer_addresses (user_id, created_at);
create unique index if not exists customer_addresses_one_default_per_user_idx
  on public.customer_addresses (user_id) where is_default;

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);

alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;

revoke all on public.customer_profiles, public.customer_addresses from public, anon, authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

drop policy if exists customer_profiles_read_own on public.customer_profiles;
create policy customer_profiles_read_own
  on public.customer_profiles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists customer_profiles_insert_own on public.customer_profiles;
create policy customer_profiles_insert_own
  on public.customer_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists customer_profiles_update_own on public.customer_profiles;
create policy customer_profiles_update_own
  on public.customer_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists customer_addresses_manage_own on public.customer_addresses;
create policy customer_addresses_manage_own
  on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.orders from public, anon, authenticated;
grant select on public.orders to authenticated;
drop policy if exists orders_read_own on public.orders;
create policy orders_read_own
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()));
comment on table public.orders is
  'Order writes and payment processing use trusted server-side functions; authenticated customers may read only their own order history.';

create or replace function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (user_id, full_name)
  values (
    new.id,
    pg_catalog.left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_customer_profile() from public, anon, authenticated;
drop trigger if exists create_customer_profile_after_signup on auth.users;
create trigger create_customer_profile_after_signup
after insert on auth.users
for each row execute function public.create_customer_profile();

insert into public.customer_profiles (user_id, full_name)
select
  users.id,
  pg_catalog.left(coalesce(users.raw_user_meta_data ->> 'full_name', ''), 100)
from auth.users as users
on conflict (user_id) do nothing;

create or replace function public.set_customer_account_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_customer_profiles_updated_at on public.customer_profiles;
create trigger set_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_customer_account_updated_at();
drop trigger if exists set_customer_addresses_updated_at on public.customer_addresses;
create trigger set_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_customer_account_updated_at();

revoke all on function public.set_customer_account_updated_at() from public, anon, authenticated;

notify pgrst, 'reload schema';
