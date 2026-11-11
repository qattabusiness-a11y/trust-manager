-- =====================================================================
-- Trust Manager: sample data for ONE account (for demos and pitches)
--
-- How to use:
--   1. The account must exist and have finished the 5-step setup.
--   2. Supabase → SQL Editor → New query → paste this whole file.
--   3. If needed, change the email on the line marked  <<< EMAIL
--   4. Click Run. Sign in to the app and refresh.
--
-- WARNING: it first ERASES every record in that account's household
-- (transactions, budgets, savings, shopping, bills, prices, notifications),
-- then adds about two months of realistic activity (Kigali, RWF).
-- The account, its household, members and setup answers are kept.
-- Other households are not touched. Running it again starts fresh again.
-- =====================================================================

do $$
declare
  v_email text := 'uwayaline4@gmail.com';   -- <<< EMAIL
  uid uuid; hid uuid; tz text; cur text; full_name text;
  today date; start_day date; d date; i int; n int;
  acc_emergency uuid; acc_goals uuid;
  g_school uuid; g_land uuid; g_emergency uuid;
  b_now uuid; b_prev uuid;
  list_id uuid; tx uuid; rec uuid;
  ts timestamptz;
  c_groc uuid := '00000000-0000-4000-8000-ca0000000001';
  c_rent uuid := '00000000-0000-4000-8000-ca0000000002';
  c_util uuid := '00000000-0000-4000-8000-ca0000000003';
  c_tran uuid := '00000000-0000-4000-8000-ca0000000004';
  c_heal uuid := '00000000-0000-4000-8000-ca0000000005';
  c_educ uuid := '00000000-0000-4000-8000-ca0000000006';
  c_comm uuid := '00000000-0000-4000-8000-ca0000000007';
  c_hous uuid := '00000000-0000-4000-8000-ca0000000008';
  c_fami uuid := '00000000-0000-4000-8000-ca0000000009';
  c_dine uuid := '00000000-0000-4000-8000-ca0000000010';
  c_ente uuid := '00000000-0000-4000-8000-ca0000000011';
  c_subs uuid := '00000000-0000-4000-8000-ca0000000012';
  c_clot uuid := '00000000-0000-4000-8000-ca0000000013';
  c_pers uuid := '00000000-0000-4000-8000-ca0000000014';
  c_sala uuid := '00000000-0000-4000-8000-ca0000000017';
  c_free uuid := '00000000-0000-4000-8000-ca0000000018';
  c_save uuid := '00000000-0000-4000-8000-ca0000000021';
  markets text[] := array['Simba Supermarket','Kimironko Market','Nyabugogo Market','Nakumatt Kigali Heights'];
begin
  -- ---------------------------------------------------------- find the account
  select p.id, p.default_household_id, p.full_name into uid, hid, full_name
    from public.profiles p where p.email = lower(v_email);
  if uid is null then
    raise exception 'No account with email %. Sign up in the app first, then run this again.', v_email;
  end if;
  if hid is null then
    raise exception 'The account % has not finished the setup steps yet. Sign in, finish setup, then run this again.', v_email;
  end if;

  -- ---------------------------------------------------------- clean the household
  delete from public.subscription_usage where household_id = hid;
  delete from public.savings_contributions where household_id = hid;
  update public.shopping_items set transaction_id = null where household_id = hid;
  delete from public.transactions where household_id = hid;
  delete from public.shopping_items where household_id = hid;
  delete from public.shopping_lists where household_id = hid;
  delete from public.recurring_payments where household_id = hid;
  update public.vision_ledger_entries set goal_id = null where household_id = hid;
  delete from public.savings_goals where household_id = hid;
  delete from public.vision_ledger_entries where household_id = hid;
  delete from public.savings_accounts where household_id = hid;
  delete from public.budget_allocations where household_id = hid;
  delete from public.budgets where household_id = hid;
  delete from public.income_sources where household_id = hid;
  delete from public.market_price_history where household_id = hid;
  delete from public.market_products where household_id = hid;
  delete from public.notifications where household_id = hid;
  delete from public.financial_advisory_reports where household_id = hid;

  select h.timezone, h.currency into tz, cur from public.households h where h.id = hid;
  today := (now() at time zone tz)::date;
  start_day := today - 62;

  -- Opening balance on the first sample day, so the history adds up.
  update public.household_balances
     set opening_balance = 640000,
         opening_balance_date = (start_day::timestamp) at time zone tz
   where household_id = hid;

  -- ---------------------------------------------------------- income sources
  insert into public.income_sources (household_id, owner_user_id, name, amount, category, frequency, expected_date, recurring, savings_allocation, notes)
  values
    (hid, uid, 'Salary', 480000, 'salary', 'monthly', (date_trunc('month', today) + interval '24 days')::date, true, 60000, 'Paid by bank transfer on the 25th'),
    (hid, uid, 'Tailoring side business', 90000, 'business', 'monthly', (date_trunc('month', today) + interval '27 days')::date, true, 10000, 'Varies a little each month');

  -- ---------------------------------------------------------- budgets (this month + last month)
  for i in 0..1 loop
    d := (date_trunc('month', today) - (i || ' month')::interval)::date;
    insert into public.budgets (household_id, month, monthly_budget, savings_target, essential_allocation, flexible_allocation)
    values (hid, to_char(d, 'YYYY-MM'), 430000, 80000, 340000, 90000)
    on conflict (household_id, month) do update
      set monthly_budget = excluded.monthly_budget, savings_target = excluded.savings_target,
          essential_allocation = excluded.essential_allocation, flexible_allocation = excluded.flexible_allocation
    returning id into rec;
    if i = 0 then b_now := rec; else b_prev := rec; end if;
    delete from public.budget_allocations where budget_id = rec;
    insert into public.budget_allocations (household_id, budget_id, category_id, amount) values
      (hid, rec, c_rent, 150000), (hid, rec, c_groc, 95000), (hid, rec, c_tran, 35000),
      (hid, rec, c_util, 25000), (hid, rec, c_comm, 22000), (hid, rec, c_educ, 20000),
      (hid, rec, c_heal, 10000), (hid, rec, c_fami, 20000), (hid, rec, c_hous, 10000),
      (hid, rec, c_dine, 25000), (hid, rec, c_ente, 15000), (hid, rec, c_clot, 15000),
      (hid, rec, c_pers, 8000);
  end loop;

  -- ---------------------------------------------------------- savings
  insert into public.savings_accounts (household_id, name, kind, opening_balance)
    values (hid, 'Emergency fund', 'emergency', 40000) returning id into acc_emergency;
  insert into public.savings_accounts (household_id, name, kind, opening_balance)
    values (hid, 'Family goals', 'goal', 0) returning id into acc_goals;

  insert into public.savings_goals (household_id, name, target_amount, target_date, account_id, priority)
    values (hid, 'Emergency fund (3 months)', 900000, today + 300, acc_emergency, 'high') returning id into g_emergency;
  insert into public.savings_goals (household_id, name, target_amount, target_date, account_id, priority)
    values (hid, 'School fees — next term', 180000, today + 55, acc_goals, 'high') returning id into g_school;
  insert into public.savings_goals (household_id, name, target_amount, target_date, account_id, priority)
    values (hid, 'Plot of land in Bugesera', 3500000, today + 900, acc_goals, 'medium') returning id into g_land;

  insert into public.vision_ledger_entries (household_id, title, description, category, target_amount, target_date, priority, progress, status, goal_id, created_by) values
    (hid, 'Own a plot of land', 'Buy land in Bugesera and start building in 3 years.', 'long_term', 3500000, today + 900, 'medium', 6, 'in_progress', g_land, uid),
    (hid, 'Second sewing machine', 'Grow the tailoring business to take school-uniform orders.', 'business', 350000, today + 150, 'medium', 0, 'planning', null, uid),
    (hid, 'Family trip to Lake Kivu', 'A long weekend in Rubavu for the whole family.', 'dream', 200000, today + 240, 'low', 0, 'idea', null, uid);

  -- ---------------------------------------------------------- daily life (≈ 2 months)
  d := start_day;
  n := 0;
  while d <= today loop
    n := n + 1;
    -- Transport on weekdays (moto / bus), amounts vary
    if extract(isodow from d) <= 5 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense', case when n % 3 = 0 then 'Bus to work' else 'Moto to town' end,
              case when n % 3 = 0 then 600 else 1000 + (n % 4) * 500 end, cur,
              ((d + time '07:40')::timestamp) at time zone tz, c_tran, case when n % 3 = 0 then 'Kigali Bus Services' else '' end,
              case when n % 3 = 0 then 'card' else 'cash' end, true, true, 'manual', 'SAMPLE', uid);
    end if;
    -- Groceries every 3rd day, a bigger market trip on Saturdays
    if n % 3 = 1 or extract(isodow from d) = 6 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense',
              case when extract(isodow from d) = 6 then 'Weekly market shopping' else (array['Milk and bread','Vegetables and fruit','Rice, beans and oil','Sugar and tea','Eggs and tomatoes'])[1 + n % 5] end,
              case when extract(isodow from d) = 6 then 22000 + (n % 5) * 1500 else 3500 + (n % 6) * 900 end, cur,
              ((d + time '17:30')::timestamp) at time zone tz, c_groc,
              case when extract(isodow from d) = 6 then 'Kimironko Market' else markets[1 + n % 4] end,
              case when n % 2 = 0 then 'momo' else 'cash' end, true, true, 'manual', 'SAMPLE', uid);
    end if;
    -- Airtime / data every Monday
    if extract(isodow from d) = 1 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense', 'Airtime and data bundle', 3000, cur, ((d + time '08:15')::timestamp) at time zone tz, c_comm, 'MTN Rwanda', 'momo', true, true, 'manual', 'SAMPLE', uid);
    end if;
    -- Eating out on some Fridays and Sundays (the unplanned spending)
    if extract(isodow from d) in (5, 7) and n % 2 = 0 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense', case when extract(isodow from d) = 5 then 'Lunch with colleagues' else 'Brochettes with family' end,
              6500 + (n % 3) * 2000, cur, ((d + time '13:10')::timestamp) at time zone tz, c_dine,
              case when extract(isodow from d) = 5 then 'Java House' else 'Car Wash Kimihurura' end, 'momo', false, false, 'manual', 'SAMPLE', uid);
    end if;

    -- Monthly items keyed to the day of the month
    if extract(day from d) = 25 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'income', 'Salary', 480000, cur, ((d + time '09:00')::timestamp) at time zone tz, c_sala, 'Employer', 'bank', true, true, 'manual', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 28 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'income', 'Tailoring orders', 85000 + (n % 3) * 5000, cur, ((d + time '18:00')::timestamp) at time zone tz, c_free, 'Customers', 'momo', true, true, 'manual', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 5 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by) values
        (hid, 'expense', 'House rent', 150000, cur, ((d + time '10:00')::timestamp) at time zone tz, c_rent, 'Landlord', 'momo', true, true, 'recurring', 'SAMPLE', uid),
        (hid, 'expense', 'Home internet', 20000, cur, ((d + time '10:20')::timestamp) at time zone tz, c_comm, 'Canal+ Box', 'momo', true, true, 'recurring', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 8 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by) values
        (hid, 'expense', 'Electricity (Cash Power)', 15000, cur, ((d + time '19:00')::timestamp) at time zone tz, c_util, 'REG', 'momo', true, true, 'manual', 'SAMPLE', uid),
        (hid, 'expense', 'Water bill', 6500, cur, ((d + time '19:10')::timestamp) at time zone tz, c_util, 'WASAC', 'momo', true, true, 'recurring', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 12 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense', 'Support for parents', 20000, cur, ((d + time '12:00')::timestamp) at time zone tz, c_fami, 'Mama', 'momo', true, true, 'manual', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 15 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by) values
        (hid, 'expense', 'TV subscription', 10000, cur, ((d + time '20:00')::timestamp) at time zone tz, c_subs, 'Canal+', 'momo', false, true, 'recurring', 'SAMPLE', uid),
        (hid, 'expense', 'Soap, detergent and charcoal', 9500, cur, ((d + time '16:00')::timestamp) at time zone tz, c_hous, 'Simba Supermarket', 'cash', true, true, 'manual', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 20 then
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by)
      values (hid, 'expense', 'Pharmacy', 4500 + (n % 3) * 2000, cur, ((d + time '18:30')::timestamp) at time zone tz, c_heal, 'Pharmacie Conseil', 'cash', true, false, 'manual', 'SAMPLE', uid);
    end if;
    if extract(day from d) = 26 then
      -- Save part of the salary (shows on Savings and in the budget)
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, savings_goal_id, created_by)
      values (hid, 'savings_transfer', 'Transfer to savings', 40000, cur, ((d + time '09:30')::timestamp) at time zone tz, c_save, '', 'bank', true, true, 'manual', 'SAMPLE', g_school, uid)
      returning id into tx;
      insert into public.savings_contributions (household_id, goal_id, account_id, amount, source, simulated, transaction_id, note, contributed_at)
      values (hid, g_school, acc_goals, 40000, 'income_allocation', true, tx, 'From salary', ((d + time '09:30')::timestamp) at time zone tz);
      insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, savings_goal_id, created_by)
      values (hid, 'savings_transfer', 'Transfer to savings', 25000, cur, ((d + time '09:35')::timestamp) at time zone tz, c_save, '', 'bank', true, true, 'manual', 'SAMPLE', g_emergency, uid)
      returning id into tx;
      insert into public.savings_contributions (household_id, goal_id, account_id, amount, source, simulated, transaction_id, note, contributed_at)
      values (hid, g_emergency, acc_emergency, 25000, 'income_allocation', true, tx, 'From salary', ((d + time '09:35')::timestamp) at time zone tz);
    end if;
    d := d + 1;
  end loop;

  -- A few one-off moments
  insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, created_by) values
    (hid, 'expense', 'School uniforms and books', 45000, cur, (((today - 40) + time '11:00')::timestamp) at time zone tz, c_educ, 'Librairie Caritas', 'momo', true, true, 'manual', 'SAMPLE', uid),
    (hid, 'expense', 'New shoes', 18000, cur, (((today - 18) + time '15:00')::timestamp) at time zone tz, c_clot, 'Kigali City Market', 'momo', false, false, 'manual', 'SAMPLE', uid),
    (hid, 'expense', 'Wedding contribution', 20000, cur, (((today - 9) + time '14:00')::timestamp) at time zone tz, c_ente, 'Friend''s wedding', 'momo', false, true, 'manual', 'SAMPLE', uid),
    (hid, 'expense', 'Hair salon', 5000, cur, (((today - 3) + time '10:30')::timestamp) at time zone tz, c_pers, 'Salon Diane', 'cash', false, false, 'manual', 'SAMPLE', uid);

  -- Saved earlier this month
  insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, savings_goal_id, created_by)
  values (hid, 'savings_transfer', 'Transfer to savings', 30000, cur, (((today - 4) + time '08:00')::timestamp) at time zone tz, c_save, '', 'momo', true, true, 'manual', 'SAMPLE', g_emergency, uid)
  returning id into tx;
  insert into public.savings_contributions (household_id, goal_id, account_id, amount, source, simulated, transaction_id, note, contributed_at)
  values (hid, g_emergency, acc_emergency, 30000, 'manual', true, tx, 'Tailoring profit', (((today - 4) + time '08:00')::timestamp) at time zone tz);

  -- Land goal: an early deposit
  insert into public.transactions (household_id, type, title, amount, currency, occurred_at, category_id, merchant, payment_method, essential, planned, source, reference, savings_goal_id, created_by)
  values (hid, 'savings_transfer', 'Transfer to savings', 200000, cur, (((today - 50) + time '10:00')::timestamp) at time zone tz, c_save, '', 'bank', true, true, 'manual', 'SAMPLE', g_land, uid)
  returning id into tx;
  insert into public.savings_contributions (household_id, goal_id, account_id, amount, source, simulated, transaction_id, note, contributed_at)
  values (hid, g_land, acc_goals, 200000, 'manual', true, tx, 'Bonus from last quarter', (((today - 50) + time '10:00')::timestamp) at time zone tz);

  -- ---------------------------------------------------------- bills & subscriptions
  insert into public.recurring_payments (household_id, name, amount, category, kind, frequency, next_due_date, reminder_days, status, essential) values
    (hid, 'House rent', 150000, 'Rent & Housing', 'bill', 'monthly', (date_trunc('month', today) + interval '1 month 4 days')::date, '{7,3,1}', 'active', true),
    (hid, 'Home internet (Canal+ Box)', 20000, 'Airtime & Internet', 'bill', 'monthly', (date_trunc('month', today) + interval '1 month 4 days')::date, '{3,1}', 'active', true),
    (hid, 'Water (WASAC)', 6500, 'Utilities', 'bill', 'monthly', (date_trunc('month', today) + interval '1 month 7 days')::date, '{3,1}', 'active', true),
    (hid, 'Canal+ TV', 10000, 'Subscriptions', 'subscription', 'monthly', (date_trunc('month', today) + interval '14 days')::date + case when extract(day from today) > 15 then 30 else 0 end, '{3,1}', 'active', false),
    (hid, 'School fees — next term', 180000, 'Education', 'bill', 'quarterly', today + 55, '{14,7,3,1}', 'active', true),
    (hid, 'Mutuelle de santé (family)', 18000, 'Health & Medical', 'bill', 'yearly', today + 6, '{7,3,1}', 'active', true);

  -- ---------------------------------------------------------- market prices (private to this household)
  for i in 0..2 loop
    ts := (((today - (i * 14)) + time '10:00')::timestamp) at time zone tz;
    insert into public.market_price_history (product_id, market_name, location, price, currency, recorded_at, source, household_id, recorded_by) values
      ('00000000-0000-4000-8000-ab0000000001', 'Kimironko Market', 'Kigali', 1500 - i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000001', 'Simba Supermarket', 'Kigali', 1750 - i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000002', 'Kimironko Market', 'Kigali', 1100 + i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000002', 'Nyabugogo Market', 'Kigali', 1000 + i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000005', 'Kimironko Market', 'Kigali', 1800 - i * 100, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000005', 'Simba Supermarket', 'Kigali', 1950 - i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000007', 'Kimironko Market', 'Kigali', 3200 - i * 100, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000007', 'Simba Supermarket', 'Kigali', 3600, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000008', 'Nyabugogo Market', 'Kigali', 600 + i * 50, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000009', 'Kimironko Market', 'Kigali', 900 + i * 100, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000010', 'Kimironko Market', 'Kigali', 1200 - i * 100, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000014', 'Simba Supermarket', 'Kigali', 1000, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000014', 'Kimironko Market', 'Kigali', 600 + i * 0, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000015', 'Kimironko Market', 'Kigali', 4500 - i * 200, cur, ts, 'Recorded by household', hid, uid),
      ('00000000-0000-4000-8000-ab0000000020', 'Nyabugogo Market', 'Kigali', 18000 - i * 1000, cur, ts, 'Recorded by household', hid, uid);
  end loop;

  -- ---------------------------------------------------------- shopping list
  insert into public.shopping_lists (household_id, name) values (hid, 'Household shopping') returning id into list_id;
  insert into public.shopping_items (household_id, list_id, product_name, market_product_id, category, quantity, unit, estimated_unit_price, priority, expected_date, status, added_by) values
    (hid, list_id, 'Rice (local)', '00000000-0000-4000-8000-ab0000000001', 'Grains', 5, 'kg', 1500, 'high', today + 2, 'needed', uid),
    (hid, list_id, 'Beans', '00000000-0000-4000-8000-ab0000000002', 'Grains', 3, 'kg', 1100, 'high', today + 2, 'needed', uid),
    (hid, list_id, 'Cooking oil', '00000000-0000-4000-8000-ab0000000007', 'Cooking oil', 2, 'litre', 3200, 'medium', today + 4, 'needed', uid),
    (hid, list_id, 'Sugar', '00000000-0000-4000-8000-ab0000000005', 'Food', 2, 'kg', 1800, 'medium', today + 4, 'needed', uid),
    (hid, list_id, 'Charcoal', '00000000-0000-4000-8000-ab0000000020', 'Household supplies', 1, 'sack', 18000, 'medium', today + 6, 'needed', uid),
    (hid, list_id, 'Eggs (tray of 30)', '00000000-0000-4000-8000-ab0000000015', 'Food', 1, 'tray', 4500, 'low', today + 3, 'needed', uid),
    (hid, list_id, 'Washing powder', '00000000-0000-4000-8000-ab0000000019', 'Cleaning products', 1, 'kg', 2500, 'low', null, 'needed', uid);

  raise notice 'Done: sample data added for % (household %).', v_email, hid;
end $$;
