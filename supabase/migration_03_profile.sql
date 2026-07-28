-- ── Migration 03: agent profile ──────────────────────────────────────────────
-- Run once in the Supabase SQL Editor.

create table if not exists agent_profile (
  id text primary key default 'default',
  display_name text,
  agency_name text,
  office text,
  phone text,
  email text,
  headshot_path text,
  updated_at timestamptz not null default now()
);

alter table agent_profile enable row level security;
grant all on agent_profile to service_role;
