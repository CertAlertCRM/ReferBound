-- Migration 34: signup channel attribution
-- Where an account actually came from: 'direct', 'agent' (another agent's
-- referral link), 'lender' (a loan officer or processor invited them from
-- their referral board), 'partner' (invited off a portal). Without this, the
-- lender channel — the one thing that decides whether this market widens — is
-- invisible in the numbers.
alter table accounts add column if not exists signup_source text;
create index if not exists idx_accounts_signup_source on accounts(signup_source);
