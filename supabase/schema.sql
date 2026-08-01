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

-- Annual billing / Founder Annual (see migration_21)
alter table accounts add column if not exists billing_interval text not null default 'monthly';

-- Per-contact notification channel (see migration_22)
alter table partner_contacts add column if not exists notify_channel text not null default 'both';

-- Custom partner-type label for "Other" (see migration_23)
alter table partners add column if not exists type_label text;

-- Per-agent portal theme (see migration_25)
alter table agent_profile add column if not exists brand_color text not null default 'default';

-- Optional portal speed scorecard (see migration_26)
alter table agent_profile add column if not exists show_scorecard boolean not null default true;

-- Signup channel attribution (see migration_34)
alter table accounts add column if not exists signup_source text;
create index if not exists idx_accounts_signup_source on accounts(signup_source);

-- Closing date changes (see migration_41)
alter table referrals add column if not exists closing_date_changed_at timestamptz;
alter table referrals add column if not exists closing_date_was date;
create index if not exists idx_referrals_date_changed on referrals(account_id, closing_date_changed_at desc) where closing_date_changed_at is not null;

-- Processor clause library (see migration_40)
create table if not exists mortgagee_clauses (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  label text not null,
  clause text not null,
  investor text,
  loan_types text[] not null default '{}',
  notes text,
  is_default boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists idx_clauses_partner on mortgagee_clauses(partner_id);
create unique index if not exists idx_clauses_one_default on mortgagee_clauses(partner_id) where is_default;
alter table mortgagee_clauses enable row level security;

alter table referrals add column if not exists mortgagee_clause_id uuid references mortgagee_clauses(id) on delete set null;
alter table referrals add column if not exists clause_source text;

create table if not exists partner_files (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kind text not null default 'requirements',
  file_name text not null,
  storage_path text,
  parsed jsonb,
  uploaded_by text not null default 'partner',
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_files on partner_files(partner_id, created_at desc);
alter table partner_files enable row level security;

-- Realtor track (see migration_39)
alter table referrals add column if not exists deal_lender jsonb;
alter table referrals add column if not exists lender_intro_at timestamptz;
alter table referrals add column if not exists realtor_ask_at timestamptz;
alter table partner_prospects add column if not exists via_partner_id uuid references partners(id) on delete set null;
create index if not exists idx_referrals_deal_lender on referrals(account_id) where deal_lender is not null;

-- Demo portal + partner setup sharing (see migration_38)
alter table accounts add column if not exists demo_token text;
create unique index if not exists idx_accounts_demo_token on accounts(demo_token) where demo_token is not null;
alter table partners add column if not exists shared_from uuid references accounts(id) on delete set null;
create table if not exists partner_shares (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default replace(gen_random_uuid()::text, '-', ''),
  partner_id uuid not null references partners(id) on delete cascade,
  from_account_id uuid not null references accounts(id) on delete cascade,
  uses integer not null default 0,
  max_uses integer not null default 25,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_shares_partner on partner_shares(partner_id);
alter table partner_shares enable row level security;

-- Client track (see migration_37)
alter table referrals add column if not exists quote_sent_at timestamptz;
alter table referrals add column if not exists welcome_sent_at timestamptz;
alter table referrals add column if not exists client_nudged_at timestamptz;
create index if not exists idx_referrals_quote_sent on referrals(account_id, quote_sent_at) where quote_sent_at is not null;

-- Email intake (see migration_36)
alter table accounts add column if not exists inbox_slug text;
create unique index if not exists idx_accounts_inbox_slug on accounts(inbox_slug) where inbox_slug is not null;
alter table agent_profile add column if not exists inbox_autocreate boolean not null default true;
alter table agent_profile add column if not exists inbox_autoack boolean not null default true;

create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  provider_id text,
  from_email text not null,
  from_name text,
  subject text,
  body text,
  received_at timestamptz not null default now(),
  partner_id uuid references partners(id) on delete set null,
  contact_id uuid references partner_contacts(id) on delete set null,
  match_kind text,
  extracted jsonb,
  status text not null default 'pending',
  referral_id uuid references referrals(id) on delete set null,
  acked_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inbound_account on inbound_emails(account_id, created_at desc);
create index if not exists idx_inbound_pending on inbound_emails(account_id) where status = 'pending';
create unique index if not exists idx_inbound_provider on inbound_emails(provider_id) where provider_id is not null;

-- The app reaches Postgres only through the service-role key on the server,
-- which bypasses RLS. Enabling it with no policies closes the table to anon and
-- authenticated keys entirely — which matters more here than anywhere else in
-- the schema, because this table holds the full body of forwarded referral
-- emails: client names, phones, addresses, whatever the loan officer typed.
alter table inbound_emails enable row level security;

-- Forwarded referrals (see migration_42)
alter table inbound_emails add column if not exists forwarded_from text;

-- Attachments on forwarded referrals (see migration_43)
alter table inbound_emails add column if not exists attachments jsonb;

-- Contacts who receive documents automatically (see migration_35)
alter table partner_contacts add column if not exists doc_recipient boolean not null default false;
create index if not exists idx_partner_contacts_doc_recipient
  on partner_contacts(partner_id) where doc_recipient;

-- Actual charged amount, for real MRR (see migration_33)
alter table accounts add column if not exists plan_amount_cents integer;

-- Agent referral program (see migration_32)
alter table accounts add column if not exists referral_code text unique
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
alter table accounts add column if not exists referred_by uuid references accounts(id) on delete set null;
alter table accounts add column if not exists pro_until timestamptz;
create index if not exists idx_accounts_referred_by on accounts(referred_by);
create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  referred_account_id uuid not null references accounts(id) on delete cascade,
  months integer not null default 3,
  kind text not null default 'referrer',
  created_at timestamptz not null default now(),
  unique (account_id, referred_account_id, kind)
);
alter table referral_rewards enable row level security;

-- E&O prevention suite (see migration_31)
alter table partners add column if not exists requirements jsonb;
alter table referrals add column if not exists coverage_notes jsonb;
alter table referrals add column if not exists renewal_notified_at timestamptz;
alter table agent_profile add column if not exists renewal_watch boolean not null default true;

-- Pre-delivery document cross-check (see migration_30)
alter table referrals add column if not exists doc_check jsonb;

-- Source-file retention + backfill tracking (see migration_29)
alter table agent_profile add column if not exists doc_retention_days integer not null default 0;
alter table documents add column if not exists purged_at timestamptz;
alter table referrals add column if not exists backfilled boolean not null default false;

-- Referral Radar — partner prospects & pipeline (see migration_28)
create table if not exists partner_prospects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text,
  company text,
  email text,
  phone text,
  nmls text,
  partner_type text not null default 'lender',
  source text not null default 'manual',
  status text not null default 'idea',
  notes text,
  deal_count integer not null default 0,
  last_seen_at timestamptz,
  converted_partner_id uuid references partners(id) on delete set null,
  suggested_partner_id uuid references partners(id) on delete cascade,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_prospects_account on partner_prospects(account_id, created_at desc);
alter table partner_prospects enable row level security;

-- Personalized notification voice (see migration_27)
alter table agent_profile add column if not exists voice_notes text;
alter table agent_profile add column if not exists notify_templates jsonb;

-- Directed team invites to existing accounts (see migration_24)
alter table team_invites add column if not exists invited_email text;
create index if not exists idx_team_invites_email on team_invites(invited_email);

-- Per-partner thank-you cadence (see migration_18)
alter table partners add column if not exists thankyou_cadence text not null default 'off';

-- Partner contacts — who on the team sent each lead (see migration_17)
create table if not exists partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  name text not null,
  email text not null,
  role text,
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_contacts_partner on partner_contacts(partner_id);
alter table partner_contacts enable row level security;
alter table referrals add column if not exists contact_id uuid references partner_contacts(id) on delete set null;

-- Short magic links (see migration_16)
alter table partners add column if not exists short_code text unique
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- Lender workspace / referral board (see migration_15)
create table if not exists lender_hubs (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  token text unique not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
alter table lender_hubs enable row level security;

-- Export tracking (see migration_14)
alter table referrals add column if not exists exported_at timestamptz;

-- Reviews, thank-yous, optional recaps (see migration_13)
alter table agent_profile add column if not exists google_review_url text;
alter table accounts add column if not exists thankyou_cadence text not null default 'off';
alter table partners add column if not exists monthly_summary boolean not null default true;

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
