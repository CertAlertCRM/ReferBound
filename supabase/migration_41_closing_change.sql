-- Migration 41: closing dates move
--
-- A closing date slipping isn't a mistake, it's news — and it was the one piece
-- of news nobody in this product could deliver. The processor knows on Tuesday.
-- The agent found out when they opened the file, or when the date came and went.
--
-- Which meant Closing Week, whose entire job is telling an agent what's at risk
-- in the next seven days, was only ever as current as the last time somebody
-- happened to mention a date change. A board that can quietly go stale is worse
-- than no board, because the agent trusts it.

alter table referrals add column if not exists closing_date_changed_at timestamptz;
-- What it was before, so the agent sees the move rather than just a new date.
alter table referrals add column if not exists closing_date_was date;

create index if not exists idx_referrals_date_changed on referrals(account_id, closing_date_changed_at desc)
  where closing_date_changed_at is not null;
