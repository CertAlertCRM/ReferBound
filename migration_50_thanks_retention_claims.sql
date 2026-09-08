-- Migration 50 — the rest of what happens after a lead is written.
--
-- Three gaps, all on the same side of the bind:
--
--   thanked_at        Nobody ever told the person who sent the referral what
--                     happened to it. A referral product that only asks and
--                     never thanks produces single referrals instead of the
--                     habit, because being thanked properly is the strongest
--                     predictor of a second one.
--
--   lapsed_at         The ledger treated a written policy as permanent. A
--                     data-lead client is the most cancel-prone thing in a
--                     book, and cost per policy that ignores that is a number
--                     an owner will stop believing.
--
--   claim_*           A claim handled well is when people actually tell their
--                     friends about their agent. Nothing knew one happened.
--
-- Timestamps rather than booleans throughout, same as asked_at: "when" is the
-- useful question and it costs nothing to keep.
--
-- No foreign keys. Idempotent.

-- Who sent this client has been thanked for sending them. Stamped on the
-- referral that was PRODUCED, not on the source, because one source can send
-- several and each of them deserves its own thank-you.
alter table referrals add column if not exists thanked_at timestamptz;

-- No longer on the books. Set by the agent; nothing here reads carrier data.
alter table referrals add column if not exists lapsed_at timestamptz;

-- A claim, and a claim that went well. The second one is the referral trigger.
alter table referrals add column if not exists claim_opened_at timestamptz;
alter table referrals add column if not exists claim_went_well_at timestamptz;

-- The thank-you queue: business produced by a referral, nobody thanked yet.
create index if not exists idx_referrals_unthanked
  on referrals(account_id, status)
  where thanked_at is null;
