create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer jsonb not null,
  items jsonb not null,
  item_subtotal_paise bigint not null check (item_subtotal_paise >= 0),
  shipping_paise bigint not null check (shipping_paise >= 0),
  total_paise bigint not null check (total_paise = item_subtotal_paise + shipping_paise),
  currency text not null default 'INR' check (currency = 'INR'),
  payment_method text not null check (payment_method in ('offline', 'razorpay')),
  payment_status text not null check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  order_status text not null check (
    order_status in (
      'request_received',
      'pending_payment',
      'confirmed',
      'payment_initialization_failed',
      'processing',
      'shipped',
      'delivered',
      'cancelled'
    )
  ),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  paid_at timestamptz,
  owner_notification_status text not null default 'pending'
    check (owner_notification_status in ('pending', 'sent', 'failed')),
  owner_notification_error text,
  owner_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_created_at_idx on public.orders (order_status, created_at desc);

alter table public.orders enable row level security;

revoke all on table public.orders from anon, authenticated;
grant all on table public.orders to service_role;

comment on table public.orders is
  'Order writes and payment processing use trusted server-side functions; authenticated customers receive RLS-scoped reads of their own order history after the customer-account migration.';

create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_orders_updated_at();

create table if not exists public.order_rate_limit_windows (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (ip_hash, window_start)
);

alter table public.order_rate_limit_windows enable row level security;
revoke all on table public.order_rate_limit_windows from anon, authenticated;
grant all on table public.order_rate_limit_windows to service_role;

create or replace function public.consume_order_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_count integer;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit token';
  end if;

  current_window := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / 600) * 600
  );

  insert into public.order_rate_limit_windows as rate_limit (ip_hash, window_start, request_count)
  values (p_ip_hash, current_window, 1)
  on conflict (ip_hash, window_start)
  do update set request_count = rate_limit.request_count + 1
  returning request_count into current_count;

  delete from public.order_rate_limit_windows
  where window_start < pg_catalog.now() - interval '1 day';

  return current_count <= 10;
end;
$$;

revoke all on function public.consume_order_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_order_rate_limit(text) to service_role;
