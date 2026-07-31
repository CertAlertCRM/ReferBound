-- Migration 27: personalized notification voice
-- voice_notes: AI's short description of how this agent writes (editable).
-- notify_templates: approved per-agent wording for partner notifications
-- (email_quoted, email_docs, sms_quoted, sms_docs) with {{placeholders}}.
-- Null = stock ReferBound wording.
alter table agent_profile add column if not exists voice_notes text;
alter table agent_profile add column if not exists notify_templates jsonb;
