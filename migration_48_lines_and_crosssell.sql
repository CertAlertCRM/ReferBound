-- Migration 48 — lines written, and the round-out.
--
-- A paid data lead almost always arrives as auto only. The household is worth
-- two or three times more once the home, the umbrella or the life policy is on
-- it, and unlike a referral it needs nothing from the client except a yes to a
-- quote. This records what was actually sold and when to go back for the rest.
--
-- NOTE, learned the hard way in migration 47: no foreign keys here on purpose.
-- Adding a second relationship between two tables that already embed each
-- other breaks every PostgREST query between them. These are plain columns.
--
-- Idempotent. Safe to run more than once.

-- Structured lines written, alongside the existing free-text policy_lines
-- (which stays for backward compatibility and for what the extractor pulls).
-- Free text can't be counted, and a monoline count is the whole point.
alter table referrals add column if not exists lines text[] not null default '{}';

-- The round-out was pitched. A timestamp, not a boolean — same as the ask.
-- Never implies anything was sent; most of these happen out loud.
alter table referrals add column if not exists xsell_asked_at timestamptz;

-- When to come back. A monoline auto client usually has a home policy
-- somewhere else with a renewal date, and that date is what turns a dead list
-- into a queue that surfaces the client at the moment they can actually move.
alter table referrals add column if not exists xsell_target_date date;

-- The round-out queue: written business with no round-out logged.
create index if not exists idx_referrals_xsell
  on referrals(account_id, status)
  where xsell_asked_at is null;

-- Existing rows read as no lines recorded, which is honest — nothing is
-- assumed about business written before this existed.
