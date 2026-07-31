-- Migration 32: agent referral program
-- referral_code   — each account's shareable code (auto-generated, 8 chars).
-- referred_by     — who sent them, captured at signup and never re-derivable.
-- pro_until       — earned Pro access with an end date. Works the same for a
--                   free account (unlocks Pro), a monthly subscriber (skip the
--                   charge window), and an annual founder (pushes renewal out).
-- referral_rewards — one row per earned reward, so it can never double-pay.
alter table accounts add column if not exists referral_code text unique
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
alter table accounts add column if not exists referred_by uuid references accounts(id) on delete set null;
alter table accounts add column if not exists pro_until timestamptz;
create index if not exists idx_accounts_referred_by on accounts(referred_by);

create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  referred_account_id uuid not null references accounts(id) on delete cascade,
  months integer not null default 3,
  kind text not null default 'referrer',
  created_at timestamptz not null default now(),
  unique (account_id, referred_account_id, kind)
);
alter table referral_rewards enable row level security;

-- Backfill codes for accounts created before this migration.
update accounts
set referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
where referral_code is null;
