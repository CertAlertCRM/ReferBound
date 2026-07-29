-- ── Migration 14: export tracking ────────────────────────────────────────────
-- Stamps referrals when they're included in a CSV export so "Export new"
-- only pulls leads that have never been exported — no double-keying into the
-- agent's CRM/AMS.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table referrals add column if not exists exported_at timestamptz;
