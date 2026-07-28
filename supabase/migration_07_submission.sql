-- ── Migration 07: richer partner submissions + partner document uploads ──────
-- Run once in the Supabase SQL Editor.

alter table referrals add column if not exists coborrower_name text;
alter table referrals add column if not exists property_address text;
alter table referrals add column if not exists client_dob date;

-- Who uploaded each document: 'agent' | 'partner'
alter table documents add column if not exists uploaded_by text not null default 'agent';
