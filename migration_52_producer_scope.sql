-- Migration 52 — whose lead is this.
--
-- producer_id already exists on referrals; nothing here adds it. What was
-- missing is an index, because every list, stat tile, queue and export is
-- about to filter on it, and on an agency book that is the hottest predicate
-- in the product.
--
-- No foreign key to accounts(id), deliberately and for the third time.
-- Migration 47 added a second relationship between partners and referrals and
-- broke every PostgREST embed in the app for a day. producer_id stays a plain
-- uuid; the join happens in code, where it cannot take the whole book down.
--
-- Nothing is backfilled. There is no honest way to infer who logged a lead
-- from six months ago, and guessing would put a colleague's client under the
-- wrong producer's name — which is exactly the commission argument this
-- feature is meant to prevent. Unattributed rows stay with the owner and get
-- assigned by a human who was there.
--
-- Idempotent.

create index if not exists idx_referrals_producer
  on referrals(account_id, producer_id);

-- The queue, the asks and the stat tiles all filter by producer AND status.
create index if not exists idx_referrals_producer_status
  on referrals(account_id, producer_id, status);
