-- ── Migration 11: integrations (webhook / Zapier) ────────────────────────────
-- Adds a per-account outbound webhook URL. When set, ReferBound POSTs a JSON
-- payload on referral.created and referral.status_changed — pair it with
-- "Webhooks by Zapier" (or Make) to push leads into AgencyZoom, Agency MVP,
-- or any other CRM/AMS without rekeying.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table accounts add column if not exists webhook_url text;
