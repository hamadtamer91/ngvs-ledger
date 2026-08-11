-- ============================================================================
-- NGVS Company Ledger — Database Schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- PROFILES  (one row per team member, linked 1:1 to auth.users)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('Admin','Accountant','Viewer')) default 'Viewer',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helper functions (security definer so they can read profiles even under RLS)
create or replace function my_role() returns text
language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select role = 'Admin' and active from profiles where id = auth.uid()), false)
$$;

create or replace function can_edit() returns boolean
language sql security definer stable as $$
  select coalesce((select role in ('Admin','Accountant') and active from profiles where id = auth.uid()), false)
$$;

-- Lets the signed-out app check whether any account exists yet, so it can
-- show the one-time "Create Admin Account" screen instead of Login.
create or replace function is_first_run() returns boolean
language sql security definer stable as $$
  select not exists(select 1 from profiles)
$$;
grant execute on function is_first_run() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- DEPARTMENTS
-- ----------------------------------------------------------------------------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ----------------------------------------------------------------------------
-- FUND LOCATIONS  (bank / cash accounts)
-- ----------------------------------------------------------------------------
create table if not exists fund_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('Bank','Cash','Other')),
  opening_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ----------------------------------------------------------------------------
-- FUND TRANSACTIONS  (deposits + transfers; transfers are two linked rows)
-- ----------------------------------------------------------------------------
create table if not exists fund_transactions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references fund_locations(id) on delete restrict,
  amount numeric(14,2) not null,               -- positive = credit, negative = debit (transfer-out)
  type text not null check (type in ('Deposit','Transfer')),
  transfer_id uuid,                              -- links the two rows of a transfer
  counterparty_name text,
  date date not null default current_date,
  notes text,
  added_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- EXPENSES  (salary + operational records)
-- ----------------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('Salary','Operational')),
  date date not null default current_date,
  department text not null,
  payee text not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'USD',
  payment_method text not null,
  status text not null check (status in ('Paid','Pending','Overdue','Scheduled')),
  fund_location_id uuid references fund_locations(id) on delete restrict,
  notes text,
  added_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on expenses(date);
create index if not exists idx_expenses_fund on expenses(fund_location_id);
create index if not exists idx_fundtx_location on fund_transactions(location_id);

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_expenses_touch on expenses;
create trigger trg_expenses_touch before update on expenses
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table departments enable row level security;
alter table fund_locations enable row level security;
alter table fund_transactions enable row level security;
alter table expenses enable row level security;

-- profiles: everyone signed-in can read the team list (needed for "Recorded by" names);
-- only Admins can change roles/active status; a user can update their own name.
create policy "profiles_select_all" on profiles for select using (auth.uid() is not null);
create policy "profiles_admin_update" on profiles for update using (is_admin());
create policy "profiles_self_update_name" on profiles for update using (auth.uid() = id);
create policy "profiles_admin_insert" on profiles for insert with check (is_admin() or auth.uid() = id);

-- departments: everyone reads; Admin/Accountant insert; Admin deletes
create policy "departments_select" on departments for select using (auth.uid() is not null);
create policy "departments_insert" on departments for insert with check (can_edit());
create policy "departments_delete" on departments for delete using (is_admin());

-- fund locations: everyone reads; Admin/Accountant create; Admin deletes
create policy "fundloc_select" on fund_locations for select using (auth.uid() is not null);
create policy "fundloc_insert" on fund_locations for insert with check (can_edit());
create policy "fundloc_delete" on fund_locations for delete using (is_admin());

-- fund transactions: everyone reads; Admin/Accountant create; nobody deletes (audit trail)
create policy "fundtx_select" on fund_transactions for select using (auth.uid() is not null);
create policy "fundtx_insert" on fund_transactions for insert with check (can_edit());

-- expenses: everyone reads; Admin/Accountant create/update; Admin deletes
create policy "expenses_select" on expenses for select using (auth.uid() is not null);
create policy "expenses_insert" on expenses for insert with check (can_edit());
create policy "expenses_update" on expenses for update using (can_edit());
create policy "expenses_delete" on expenses for delete using (is_admin());

-- ----------------------------------------------------------------------------
-- SEED: first user to sign up becomes Admin automatically (see trigger below).
-- After that, all further accounts must be created by an Admin via the
-- create-user Edge Function — self-signup is disabled in the app itself.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from profiles;
  insert into profiles (id, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    case when is_first then 'Admin' else 'Viewer' end,
    true
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
