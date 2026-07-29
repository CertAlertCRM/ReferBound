-- ── Migration 15: lender workspace ("your referral board") ───────────────────
-- One aggregated, login-free board per LENDER EMAIL: every ReferBound agent
-- who lists that email as a partner contact, every referral, one page.
-- Ownership is proven by delivery — the board link is only ever sent to the
-- email itself, never shown on screen.
-- Run in Supabase SQL Editor. Safe to run more than once.

create table if not exists lender_hubs (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table lender_hubs enable row level security;
grant all on lender_hubs to service_role;
