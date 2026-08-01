-- Migration 43: attachments on forwarded referrals
--
-- A loan officer's introduction is very often three words and a PDF. Reading
-- only the message body meant those arrived with nothing extracted, failed the
-- confidence check, and sat in a review queue looking broken — while the
-- coborrower, property address, closing date, loan number, and investor sat
-- unread one level down in the attachment.
--
-- Files are stored before we know whether the email becomes a referral,
-- because a held email gets reviewed later and its paperwork has to survive
-- that wait. Accepting from the queue then attaches them to the new referral.
--
-- Note on retention: attachments land as normal `documents` rows once a
-- referral exists, with the kind inferred from the filename. A loan
-- application arriving by email is therefore treated exactly like one uploaded
-- by hand — same sensitivity, same purge schedule.

alter table inbound_emails add column if not exists attachments jsonb;
