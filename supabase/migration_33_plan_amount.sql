-- Migration 33: record what an account actually pays
-- Plans can be discounted (a friend on Agency at $50, a founding annual at
-- $199), so MRR should come from the real charge rather than the list price.
alter table accounts add column if not exists plan_amount_cents integer;
