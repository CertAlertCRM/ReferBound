-- Migration 55 — the universal share link, and language.
--
-- Two features from one pilot agent.
--
-- THE SHARE LINK. Until now a partner existed because an agent typed them in.
-- A link posted to a public Instagram story inverts that: strangers arrive and
-- ask to be let in, and the agent decides.
--
-- Requests live in their OWN table, not as pending rows in `partners`, and
-- that is the important decision here. The first version of this migration
-- added request_* columns to partners and marked them pending — which quietly
-- created a security hole, because partners.token has a table default. Every
-- pending row would have arrived holding a working portal token, and the
-- sixteen places that resolve a partner by token would all have served it. A
-- request is not a partner. Modelling it as one meant every one of those
-- sixteen lookups needed a guard it didn't have, forever.
--
-- So: nothing is created in `partners` until approval. No token exists, no
-- plan seat is counted, no existing query needs to learn a new state, and
-- declining a request is a single delete that cannot orphan anything.
--
-- LANGUAGE. partners.locale is the partner's own choice, remembered so that a
-- bilingual agent's Spanish-speaking realtor doesn't re-pick it every visit.
-- Null means English. Set either by the agent when they send the invite or by
-- the partner from the toggle in their portal — the partner's choice wins,
-- because it is their screen.
--
-- Idempotent.

-- ── The agent's public join slug ────────────────────────────────────────────
-- Nullable: an agent has no join link until they ask for one, so the public
-- surface is closed by default rather than open by default.
alter table accounts add column if not exists partner_join_code text;

-- Rotating a code must never collide with somebody else's. Partial, so the
-- many accounts with no code don't all conflict on null.
create unique index if not exists idx_accounts_partner_join_code
  on accounts(partner_join_code)
  where partner_join_code is not null;

-- ── Requests ────────────────────────────────────────────────────────────────
create table if not exists partner_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  -- The person. Separate from the company, because a loan officer and their
  -- brokerage are not the same thing and the agent needs both.
  contact_name text not null,
  company text,
  email text not null,
  phone text,
  partner_type text not null default 'other',
  -- What they typed about themselves: "I'm the LO on the Weaver file", "met
  -- you at the chamber lunch". The agent's only evidence that this is a real
  -- person, so it is shown verbatim on the approval row.
  note text,
  locale text,
  created_at timestamptz not null default now(),
  -- Timestamps, not a status enum — same convention as the rest of the
  -- schema. Both null means waiting.
  approved_at timestamptz,
  declined_at timestamptz,
  -- The partner this became. Plain uuid, no foreign key: partners is already
  -- embedded from several directions and migration 47 was an expensive lesson
  -- in what a second relationship between two tables does to every PostgREST
  -- query between them.
  partner_id uuid
);

create index if not exists idx_partner_requests_pending
  on partner_requests(account_id, created_at)
  where approved_at is null and declined_at is null;

-- One request per email per agent. Stops a double-tap on a flaky phone
-- connection from putting the same loan officer in the queue twice.
create unique index if not exists idx_partner_requests_email
  on partner_requests(account_id, lower(email))
  where approved_at is null and declined_at is null;

alter table partner_requests enable row level security;
grant all on partner_requests to service_role;

-- ── Language ────────────────────────────────────────────────────────────────
-- en | es. Null = en.
alter table partners add column if not exists locale text;
