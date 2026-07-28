-- ── Migration 04: early-access waitlist ──────────────────────────────────────
-- Run once in the Supabase SQL Editor.

create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;
grant all on waitlist to service_role;
