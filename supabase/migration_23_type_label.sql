-- Migration 23: custom partner-type label
-- When an agent picks "Other" as the partner type they can name it themselves
-- ("Networking group", "Title company", "Attorney"). Display-only: submission
-- flow logic still keys off partner_type.
alter table partners add column if not exists type_label text;
