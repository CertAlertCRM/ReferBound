-- Migration 26: optional speed scorecard on partner portals
-- New or busy agents can hide "avg to quote / avg to bound / ready by closing"
-- from every portal they share, until they have numbers worth showing.
alter table agent_profile add column if not exists show_scorecard boolean not null default true;
