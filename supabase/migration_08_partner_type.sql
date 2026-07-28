-- ── Migration 08: partner types ──────────────────────────────────────────────
-- Run once in the Supabase SQL Editor.
-- Existing partners (Cowart) default to 'lender'.

alter table partners add column if not exists partner_type text not null default 'lender';
