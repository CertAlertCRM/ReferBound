-- ── Migration 05: referral messages + premium tracking ───────────────────────
-- Run once in the Supabase SQL Editor.

-- Two-way, per-referral message thread between the agent and the partner.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  sender text not null, -- 'agent' | 'partner'
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_ref on messages(referral_id, created_at);
alter table messages enable row level security;
grant all on messages to service_role;

-- Premium tracking: what the referral turned into, for ROI reporting.
alter table referrals add column if not exists premium numeric;
alter table referrals add column if not exists policy_lines text;
