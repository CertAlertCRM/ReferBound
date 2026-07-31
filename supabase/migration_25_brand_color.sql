-- Migration 25: per-agent portal theme
-- Curated palette key (see lib/themes.ts) applied to the agent's app and all
-- their partner portals. 'default' = ReferBound Blue.
alter table agent_profile add column if not exists brand_color text not null default 'default';
