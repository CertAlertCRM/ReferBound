-- ── Migration 17: partner contacts (multiple LOs / processors per partner) ───
-- A partner team like Cowart Home Loans has several loan officers and
-- processors. Each referral can now carry WHO sent it, and referral-specific
-- correspondence (status updates, doc-ready, replies, at-risk alerts) goes to
-- that person instead of blasting the whole team. Team-wide emails (monthly
-- recap, closings digest, thank-yous) still use the partner's main list.
-- Run in Supabase SQL Editor. Safe to run more than once.

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
grant all on partner_contacts to service_role;

alter table referrals add column if not exists contact_id uuid references partner_contacts(id) on delete set null;
