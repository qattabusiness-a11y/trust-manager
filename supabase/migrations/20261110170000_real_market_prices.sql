-- =====================================================================
-- Trust Manager — real market prices
-- Run this once in the Supabase SQL Editor (after the first migration).
-- Safe to run more than once.
--
--  * Households can record the real prices they see or pay, and add their
--    own products. Those rows are private to the household (RLS).
--  * Removes the simulated demo price index: a live deployment shows only
--    real, recorded prices.
-- =====================================================================

-- Products: shared catalogue (household_id null) + household-added products
alter table public.market_products
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists deleted_at timestamptz;
alter table public.market_products drop constraint if exists market_products_slug_key;
create unique index if not exists market_products_shared_slug on public.market_products (slug) where household_id is null;
create index if not exists market_products_household on public.market_products (household_id) where household_id is not null;

-- Prices: who recorded them, for which household
alter table public.market_price_history
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;
create index if not exists market_price_history_household on public.market_price_history (household_id, product_id, recorded_at desc) where household_id is not null;

-- The shared "latest price" table tracks only shared (non-household) prices.
create or replace function public.refresh_market_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.household_id is not null then return new; end if;
  insert into market_prices (product_id, market_name, location, current_price, previous_price, currency, recorded_at, source)
  values (new.product_id, new.market_name, new.location, new.price, new.price, new.currency, new.recorded_at, new.source)
  on conflict (product_id, market_name) do update set
    previous_price = case when excluded.recorded_at >= market_prices.recorded_at then market_prices.current_price else market_prices.previous_price end,
    current_price = case when excluded.recorded_at >= market_prices.recorded_at then excluded.current_price else market_prices.current_price end,
    recorded_at = greatest(excluded.recorded_at, market_prices.recorded_at),
    source = excluded.source, updated_at = now();
  return new;
end $$;

-- Row Level Security: everyone signed in reads the shared catalogue; a
-- household reads and manages only its own rows.
drop policy if exists market_products_read on public.market_products;
drop policy if exists market_products_insert on public.market_products;
drop policy if exists market_products_update on public.market_products;
drop policy if exists market_products_delete on public.market_products;
create policy market_products_read on public.market_products for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy market_products_insert on public.market_products for insert to authenticated
  with check (household_id is not null and public.has_perm(household_id, 'edit_shopping'));
create policy market_products_update on public.market_products for update to authenticated
  using (household_id is not null and public.has_perm(household_id, 'edit_shopping'))
  with check (household_id is not null and public.has_perm(household_id, 'edit_shopping'));
create policy market_products_delete on public.market_products for delete to authenticated
  using (household_id is not null and public.has_perm(household_id, 'edit_shopping'));

drop policy if exists market_history_read on public.market_price_history;
drop policy if exists market_history_insert on public.market_price_history;
drop policy if exists market_history_update on public.market_price_history;
drop policy if exists market_history_delete on public.market_price_history;
create policy market_history_read on public.market_price_history for select to authenticated
  using (household_id is null or public.is_member(household_id));
create policy market_history_insert on public.market_price_history for insert to authenticated
  with check (
    household_id is not null
    and recorded_by = auth.uid()
    and public.has_perm(household_id, 'edit_shopping')
    and exists (select 1 from public.market_products p where p.id = product_id and (p.household_id is null or p.household_id = market_price_history.household_id))
  );
create policy market_history_update on public.market_price_history for update to authenticated
  using (household_id is not null and public.has_perm(household_id, 'edit_shopping'))
  with check (household_id is not null and public.has_perm(household_id, 'edit_shopping'));
create policy market_history_delete on public.market_price_history for delete to authenticated
  using (household_id is not null and public.has_perm(household_id, 'edit_shopping'));

drop trigger if exists set_updated_at on public.market_price_history;
create trigger set_updated_at before update on public.market_price_history
  for each row execute function public.set_updated_at();

-- Remove the simulated demo index (it was only ever sample data).
delete from public.market_price_history where source = 'Trust Manager demo index (simulated)';
delete from public.market_prices where source = 'Trust Manager demo index (simulated)';

-- Tracking starts at the beginning of the household's first day, so every
-- transaction recorded on that day changes the balance.
create or replace function public.create_household(p_name text, p_currency text, p_country text, p_timezone text, p_opening_balance bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid; uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into p from profiles where id = uid;
  insert into households (name, owner_id, currency, country, timezone) values (p_name, uid, p_currency, p_country, p_timezone) returning id into hid;
  insert into household_balances (household_id, opening_balance, opening_balance_date)
    values (hid, greatest(p_opening_balance, 0), date_trunc('day', now() at time zone p_timezone) at time zone p_timezone);
  insert into household_members (household_id, user_id, display_name, email, role) values (hid, uid, p.full_name, p.email, 'owner');
  update profiles set default_household_id = hid where id = uid;
  return hid;
end $$;

update public.household_balances b
   set opening_balance_date = date_trunc('day', b.opening_balance_date at time zone h.timezone) at time zone h.timezone
  from public.households h
 where h.id = b.household_id;

-- ---------------------------------------------------------------------
-- Faster loading: return several tables in ONE request.
-- SECURITY INVOKER (the default): it runs as the signed-in user, so Row
-- Level Security filters every row exactly as a normal query would.
-- Only whitelisted tables and filter columns are accepted.
-- ---------------------------------------------------------------------
create or replace function public.batch_select(p_requests jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  r jsonb;
  t text;
  c text;
  rows jsonb;
  out jsonb := '[]'::jsonb;
  allowed text[] := array[
    'households','household_members','household_invitations','user_personas','income_sources','budgets',
    'budget_allocations','transactions','transaction_categories','savings_accounts','savings_goals',
    'savings_contributions','shopping_lists','shopping_items','market_products','market_price_history',
    'recurring_payments','subscription_usage','notifications','vision_ledger_entries',
    'financial_advisory_reports','user_preferences','audit_logs'];
begin
  if jsonb_typeof(p_requests) <> 'array' or jsonb_array_length(p_requests) > 40 then
    raise exception 'batch_select expects an array of at most 40 requests';
  end if;
  for r in select * from jsonb_array_elements(p_requests) loop
    t := r->>'table';
    c := r->>'column';
    if t is null or not (t = any(allowed)) then raise exception 'table % is not allowed', t; end if;
    if c is null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
    elsif c in ('household_id', 'user_id') then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.%I = ($1)::uuid', t, c)
        into rows using r->>'value';
    else
      raise exception 'column % is not allowed', c;
    end if;
    out := out || jsonb_build_array(rows);
  end loop;
  return out;
end $$;
revoke all on function public.batch_select(jsonb) from public;
grant execute on function public.batch_select(jsonb) to authenticated;
