-- Migration 53 — handed to someone.
--
-- producer_id already says whose lead it is. These two say it was GIVEN to
-- them, and by whom. That distinction is the whole feature: a lead a producer
-- logged themselves needs no announcement, and a lead the owner caught at a
-- soccer game and handed off is a work order that has to be visibly waiting.
--
-- Without assigned_at there is no way to render "new to you" — the row's
-- created_at belongs to the moment the owner typed it, which may be days
-- before it reached the person meant to work it.
--
-- assigned_at clears the first time the assignee opens the deal. It is an
-- inbox marker, not history; the permanent record is the activity log entry,
-- which is never rewritten.
--
-- Plain uuid on assigned_by, no foreign key to accounts. Same reason as
-- migration 52 and for the same lesson learned in 47: a second relationship
-- between two tables that already embed each other takes down every PostgREST
-- query between them. The join happens in code.
--
-- Idempotent.

alter table referrals add column if not exists assigned_at timestamptz;
alter table referrals add column if not exists assigned_by uuid;

-- "What's been handed to me and not yet opened" — the producer's first query
-- every morning, and the badge on their own tab.
create index if not exists idx_referrals_assigned
  on referrals(account_id, producer_id)
  where assigned_at is not null;
