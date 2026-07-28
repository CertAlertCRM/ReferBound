-- ── Migration 06: partner logos ──────────────────────────────────────────────
-- Run once in the Supabase SQL Editor.

alter table partners add column if not exists logo_path text;
