-- Migration 47 — sources, producers, and the ask.
--
-- The insight this encodes: a referral already belongs to a partner, so a
-- partner row IS the source. A lead vendor and a client who refers are both
-- just partners with a different kind. Nothing restructures; three columns
-- carry the whole model.
--
-- Idempotent. Safe to run more than once.

-- ── Sources ────────────────────────────────────────────────────────────────
-- partner : lender, realtor, CPA — the relationship, gets a portal
-- paid    : a lead vendor. Has a spend, never gets a portal
-- client  : someone you wrote who then sent you someone else
alter table partners add column if not exists source_kind text not null default 'partner';

-- What this source costs per month. Owner-entered, one number, never per lead.
alter table partners add column if not exists monthly_spend_cents bigint;

-- When a client is promoted to a source, remember the policy that made them one.
alter table partners add column if not exists from_referral_id uuid references referrals(id) on delete set null;

create index if not exists idx_partners_source_kind on partners(account_id, source_kind);

-- ── The chain ──────────────────────────────────────────────────────────────
-- The policy that produced this one. A paid lead that closes, refers, and
-- refers again is a chain the agent can see.
alter table referrals add column if not exists parent_referral_id uuid references referrals(id) on delete set null;

-- Who wrote it. Null on single-agent accounts; set for team members so an
-- agency owner can see per-producer numbers.
alter table referrals add column if not exists producer_id uuid references accounts(id) on delete set null;

-- The reps. Timestamps, not booleans — "when" is the useful question.
alter table referrals add column if not exists asked_at timestamptz;
alter table referrals add column if not exists review_asked_at timestamptz;

create index if not exists idx_referrals_parent on referrals(parent_referral_id);
create index if not exists idx_referrals_producer on referrals(account_id, producer_id);
-- The unasked queue: bound work with no ask logged.
create index if not exists idx_referrals_unasked on referrals(account_id, status) where asked_at is null;

-- Existing partners keep working untouched: every row already reads as
-- source_kind 'partner', which is exactly what they are.
