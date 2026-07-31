-- Migration 31: E&O prevention suite
-- partners.requirements   — what THIS lender requires, entered once and then
--                           checked against every EOI forever: exact mortgagee
--                           clause, deductible caps, flood rule, min liability.
-- referrals.coverage_notes — timestamped record of coverage recommended and
--                           accepted or declined. The thing an E&O carrier
--                           asks for and almost no agent keeps.
-- referrals.renewal_notified_at — dedupe for the expiring-policy watch.
-- agent_profile.renewal_watch   — opt out if you don't service renewals here.
alter table partners add column if not exists requirements jsonb;
alter table referrals add column if not exists coverage_notes jsonb;
alter table referrals add column if not exists renewal_notified_at timestamptz;
alter table agent_profile add column if not exists renewal_watch boolean not null default true;
