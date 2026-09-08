-- Migration 51 — what the email is about, and who it concerns.
--
-- Phase one of turning the forwarding address from "log this new referral"
-- into "tell me what happened to a client I already have."
--
-- This migration and the code that fills it change NO behaviour. Intent and
-- the matched client are recorded and nothing acts on them. That is the point:
-- a week of real mail tells us how well classification and matching actually
-- work before any UI is built on top of them, and before anything is allowed
-- to mark a client lapsed.
--
-- No foreign key on target_referral_id on purpose. inbound_emails already
-- embeds partners, and migration 47 was an expensive lesson in what a second
-- relationship between two tables does to every PostgREST query between them.
-- The column is a plain uuid; the join happens in code.
--
-- Idempotent.

-- new_referral | policy_issued | cancellation | claim | none
alter table inbound_emails add column if not exists intent text;

-- The existing client this email appears to be about. Distinct from
-- referral_id, which means "the referral this email created".
alter table inbound_emails add column if not exists target_referral_id uuid;

-- high | medium | ambiguous | none — how sure the matcher is that
-- target_referral_id is the right person. Nothing post-sale will ever act on
-- anything below "high", and cancellation and claims will not act on their own
-- at any confidence.
alter table inbound_emails add column if not exists match_confidence text;

create index if not exists idx_inbound_intent
  on inbound_emails(account_id, intent)
  where status = 'pending';
