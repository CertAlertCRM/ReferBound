-- Migration 37: the client track
--
-- Every deal has two audiences and the product only ever served one. The agent
-- writes three emails to the CLIENT on every file — here's your quote (with the
-- loan officer copied), a check-in while it sits, and the welcome with their
-- proof of insurance once it's bound. All three were typed by hand, every time,
-- while ReferBound watched.
--
-- The quote email is the important one: it's the same message that tells the
-- lender the quote is out, which is why the loan officer is copied on it rather
-- than sent a separate notice.
--
-- Nothing here fires on its own. Every client-facing message is one click by
-- the agent — a mistake to a partner is awkward, a mistake to a customer is
-- the agent's reputation.

alter table referrals add column if not exists quote_sent_at timestamptz;
alter table referrals add column if not exists welcome_sent_at timestamptz;
alter table referrals add column if not exists client_nudged_at timestamptz;

create index if not exists idx_referrals_quote_sent on referrals(account_id, quote_sent_at)
  where quote_sent_at is not null;
