-- Migration 29: source-file retention + backfill tracking
-- doc_retention_days: per-agent purge window for sensitive source documents
--   (loan applications). 0 = keep indefinitely. Extracted details always stay
--   on the referral — only the original file is removed.
-- documents.purged_at: stamped when the source file is deleted from storage,
--   so the UI can honestly say "details kept, source file removed".
-- referrals.backfilled: marks leads entered in bulk to build an agent's book,
--   so they're excluded from speed metrics that would otherwise be meaningless.
alter table agent_profile add column if not exists doc_retention_days integer not null default 0;
alter table documents add column if not exists purged_at timestamptz;
alter table referrals add column if not exists backfilled boolean not null default false;
