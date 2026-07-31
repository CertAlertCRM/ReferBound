-- Migration 30: pre-delivery document cross-check
-- Stores the last verification of the agent's EOI/RCE against the documents
-- the lender supplied (loan application, HOI request, mortgagee clause), so
-- mismatches surface BEFORE the "documents ready" email goes out.
alter table referrals add column if not exists doc_check jsonb;
