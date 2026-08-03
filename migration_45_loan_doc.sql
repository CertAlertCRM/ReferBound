-- Migration 45 — retire the "1003" form number from stored data.
--
-- The document kind was named after the industry form number. That name leaked
-- into API responses and anywhere a kind was rendered raw, which put a very
-- specific "this product handles loan applications" signal in front of anyone
-- looking. The document is the same; the label is now plain.
--
-- Idempotent: safe to run more than once, and a no-op once no rows remain.

update documents
   set kind = 'loan_doc'
 where kind = 'loan_1003';

-- Inbound attachment records store the guessed kind as JSON.
update inbound_emails
   set attachments = replace(attachments::text, '"loan_1003"', '"loan_doc"')::jsonb
 where attachments::text like '%loan_1003%';
