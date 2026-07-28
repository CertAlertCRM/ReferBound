-- ── ReferralLoop pilot schema ────────────────────────────────────────────────
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Then create a PRIVATE storage bucket named "docs" (Dashboard → Storage).

create extension if not exists pgcrypto;

-- Referral partners (e.g., the Cowart Home Loans team)
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- unguessable slug used for the magic link: /p/<token>
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- team email addresses that receive notifications
  emails text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Referred clients / deals
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  client_name text not null,
  client_phone text,
  client_email text,
  closing_date date,
  status text not null default 'new',
  lost_reason text,
  notes text,
  -- who logged it: 'agent' or 'partner'
  source text not null default 'agent',
  -- seconds it took the agent to log this lead (pilot metric)
  log_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every status change, for pilot timing metrics and the partner-visible timeline
create table if not exists status_events (
  id bigint generated always as identity primary key,
  referral_id uuid not null references referrals(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

-- Uploaded documents (EOI, RCE, dec page) stored in the "docs" bucket
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  kind text not null default 'other', -- eoi | rce | dec | other
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Outbound email log (also used to de-duplicate at-risk alerts)
create table if not exists email_log (
  id bigint generated always as identity primary key,
  referral_id uuid references referrals(id) on delete set null,
  kind text not null,           -- status_update | docs_ready | new_partner_lead | at_risk
  recipients text[] not null default '{}',
  subject text,
  sent boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_referrals_partner on referrals(partner_id);
create index if not exists idx_referrals_status on referrals(status);
create index if not exists idx_status_events_ref on status_events(referral_id);
create index if not exists idx_documents_ref on documents(referral_id);
create index if not exists idx_email_log_ref on email_log(referral_id, kind, created_at);

-- Row Level Security: the app talks to the database exclusively through the
-- service-role key on the server, so lock everything down for anon/authenticated.
alter table partners enable row level security;
alter table referrals enable row level security;
alter table status_events enable row level security;
alter table documents enable row level security;
alter table email_log enable row level security;

-- Append-only activity timeline per referral (see migration_02)
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  referral_id uuid not null references referrals(id) on delete cascade,
  event_type text not null,
  detail text,
  actor text not null default 'agent',
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_ref on activity_log(referral_id, created_at desc);
alter table activity_log enable row level security;

-- Document metadata (see migration_02)
alter table documents add column if not exists carrier_name text;
alter table documents add column if not exists effective_start date;
alter table documents add column if not exists effective_end date;

-- Private storage bucket for EOI / RCE / dec page uploads
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;
