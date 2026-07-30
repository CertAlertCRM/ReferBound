-- Migration 22: per-contact notification channel (email / sms / both)
-- Lets the agent choose how each partner contact hears about their leads.
-- Default 'both' preserves existing behavior: deal emails always, plus texts
-- when the contact has a phone and SMS consent.
alter table partner_contacts add column if not exists notify_channel text not null default 'both';
