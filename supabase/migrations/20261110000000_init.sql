-- =====================================================================
-- Trust Manager — initial schema
-- PostgreSQL / Supabase. Money is BIGINT in the currency's minor unit
-- (RWF has none: 1 = RWF 1). Timestamps are TIMESTAMPTZ (stored in UTC).
-- Every household-owned table is protected by Row Level Security.
-- There is deliberately NO table for receipt images.
-- =====================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ------------------------------------------------------------ 1. profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  onboarding_completed boolean not null default false,
  default_household_id uuid,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Create a profile row whenever someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ 2. households
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  owner_id uuid not null references public.profiles(id),
  currency char(3) not null default 'RWF',
  country text not null default 'Rwanda',
  timezone text not null default 'Africa/Kigali',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.profiles add constraint profiles_default_household_fk
  foreign key (default_household_id) references public.households(id) on delete set null;

-- Sensitive opening balance kept apart so RLS can restrict it to view_balances.
create table public.household_balances (
  household_id uuid primary key references public.households(id) on delete cascade,
  opening_balance bigint not null default 0,
  opening_balance_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ 3. household_members
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  email text not null,
  role text not null check (role in ('owner','admin','contributor','viewer')),
  permission_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);
create index on public.household_members (user_id) where status = 'active';

-- ------------------------------------------------------------ permission engine
-- Mirrors src/constants ROLE_PERMISSIONS + src/lib/permissions.
create or replace function public.role_has(p_role text, p_perm text) returns boolean
language sql immutable as $$
  select case p_role
    when 'owner' then true
    when 'admin' then p_perm = any (array['view_shopping','edit_shopping','mark_purchased','view_budget','view_transactions','add_transactions','edit_transactions','manage_recurring','manage_settings','view_advisor'])
    when 'contributor' then p_perm = any (array['view_shopping','edit_shopping','mark_purchased','view_transactions','add_transactions'])
    when 'viewer' then p_perm = any (array['view_shopping','view_budget'])
    else false end
$$;

create or replace function public.is_write_perm(p_perm text) returns boolean
language sql immutable as $$
  select p_perm = any (array['edit_shopping','mark_purchased','manage_budget','add_transactions','edit_transactions','manage_income','manage_recurring','manage_savings','manage_members','manage_settings'])
$$;

create or replace function public.is_member(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members m
    where m.household_id = p_household and m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null)
$$;

create or replace function public.has_perm(p_household uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when p_perm = 'manage_members' then false
      when m.permission_overrides ? p_perm then
        (m.permission_overrides->>p_perm)::boolean and not (m.role = 'viewer' and public.is_write_perm(p_perm))
      else public.role_has(m.role, p_perm)
    end
    from household_members m
    where m.household_id = p_household and m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
    limit 1), false)
$$;

-- ------------------------------------------------------------ 4. household_invitations
create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','contributor','viewer')),
  token_hash text not null unique,          -- sha256 of the token; raw token never stored
  expires_at timestamptz not null,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ------------------------------------------------------------ 5. user_personas
create table public.user_personas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  age int not null check (age between 13 and 110),
  country text not null, city text not null, language text not null,
  currency char(3) not null,
  occupation text not null,
  employment_status text not null check (employment_status in ('student','employed','self-employed','unemployed')),
  household_size int not null check (household_size >= 1),
  dependents int not null default 0, financial_dependents int not null default 0,
  household_status text not null default '', manages_finances text not null default 'alone',
  monthly_income bigint not null default 0, income_frequency text not null default 'monthly',
  additional_income bigint not null default 0, existing_savings bigint not null default 0,
  monthly_rent bigint not null default 0, debt_obligations bigint not null default 0,
  other_recurring_expenses bigint not null default 0, monthly_savings bigint not null default 0,
  financial_goals text[] not null default '{}',
  risk_tolerance text not null default 'low' check (risk_tolerance in ('low','medium','high')),
  planning_approach text not null default '50-30-20',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (household_id, user_id)
);

-- ------------------------------------------------------------ 6. income_sources
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id),
  name text not null,
  amount bigint not null check (amount > 0),
  category text not null,
  frequency text not null,
  expected_date date not null,
  recurring boolean not null default true,
  savings_allocation bigint not null default 0 check (savings_allocation >= 0),
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (savings_allocation <= amount)
);
create index on public.income_sources (household_id);

-- ------------------------------------------------------------ 7. budgets
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month char(7) not null,                     -- yyyy-MM
  monthly_budget bigint not null check (monthly_budget > 0),
  savings_target bigint not null default 0,
  essential_allocation bigint not null default 0,
  flexible_allocation bigint not null default 0,
  custom_daily_limit bigint, custom_weekly_limit bigint,
  thresholds jsonb not null default '{"caution":70,"warning":85,"critical":100}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (household_id, month),
  check (essential_allocation + flexible_allocation <= monthly_budget)
);

-- ------------------------------------------------------------ 10. transaction_categories
create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,  -- null = system category
  name text not null,
  kind text not null check (kind in ('expense','income')),
  essential boolean not null default false,
  icon text not null default 'Circle',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ 8. budget_allocations
create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.transaction_categories(id),
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (budget_id, category_id)
);

-- ------------------------------------------------------------ 11–13. savings
create table public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('emergency','goal','general','micro')),
  opening_balance bigint not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.vision_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null, description text not null default '',
  category text not null, target_amount bigint not null default 0,
  target_date date, priority text not null default 'medium',
  progress int not null default 0 check (progress between 0 and 100),
  status text not null default 'idea',
  goal_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  target_amount bigint not null check (target_amount > 0),
  target_date date,
  account_id uuid not null references public.savings_accounts(id),
  priority text not null default 'medium',
  status text not null default 'active' check (status in ('active','achieved','paused')),
  vision_entry_id uuid references public.vision_ledger_entries(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.vision_ledger_entries add constraint vision_goal_fk foreign key (goal_id) references public.savings_goals(id) on delete set null;

-- ------------------------------------------------------------ 9. transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('expense','income','savings_transfer','savings_withdrawal')),
  title text not null check (char_length(title) between 2 and 80),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  currency char(3) not null,
  occurred_at timestamptz not null,
  category_id uuid not null references public.transaction_categories(id),
  merchant text not null default '',
  payment_method text not null check (payment_method in ('momo','bank','cash','card','other')),
  essential boolean not null,
  planned boolean not null,
  notes text,
  source text not null default 'manual' check (source in ('manual','receipt_ocr','shopping_list','recurring','micro_savings')),
  reference text,
  recorded_balance bigint,
  shopping_item_id uuid,
  savings_goal_id uuid references public.savings_goals(id) on delete set null,
  behavior_override text check (behavior_override in ('green','yellow','red')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (occurred_at <= now() + interval '2 days')
);
create index on public.transactions (household_id, occurred_at desc) where deleted_at is null;
create index on public.transactions (household_id, merchant);

create table public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  goal_id uuid references public.savings_goals(id) on delete set null,
  account_id uuid not null references public.savings_accounts(id),
  amount bigint not null check (amount <> 0),
  source text not null check (source in ('manual','micro_sweep','income_allocation')),
  simulated boolean not null default true,   -- true = recorded in-app only, no real money moved
  transaction_id uuid references public.transactions(id) on delete set null,
  note text,
  contributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.savings_contributions (household_id, contributed_at);

-- ------------------------------------------------------------ 14–15. shopping
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ------------------------------------------------------------ 16–18. market
create table public.market_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null, category text not null, unit text not null,
  perishable boolean not null default false,
  shelf_life_days int not null default 30,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.market_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.market_products(id) on delete cascade,
  market_name text not null, location text not null,
  price bigint not null check (price > 0),
  currency char(3) not null default 'RWF',
  recorded_at timestamptz not null,
  source text not null,                       -- always required: where the price came from
  created_at timestamptz not null default now()
);
create index on public.market_price_history (product_id, recorded_at desc);
-- Latest price per (product, market), maintained by trigger.
create table public.market_prices (
  product_id uuid not null references public.market_products(id) on delete cascade,
  market_name text not null, location text not null,
  current_price bigint not null, previous_price bigint not null,
  currency char(3) not null, recorded_at timestamptz not null, source text not null,
  updated_at timestamptz not null default now(),
  primary key (product_id, market_name)
);
create or replace function public.refresh_market_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into market_prices (product_id, market_name, location, current_price, previous_price, currency, recorded_at, source)
  values (new.product_id, new.market_name, new.location, new.price, new.price, new.currency, new.recorded_at, new.source)
  on conflict (product_id, market_name) do update set
    previous_price = case when excluded.recorded_at >= market_prices.recorded_at then market_prices.current_price else market_prices.previous_price end,
    current_price = case when excluded.recorded_at >= market_prices.recorded_at then excluded.current_price else market_prices.current_price end,
    recorded_at = greatest(excluded.recorded_at, market_prices.recorded_at),
    source = excluded.source, updated_at = now();
  return new;
end $$;
create trigger market_history_refresh after insert on public.market_price_history
  for each row execute function public.refresh_market_price();

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_name text not null,
  market_product_id uuid references public.market_products(id),
  category text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null,
  estimated_unit_price bigint not null check (estimated_unit_price > 0),
  priority text not null default 'medium',
  expected_date date,
  notes text,
  status text not null default 'needed' check (status in ('needed','bought')),
  actual_cost bigint, purchased_at timestamptz, merchant text,
  transaction_id uuid references public.transactions(id) on delete set null,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.transactions add constraint transactions_shopping_item_fk foreign key (shopping_item_id) references public.shopping_items(id) on delete set null;

-- Members with only "mark_purchased" may change purchase fields and nothing else.
create or replace function public.guard_shopping_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.has_perm(new.household_id, 'edit_shopping') then return new; end if;
  if (new.product_name, new.category, new.quantity, new.unit, new.estimated_unit_price, new.priority, new.expected_date, new.list_id, new.deleted_at)
     is distinct from (old.product_name, old.category, old.quantity, old.unit, old.estimated_unit_price, old.priority, old.expected_date, old.list_id, old.deleted_at) then
    raise exception 'You can only mark items as purchased.';
  end if;
  return new;
end $$;
create trigger shopping_items_guard before update on public.shopping_items
  for each row execute function public.guard_shopping_update();

-- ------------------------------------------------------------ 19–20. bills & subscriptions
create table public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null, amount bigint not null check (amount > 0),
  category text not null,
  kind text not null check (kind in ('bill','subscription','loan')),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  next_due_date date not null, renewal_date date, end_date date,
  reminder_days int[] not null default '{7,3,1}',
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  essential boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.recurring_payments (household_id, next_due_date) where status = 'active';
create table public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recurring_payment_id uuid not null references public.recurring_payments(id) on delete cascade,
  used_on date not null, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- ------------------------------------------------------------ 21. notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,   -- null = whole household
  title text not null, body text not null,
  severity text not null check (severity in ('info','success','caution','warning','critical')),
  channel text not null check (channel in ('in_app','email','push')),
  delivery_status text not null check (delivery_status in ('delivered','simulated','failed')),
  action_href text, dedupe_key text, read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index on public.notifications (household_id, dedupe_key, channel) where dedupe_key is not null;

-- ------------------------------------------------------------ 23–25.
create table public.financial_advisory_reports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('weekly','monthly')),
  period_label text not null, generated_by text not null,
  content jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  rounding_increment bigint not null default 500 check (rounding_increment > 0),
  auto_sweep boolean not null default false, auto_sweep_since timestamptz,
  email_notifications boolean not null default true,
  push_notifications boolean not null default false,
  default_reminder_days int[] not null default '{7,3,1}',
  hide_balances boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, entity text not null, entity_id uuid,
  changes jsonb, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.audit_logs (household_id, created_at desc);

-- ------------------------------------------------------------ updated_at triggers
do $$ declare t text; begin
  foreach t in array array['profiles','households','household_balances','household_members','household_invitations','user_personas','income_sources','budgets','budget_allocations','transactions','transaction_categories','savings_accounts','savings_goals','savings_contributions','shopping_lists','shopping_items','market_products','recurring_payments','subscription_usage','notifications','vision_ledger_entries','financial_advisory_reports','user_preferences']
  loop execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t); end loop;
end $$;

-- Server-side audit trail for financial records (cannot be skipped by a client).
create or replace function public.audit_financial_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare diff jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k <> 'updated_at' and (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old)->k, 'to', to_jsonb(new)->k));
      end if;
    end loop;
  end if;
  insert into audit_logs (household_id, actor_id, action, entity, entity_id, changes, note)
  values (coalesce(new.household_id, old.household_id), auth.uid(), lower(tg_op), tg_table_name, coalesce(new.id, old.id), nullif(diff, '{}'::jsonb), 'database trigger');
  return coalesce(new, old);
end $$;
create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function public.audit_financial_change();
create trigger audit_income after insert or update or delete on public.income_sources for each row execute function public.audit_financial_change();
create trigger audit_budgets after insert or update or delete on public.budgets for each row execute function public.audit_financial_change();
create trigger audit_contributions after insert or update or delete on public.savings_contributions for each row execute function public.audit_financial_change();
create trigger audit_members after insert or update or delete on public.household_members for each row execute function public.audit_financial_change();

-- =====================================================================
-- Row Level Security
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['profiles','households','household_balances','household_members','household_invitations','user_personas','income_sources','budgets','budget_allocations','transactions','transaction_categories','savings_accounts','savings_goals','savings_contributions','shopping_lists','shopping_items','market_products','market_prices','market_price_history','recurring_payments','subscription_usage','notifications','vision_ledger_entries','financial_advisory_reports','user_preferences','audit_logs']
  loop execute format('alter table public.%I enable row level security', t); execute format('alter table public.%I force row level security', t); end loop;
end $$;

-- Standard policy set for a household table: (table, read, create, update, delete).
-- NULL read permission = any active member. NULL delete permission = no hard deletes.
create or replace function pg_temp.household_policies(t text, p_read text, p_create text, p_update text, p_delete text) returns void
language plpgsql as $$ begin
  execute format('create policy %I on public.%I for select using (%s)', t || '_select', t,
    case when p_read is null then 'public.is_member(household_id)' else format('public.has_perm(household_id, %L)', p_read) end);
  execute format('create policy %I on public.%I for insert with check (public.has_perm(household_id, %L))', t || '_insert', t, p_create);
  execute format('create policy %I on public.%I for update using (public.has_perm(household_id, %L)) with check (public.has_perm(household_id, %L))', t || '_update', t, p_update, p_update);
  if p_delete is not null then
    execute format('create policy %I on public.%I for delete using (public.has_perm(household_id, %L))', t || '_delete', t, p_delete);
  end if;
end $$;

select pg_temp.household_policies('income_sources', 'view_income', 'manage_income', 'manage_income', null);
select pg_temp.household_policies('budgets', 'view_budget', 'manage_budget', 'manage_budget', 'manage_budget');
select pg_temp.household_policies('budget_allocations', 'view_budget', 'manage_budget', 'manage_budget', 'manage_budget');
-- Transactions: soft delete only (no DELETE policy) so history is preserved.
select pg_temp.household_policies('transactions', 'view_transactions', 'add_transactions', 'edit_transactions', null);
select pg_temp.household_policies('savings_accounts', 'view_balances', 'manage_savings', 'manage_savings', null);
select pg_temp.household_policies('savings_goals', 'view_balances', 'manage_savings', 'manage_savings', null);
select pg_temp.household_policies('savings_contributions', 'view_balances', 'manage_savings', 'manage_savings', null);
select pg_temp.household_policies('shopping_lists', 'view_shopping', 'edit_shopping', 'edit_shopping', null);
select pg_temp.household_policies('shopping_items', 'view_shopping', 'edit_shopping', 'edit_shopping', null);
select pg_temp.household_policies('recurring_payments', 'view_budget', 'manage_recurring', 'manage_recurring', null);
select pg_temp.household_policies('subscription_usage', 'view_budget', 'manage_recurring', 'manage_recurring', 'manage_recurring');
select pg_temp.household_policies('vision_ledger_entries', 'view_budget', 'manage_savings', 'manage_savings', null);
select pg_temp.household_policies('financial_advisory_reports', 'view_advisor', 'view_advisor', 'view_advisor', null);
select pg_temp.household_policies('household_invitations', 'manage_members', 'manage_members', 'manage_members', 'manage_members');

-- Shopping: members with mark_purchased may also update (guarded by trigger above).
create policy shopping_items_mark_purchased on public.shopping_items for update
  using (public.has_perm(household_id, 'mark_purchased')) with check (public.has_perm(household_id, 'mark_purchased'));

-- Profiles: only yourself.
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Households: members read; settings managers update; creation only via create_household().
create policy households_select on public.households for select using (public.is_member(id));
create policy households_update on public.households for update using (public.has_perm(id, 'manage_settings')) with check (public.has_perm(id, 'manage_settings'));
create policy balances_select on public.household_balances for select using (public.has_perm(household_id, 'view_balances'));
create policy balances_update on public.household_balances for update using (public.has_perm(household_id, 'view_balances') and public.has_perm(household_id, 'manage_settings'));

-- Members: members see active members; only the owner (manage_members) changes membership.
create policy members_select on public.household_members for select using (public.is_member(household_id) and (status = 'active' or public.has_perm(household_id, 'manage_members')) or user_id = auth.uid());
create policy members_update on public.household_members for update using (public.has_perm(household_id, 'manage_members') and role <> 'owner') with check (role <> 'owner');

-- Personas & preferences: personal.
create policy personas_self on public.user_personas for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(household_id));
create policy prefs_self on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Categories: system rows for everyone; household rows for members.
create policy categories_select on public.transaction_categories for select using (household_id is null or public.is_member(household_id));
create policy categories_insert on public.transaction_categories for insert with check (household_id is not null and public.has_perm(household_id, 'manage_settings'));

-- Market data: read-only for signed-in users; written by service role / verified ingestion only.
create policy market_products_read on public.market_products for select to authenticated using (true);
create policy market_prices_read on public.market_prices for select to authenticated using (true);
create policy market_history_read on public.market_price_history for select to authenticated using (true);

-- Notifications: your own + household-wide; you can only mark your view as read.
create policy notifications_select on public.notifications for select using (public.is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_insert on public.notifications for insert with check (public.is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on public.notifications for update using (public.is_member(household_id) and (user_id is null or user_id = auth.uid()));

-- Audit log: append-only; readable by the owner.
create policy audit_select on public.audit_logs for select using (public.has_perm(household_id, 'manage_members'));
create policy audit_insert on public.audit_logs for insert with check (actor_id = auth.uid() and public.is_member(household_id));

-- =====================================================================
-- RPCs (SECURITY DEFINER, each validates the caller)
-- =====================================================================
create or replace function public.create_household(p_name text, p_currency text, p_country text, p_timezone text, p_opening_balance bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid; uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select * into p from profiles where id = uid;
  insert into households (name, owner_id, currency, country, timezone) values (p_name, uid, p_currency, p_country, p_timezone) returning id into hid;
  insert into household_balances (household_id, opening_balance) values (hid, greatest(p_opening_balance, 0));
  insert into household_members (household_id, user_id, display_name, email, role) values (hid, uid, p.full_name, p.email, 'owner');
  update profiles set default_household_id = hid where id = uid;
  return hid;
end $$;

create or replace function public.lookup_invitation(p_token text)
returns table (id uuid, household_id uuid, household_name text, email text, role text, status text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.household_id, h.name, i.email, i.role, i.status, i.expires_at
  from household_invitations i join households h on h.id = i.household_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv household_invitations; uid uuid := auth.uid(); p profiles;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  select * into inv from household_invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'This invitation link is not valid'; end if;
  if inv.status <> 'pending' then raise exception 'This invitation has already been %', inv.status; end if;
  if inv.expires_at < now() then update household_invitations set status = 'expired' where id = inv.id; raise exception 'This invitation has expired'; end if;
  select * into p from profiles where id = uid;
  if lower(p.email) <> lower(inv.email) then raise exception 'This invitation was sent to a different email address'; end if;
  insert into household_members (household_id, user_id, display_name, email, role)
    values (inv.household_id, uid, p.full_name, p.email, inv.role)
    on conflict (household_id, user_id) do update set status = 'active', role = excluded.role;
  update household_invitations set status = 'accepted', accepted_by = uid where id = inv.id;
  update profiles set default_household_id = inv.household_id where id = uid;
  return inv.household_id;
end $$;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update profiles set deletion_requested_at = now() where id = auth.uid();
  insert into audit_logs (household_id, actor_id, action, entity, entity_id, note)
    select m.household_id, auth.uid(), 'delete', 'profiles', auth.uid(), 'Account deletion requested'
    from household_members m where m.user_id = auth.uid();
end $$;

revoke all on function public.create_household, public.accept_invitation, public.request_account_deletion, public.lookup_invitation from public;
grant execute on function public.create_household, public.accept_invitation, public.request_account_deletion, public.lookup_invitation to authenticated;
grant execute on function public.lookup_invitation to anon;
