-- Migration 21: annual billing (Founder Annual, $199/yr)
-- Lets the webhook, billing page, and founder dashboard tell a $199/yr
-- founding member apart from a $20/mo Pro. Plan stays 'pro' for both —
-- this column only records how it bills.
alter table accounts add column if not exists billing_interval text not null default 'monthly';
