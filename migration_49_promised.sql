-- Migration 49 — the promise.
--
-- The highest-intent moment in the whole product has nowhere to live. A client
-- signs, and on the way out says "I'll tell my sister, her rate went up too."
-- That is a warm lead with a name attached and a half-life of about two days,
-- and today it evaporates: the producer marks the ask, gets a green check, and
-- three weeks later has no memory there was ever a sister.
--
-- One column, deliberately. Not a promises table — the MEASUREMENT already
-- works, because when the sister is logged with the client as her source,
-- parent_referral_id records that the ask converted. This is a reminder, not a
-- data structure, and building it as one would buy a lifecycle nobody needs.
--
-- No foreign keys. Idempotent.

alter table referrals add column if not exists promised_note text;
