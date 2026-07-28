-- ── Migration 09: partner intro-email templates ──────────────────────────────
-- Run once in the Supabase SQL Editor.

alter table partners add column if not exists intro_template text;
