-- ── Migration 02: activity log + document metadata ───────────────────────────
-- Run once in the Supabase SQL Editor.

-- Append-only activity timeline per referral (E&O-grade audit trail).
-- No UPDATE/DELETE is ever issued by the app; entries are permanent.
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  referral_id uuid not null references referrals(id) on delete cascade,
  event_type text not null, -- lead_logged | referral_submitted | status_changed | document_uploaded | email_sent | at_risk_flagged
  detail text,
  actor text not null default 'agent', -- agent | partner | system
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_ref on activity_log(referral_id, created_at desc);
alter table activity_log enable row level security;

-- Ensure the app's role can use the new table (covers projects where default
-- privileges weren't updated).
grant all on activity_log to service_role;
grant all on all sequences in schema public to service_role;

-- Document metadata: carrier + policy effective dates. Effective_end is the
-- foundation for annual EOI refresh reminders at renewal.
alter table documents add column if not exists carrier_name text;
alter table documents add column if not exists effective_start date;
alter table documents add column if not exists effective_end date;
