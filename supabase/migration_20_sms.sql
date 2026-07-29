-- ── Migration 20: SMS notifications (Twilio) ─────────────────────────────────
-- Two text moments, both strictly opt-in:
--   1) Agent gets a text when a new referral arrives (their own toggle).
--   2) A partner contact gets a text at quote-out and docs-delivered on THEIR
--      leads — only if they opted in with a mobile number.
-- Run in Supabase SQL Editor. Safe to run more than once.

create table if not exists sms_log (
  id bigint generated always as identity primary key,
  referral_id uuid references referrals(id) on delete set null,
  kind text not null,
  recipient text not null,
  body text,
  sent boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_log_ref on sms_log(referral_id, kind, created_at);
alter table sms_log enable row level security;
grant all on sms_log to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table partner_contacts add column if not exists phone text;
alter table partner_contacts add column if not exists sms_opt_in boolean not null default false;
alter table agent_profile add column if not exists sms_new_lead boolean not null default false;
