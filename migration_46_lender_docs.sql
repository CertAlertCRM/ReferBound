-- Migration 46 — remember when the mortgage team was sent the documents.
--
-- Realtors refer by phone, so the loan officer's details only ever come from
-- asking the realtor. The reason to ask is that it lets the agent get the
-- evidence of insurance to the mortgage team before anybody chases it — and
-- the deal page needs to know whether that's already happened so it stops
-- offering, and so the later introduction can honestly say it was done.

alter table referrals add column if not exists lender_docs_sent_at timestamptz;
