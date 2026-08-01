-- Migration 36: email intake
--
-- The product's front door was a portal the loan officer had to visit. In the
-- actual workflow most referrals arrive as an email introducing a client —
-- from someone who is not thinking about our portal and never will be. This
-- gives every agent a forwarding address: forward the LO's intro email, the
-- sender is matched to a partner, the client details are extracted, the lead
-- is created, and the acknowledgment the agent would have typed goes back.
--
-- Anything from a sender we can't tie to a known partner is HELD for review
-- rather than auto-created — an open address that turns strangers into leads
-- is a spam funnel, and an auto-reply to a stranger is backscatter.

-- Per-agent forwarding address: <inbox_slug>@in.referbound.com
alter table accounts add column if not exists inbox_slug text;
create unique index if not exists idx_accounts_inbox_slug on accounts(inbox_slug)
  where inbox_slug is not null;

-- Intake behavior, per agent.
alter table agent_profile add column if not exists inbox_autocreate boolean not null default true;
alter table agent_profile add column if not exists inbox_autoack boolean not null default true;

create table if not exists inbound_emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,

  -- Provider identity, so a retried webhook doesn't create the lead twice.
  provider_id text,

  from_email text not null,
  from_name text,
  subject text,
  body text,
  received_at timestamptz not null default now(),

  -- Matching outcome
  partner_id uuid references partners(id) on delete set null,
  contact_id uuid references partner_contacts(id) on delete set null,
  match_kind text,                       -- contact | domain | none

  -- What Claude pulled out of the message, before anyone accepted it
  extracted jsonb,

  -- pending | created | ignored | failed
  status text not null default 'pending',
  referral_id uuid references referrals(id) on delete set null,
  acked_at timestamptz,
  error text,

  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_account on inbound_emails(account_id, created_at desc);
create index if not exists idx_inbound_pending on inbound_emails(account_id) where status = 'pending';
create unique index if not exists idx_inbound_provider on inbound_emails(provider_id)
  where provider_id is not null;

-- The app reaches Postgres only through the service-role key on the server,
-- which bypasses RLS. Enabling it with no policies closes the table to anon and
-- authenticated keys entirely — which matters more here than anywhere else in
-- the schema, because this table holds the full body of forwarded referral
-- emails: client names, phones, addresses, whatever the loan officer typed.
alter table inbound_emails enable row level security;

-- Referrals that arrived by forwarded email carry their own source, so intake
-- channel stays visible in stats and exports.
-- (referrals.source already exists; no schema change needed — value: 'email')
