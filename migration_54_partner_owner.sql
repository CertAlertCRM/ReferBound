-- Migration 54 — whose relationship is this.
--
-- Written for one reason right now: when an agent joins an agency, their
-- partners move into the agency's book, and until this column existed there
-- was nothing to record that they were that agent's. Chalyn joined and her
-- fourteen-ish partners became indistinguishable from David's the moment the
-- account_id changed. That fact is only knowable at the instant of the move;
-- afterwards no query can recover it.
--
-- Nothing reads this yet. The shared-directory-with-an-assigned-owner model —
-- everyone sees the partner and who works them, only the owner edits or
-- messages them, house accounts stay unassigned — is a separate piece of work.
-- This column exists so that when it is built, the history is there instead of
-- starting from nothing.
--
-- Null means "house": nobody's in particular, which is the correct default for
-- every partner already in an owner's book.
--
-- Plain uuid, no foreign key to accounts. Same reason as 52 and 53, same
-- lesson from 47.
--
-- Idempotent.

alter table partners add column if not exists owner_producer_id uuid;

create index if not exists idx_partners_owner_producer
  on partners(account_id, owner_producer_id);
