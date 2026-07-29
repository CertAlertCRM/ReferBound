-- ── Migration 18: thank-you cadence per PARTNER (was per account) ────────────
-- Appreciation is a relationship-level setting: monthly for your top lender,
-- off for the CPA who sent one lead. Existing account-level cadence is copied
-- to that account's partners so nobody's setting silently disappears.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table partners add column if not exists thankyou_cadence text not null default 'off';

update partners
  set thankyou_cadence = a.thankyou_cadence
  from accounts a
  where partners.account_id = a.id
    and a.thankyou_cadence <> 'off'
    and partners.thankyou_cadence = 'off';
