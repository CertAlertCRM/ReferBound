-- Migration 38: the cold start
--
-- The product organizes referrals from lending partners. An agent who has no
-- lending partners yet has nothing to organize, so they sign up, see an empty
-- board, and never come back. Two bridges:
--
-- 1. A demo portal. The agent's hardest conversation is walking into a lender's
--    office with nothing to offer. This gives them something to hand over: a
--    live, branded, clearly-labelled sample of exactly what that lender would
--    get. The pitch stops being a description and becomes a link.
--
-- 2. Partner sharing. When one agent already works with a lender, another agent
--    shouldn't have to rebuild the contacts, the mortgagee clause, and the
--    requirements from scratch. This shares the SETUP, never the relationship —
--    the loan officer still has to agree to send them business.

alter table accounts add column if not exists demo_token text;
create unique index if not exists idx_accounts_demo_token on accounts(demo_token)
  where demo_token is not null;

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

-- Where a partner came from, so a copied setup is visible as one.
alter table partners add column if not exists shared_from uuid references accounts(id) on delete set null;
