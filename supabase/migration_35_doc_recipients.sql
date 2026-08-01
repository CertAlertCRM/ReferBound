-- Migration 35: document recipients
--
-- At a partner where the relationship is working, the loan officer decides once
-- and then disappears — the processor is the one who actually needs the EOI in
-- the file. Flagging a contact as a document recipient puts them on the
-- docs-ready email automatically, so the LO never has to act as courier and
-- nobody has to come to the portal to pick a file up.

alter table partner_contacts
  add column if not exists doc_recipient boolean not null default false;

create index if not exists idx_partner_contacts_doc_recipient
  on partner_contacts(partner_id)
  where doc_recipient;
