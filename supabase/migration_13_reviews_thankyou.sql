-- ── Migration 13: Google reviews, partner thank-yous, optional recaps ────────
-- 1) agent_profile.google_review_url — the agent's own Google review link
--    (Google Business Profile → "Ask for reviews"). Used for one-tap review
--    request emails to clients after a deal is bound.
-- 2) accounts.thankyou_cadence — 'off' | 'monthly' | 'quarterly'. When on, the
--    monthly cron sends each active partner a short, metric-free thank-you
--    note from the agent.
-- 3) partners.monthly_summary — per-partner toggle for the monthly recap
--    email; some partners don't want the numbers, just the service.
-- Run in Supabase SQL Editor. Safe to run more than once.

alter table agent_profile add column if not exists google_review_url text;
alter table accounts add column if not exists thankyou_cadence text not null default 'off';
alter table partners add column if not exists monthly_summary boolean not null default true;
