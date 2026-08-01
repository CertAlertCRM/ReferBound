-- Migration 42: forwarded referrals
--
-- The product's main intake path is an agent forwarding the intro email their
-- loan officer sent them. On a forward the envelope sender is the AGENT, so
-- matching on it finds nobody and the lead that should log itself lands in a
-- review queue instead — the opposite of the point.
--
-- The real sender is in the header block the mail client writes into the body.
-- This records who that turned out to be, so the queue can show "forwarded
-- from Jamie" rather than the agent's own address, and so an acknowledgment
-- goes back to the loan officer rather than to the agent who passed it along.

alter table inbound_emails add column if not exists forwarded_from text;
