create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
  title text not null check (char_length(title) between 2 and 80),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value bigint not null check (
    (discount_type = 'percentage' and discount_value between 1 and 100)
    or (discount_type = 'fixed' and discount_value > 0)
  ),
  minimum_subtotal_paise bigint not null default 0 check (minimum_subtotal_paise >= 0),
  maximum_discount_paise bigint check (maximum_discount_paise is null or maximum_discount_paise > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or expires_at is null or expires_at > starts_at)
);

alter table public.coupons enable row level security;
revoke all on table public.coupons from anon, authenticated;
grant all on table public.coupons to service_role;

create or replace function public.set_coupons_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_coupons_updated_at on public.coupons;
create trigger set_coupons_updated_at
before update on public.coupons
for each row execute function public.set_coupons_updated_at();

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists discount_paise bigint not null default 0
    check (discount_paise >= 0 and discount_paise <= item_subtotal_paise);

alter table public.orders drop constraint if exists orders_total_paise_check;
alter table public.orders drop constraint if exists orders_check;
alter table public.orders add constraint orders_total_paise_check
  check (total_paise = item_subtotal_paise - discount_paise + shipping_paise);

create index if not exists orders_coupon_id_idx on public.orders (coupon_id) where coupon_id is not null;

create or replace function public.coupon_quote(p_code text, p_item_subtotal_paise bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_coupon public.coupons%rowtype;
  applied_count bigint;
  discount bigint;
begin
  if p_item_subtotal_paise is null or p_item_subtotal_paise < 0
    or p_code is null or p_code !~ '^[A-Za-z0-9_-]{3,32}$' then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'Enter a valid coupon code.');
  end if;

  select * into selected_coupon
  from public.coupons
  where code = pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;

  if not found or not selected_coupon.active then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'This coupon is not available.');
  end if;
  if selected_coupon.starts_at is not null and selected_coupon.starts_at > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'This coupon is not active yet.');
  end if;
  if selected_coupon.expires_at is not null and selected_coupon.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'This coupon has expired.');
  end if;
  if p_item_subtotal_paise < selected_coupon.minimum_subtotal_paise then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'Your items do not meet this coupon’s minimum order.');
  end if;

  select pg_catalog.count(*) into applied_count
  from public.orders
  where coupon_id = selected_coupon.id
    and order_status not in ('cancelled', 'payment_initialization_failed')
    and payment_status <> 'failed';
  if selected_coupon.usage_limit is not null and applied_count >= selected_coupon.usage_limit then
    return pg_catalog.jsonb_build_object('valid', false, 'message', 'This coupon has reached its usage limit.');
  end if;

  if selected_coupon.discount_type = 'percentage' then
    discount := pg_catalog.floor(p_item_subtotal_paise::numeric * selected_coupon.discount_value / 100)::bigint;
  else
    discount := least(p_item_subtotal_paise, selected_coupon.discount_value);
  end if;
  if selected_coupon.maximum_discount_paise is not null then
    discount := least(discount, selected_coupon.maximum_discount_paise);
  end if;

  return pg_catalog.jsonb_build_object(
    'valid', true,
    'couponId', selected_coupon.id,
    'code', selected_coupon.code,
    'title', selected_coupon.title,
    'discountPaise', discount
  );
end;
$$;

create or replace function public.create_order_with_coupon(p_order jsonb, p_coupon_code text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  coupon jsonb;
  saved_order public.orders%rowtype;
  item_subtotal bigint;
begin
  item_subtotal := (p_order ->> 'item_subtotal_paise')::bigint;
  coupon := public.coupon_quote(p_coupon_code, item_subtotal);
  if coupon ->> 'valid' <> 'true' then
    raise exception using errcode = 'P0001', message = coupon ->> 'message';
  end if;

  insert into public.orders (
    id, user_id, order_number, customer, items, item_subtotal_paise, shipping_paise,
    total_paise, discount_paise, coupon_id, coupon_code, currency, payment_method,
    payment_status, order_status, owner_notification_status
  ) values (
    (p_order ->> 'id')::uuid,
    nullif(p_order ->> 'user_id', '')::uuid,
    p_order ->> 'order_number', p_order -> 'customer', p_order -> 'items', item_subtotal,
    (p_order ->> 'shipping_paise')::bigint,
    item_subtotal - (coupon ->> 'discountPaise')::bigint + (p_order ->> 'shipping_paise')::bigint,
    (coupon ->> 'discountPaise')::bigint, (coupon ->> 'couponId')::uuid, coupon ->> 'code',
    p_order ->> 'currency', p_order ->> 'payment_method', p_order ->> 'payment_status',
    p_order ->> 'order_status', p_order ->> 'owner_notification_status'
  ) returning * into saved_order;

  return saved_order;
end;
$$;

revoke all on function public.coupon_quote(text, bigint) from public, anon, authenticated;
revoke all on function public.create_order_with_coupon(jsonb, text) from public, anon, authenticated;
grant execute on function public.coupon_quote(text, bigint) to service_role;
grant execute on function public.create_order_with_coupon(jsonb, text) to service_role;

create or replace view public.coupon_stats as
select
  c.id as coupon_id,
  pg_catalog.count(o.id) filter (
    where o.order_status not in ('cancelled', 'payment_initialization_failed')
      and o.payment_status <> 'failed'
  )::integer as usage_count,
  pg_catalog.count(o.id) filter (where o.payment_status = 'paid')::integer as paid_order_count,
  coalesce(pg_catalog.sum(o.discount_paise) filter (where o.payment_status = 'paid'), 0)::bigint as discount_total_paise,
  coalesce(pg_catalog.sum(o.total_paise) filter (where o.payment_status = 'paid'), 0)::bigint as paid_revenue_paise
from public.coupons c
left join public.orders o on o.coupon_id = c.id
group by c.id;

revoke all on public.coupon_stats from public, anon, authenticated;
grant select on public.coupon_stats to service_role;
