-- Migration 44: the coborrower's date of birth
--
-- Quoting a couple needs both dates of birth, and the loan application has
-- both. There was a column for the borrower's and nowhere to put the
-- coborrower's, so half of what the document told us was being dropped on the
-- floor and re-keyed by hand later.
--
-- Worth stating why this is the right thing to keep when the file itself
-- isn't: a date of birth is required to rate a policy. An SSN, an income
-- figure, and an asset balance are not. That line is the whole retention
-- policy — take what the quote needs, discard the rest with the document.

alter table referrals add column if not exists coborrower_dob date;
