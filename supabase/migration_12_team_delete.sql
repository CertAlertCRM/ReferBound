-- ── Migration 12: Agency team seats + account deletion support ───────────────
-- Team model: an Agency-plan account is the OWNER. Teammates sign up through
-- an invite link and get team_owner_id set — from then on they see and work
-- the owner's partners, referrals, and profile (one shared book). Up to 10
-- users per agency (owner + 9 teammates), enforced at invite acceptance.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table accounts add column if not exists team_owner_id uuid references accounts(id) on delete cascade;
create index if not exists idx_accounts_team_owner on accounts(team_owner_id);

-- Reusable invite link per agency (rotating generates a new code).
create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create index if not exists idx_team_invites_account on team_invites(account_id);
alter table team_invites enable row level security;

-- The app reaches the database only through the service-role key.
grant all on team_invites to service_role;
