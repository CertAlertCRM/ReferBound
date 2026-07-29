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

-- Agent profile (see migration_03)
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

-- Richer partner submissions + partner doc uploads (see migration_07)
alter table referrals add column if not exists coborrower_name text;
alter table referrals add column if not exists property_address text;
alter table referrals add column if not exists client_dob date;
alter table documents add column if not exists uploaded_by text not null default 'agent';

-- Partner types (see migration_08)
alter table partners add column if not exists partner_type text not null default 'lender';

-- Partner intro-email templates (see migration_09)
alter table partners add column if not exists intro_template text;

-- Partner logos (see migration_06)
alter table partners add column if not exists logo_path text;

-- Referral message threads + premium tracking (see migration_05)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_ref on messages(referral_id, created_at);
alter table messages enable row level security;
alter table referrals add column if not exists premium numeric;
alter table referrals add column if not exists policy_lines text;

-- Early-access waitlist (see migration_04)
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text,
  created_at timestamptz not null default now()
);
alter table waitlist enable row level security;

-- Accounts, plans, billing (see migration_10)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  display_name text,
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz not null default now()
);
create table if not exists reset_codes (
  id bigint generated always as identity primary key,
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
alter table partners add column if not exists account_id uuid references accounts(id) on delete cascade;
alter table referrals add column if not exists account_id uuid references accounts(id) on delete cascade;
alter table agent_profile add column if not exists account_id uuid;
alter table accounts enable row level security;
alter table reset_codes enable row level security;

-- Outbound webhook / Zapier bridge (see migration_11)
alter table accounts add column if not exists webhook_url text;

-- Agency team seats (see migration_12)
alter table accounts add column if not exists team_owner_id uuid references accounts(id) on delete cascade;
create index if not exists idx_accounts_team_owner on accounts(team_owner_id);
create table if not exists team_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
create index if not exists idx_team_invites_account on team_invites(account_id);
alter table team_invites enable row level security;

-- Private storage bucket for EOI / RCE / dec page uploads
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;
