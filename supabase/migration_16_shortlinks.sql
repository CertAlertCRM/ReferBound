-- ── Migration 16: short magic links ──────────────────────────────────────────
-- Partners get a compact link (referbound.com/p/<12 chars>) instead of the
-- 64-character token URL — cleaner in a text message, less spam-looking.
-- Old long links keep working forever; the portal accepts either.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table partners add column if not exists short_code text unique
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

-- Backfill existing partners.
update partners
  set short_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where short_code is null;
