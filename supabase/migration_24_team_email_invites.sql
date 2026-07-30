-- Migration 24: invite existing agents to an agency team
-- team_invites rows with invited_email set are directed invites to an existing
-- account (accepted from their profile page); rows with invited_email null
-- remain the generic signup invite link, as before.
alter table team_invites add column if not exists invited_email text;
create index if not exists idx_team_invites_email on team_invites(invited_email);
