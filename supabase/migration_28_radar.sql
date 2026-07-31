-- Migration 28: Referral Radar — partner prospects & pipeline
-- Three sources feed one table:
--   source='radar'   — a lender on the agent's documents with no portal yet
--                      (they already work together; it's just not in the app)
--   source='contact' — an individual LO at a company that IS a partner but who
--                      isn't in that partner's team contacts, so their leads
--                      go unattributed and they get no notifications
--   source='manual'  — prospects the agent adds while developing new partners
-- Converting a prospect into a live partner stamps converted_partner_id.
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
