\set ON_ERROR_STOP 0
-- users
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','owner@x.rw','{"full_name":"Owner"}'),
 ('22222222-2222-4222-8222-222222222222','kid@x.rw','{"full_name":"Kid"}'),
 ('33333333-3333-4333-8333-333333333333','viewer@x.rw','{"full_name":"Viewer"}'),
 ('44444444-4444-4444-8444-444444444444','outsider@x.rw','{"full_name":"Outsider"}');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
set role authenticated;

-- Owner creates a household and records data
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.create_household('Test Home','RWF','Rwanda','Africa/Kigali', 100000) as hid \gset
insert into shopping_lists (household_id, name) values (:'hid', 'List') returning id as lid \gset
insert into transactions (household_id,type,title,amount,currency,occurred_at,category_id,payment_method,essential,planned,created_by)
 values (:'hid','expense','Groceries',5000,'RWF',now(),'00000000-0000-4000-8000-ca0000000001','momo',true,true,'11111111-1111-4111-8111-111111111111') returning id as txid \gset
select 'owner sees balance' as t, opening_balance from household_balances;

-- Invite kid (contributor) and viewer
insert into household_invitations (household_id,email,role,token_hash,expires_at,invited_by) values
 (:'hid','kid@x.rw','contributor',encode(digest('kidtoken','sha256'),'hex'),now()+interval '7 days','11111111-1111-4111-8111-111111111111'),
 (:'hid','viewer@x.rw','viewer',encode(digest('viewtoken','sha256'),'hex'),now()+interval '7 days','11111111-1111-4111-8111-111111111111'),
 (:'hid','late@x.rw','viewer',encode(digest('oldtoken','sha256'),'hex'),now()-interval '1 day','11111111-1111-4111-8111-111111111111');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select 'kid accepts' as t, public.accept_invitation('kidtoken') = :'hid' as ok;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select 'viewer accepts' as t, public.accept_invitation('viewtoken') = :'hid' as ok;
select 'viewer reuses kid token (expect error)' as t; select public.accept_invitation('kidtoken');

-- Owner restricts kid: no transactions
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update household_members set permission_overrides = '{"view_transactions":false,"add_transactions":false}' where user_id='22222222-2222-4222-8222-222222222222';
select 'owner tries to escalate viewer to edit (override ignored)' as t;
update household_members set permission_overrides = '{"edit_shopping":true}' where user_id='33333333-3333-4333-8333-333333333333';

-- Kid
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select 'kid sees transactions (expect 0)' as t, count(*) from transactions;
select 'kid sees balance (expect 0 rows)' as t, count(*) from household_balances;
insert into shopping_items (household_id,list_id,product_name,category,quantity,unit,estimated_unit_price,added_by)
 values (:'hid',:'lid','Rice','Grains',5,'kg',1300,'22222222-2222-4222-8222-222222222222') returning id as sid \gset
select 'kid added item' as t, count(*) from shopping_items;
select 'kid can mark bought' as t; update shopping_items set status='bought', actual_cost=6000 where id=:'sid';
select 'kid inserts transaction (expect RLS error)' as t;
insert into transactions (household_id,type,title,amount,currency,occurred_at,category_id,payment_method,essential,planned,created_by)
 values (:'hid','expense','Sneaky',1,'RWF',now(),'00000000-0000-4000-8000-ca0000000001','cash',false,false,'22222222-2222-4222-8222-222222222222');
select 'kid tries to change own role (expect 0 rows updated)' as t;
update household_members set role='admin' where user_id='22222222-2222-4222-8222-222222222222';
select 'kid role still' as t, role from household_members where user_id='22222222-2222-4222-8222-222222222222';

-- Viewer
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select 'viewer sees items' as t, count(*) from shopping_items;
select 'viewer edits item (expect 0 rows)' as t; update shopping_items set product_name='X' where id=:'sid';
select 'viewer adds item (expect RLS error)' as t;
insert into shopping_items (household_id,list_id,product_name,category,quantity,unit,estimated_unit_price,added_by) values (:'hid',:'lid','Beans','Grains',1,'kg',1000,'33333333-3333-4333-8333-333333333333');

-- Outsider
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
select 'outsider sees households (expect 0)' as t, count(*) from households;
select 'outsider sees items (expect 0)' as t, count(*) from shopping_items;
select 'outsider expired token (expect error)' as t; select public.accept_invitation('oldtoken');

-- Owner: hard delete transaction blocked, soft delete ok, audit trail present
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from transactions where id=:'txid';
select 'tx still exists after DELETE (expect 1)' as t, count(*) from transactions where id=:'txid';
update transactions set amount=5500 where id=:'txid';
select 'audit entries for tx' as t, action, changes from audit_logs where entity_id=:'txid' order by created_at;
select 'audit delete attempt (expect 0 rows)' as t; delete from audit_logs;
select 'audit count' as t, count(*) from audit_logs;
