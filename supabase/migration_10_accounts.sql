-- ── Migration 10: accounts, plans, billing ───────────────────────────────────
-- Run once in the Supabase SQL Editor.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  display_name text,
  plan text not null default 'free',            -- free | pro | agency
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,                     -- active | past_due | canceled | null
  created_at timestamptz not null default now()
);

create table if not exists reset_codes (
  id bigint generated always as identity primary key,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table partners add column if not exists account_id uuid references accounts(id) on delete cascade;
alter table referrals add column if not exists account_id uuid references accounts(id) on delete cascade;
alter table agent_profile add column if not exists account_id uuid;

create index if not exists idx_partners_account on partners(account_id);
create index if not exists idx_referrals_account on referrals(account_id);
create index if not exists idx_profile_account on agent_profile(account_id);

alter table accounts enable row level security;
alter table reset_codes enable row level security;
grant all on accounts to service_role;
grant all on reset_codes to service_role;
grant all on all sequences in schema public to service_role;
