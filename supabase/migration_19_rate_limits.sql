-- ── Migration 19: rate limiting ──────────────────────────────────────────────
-- DB-backed counters so login can't be brute-forced and public endpoints
-- (signup, forgot-password, feedback, portal submissions) can't be spammed.
-- Run in Supabase SQL Editor. Safe to run more than once.

create table if not exists rate_limits (
  key text primary key,
  count int not null default 1,
  window_start timestamptz not null default now()
);
alter table rate_limits enable row level security;
grant all on rate_limits to service_role;
