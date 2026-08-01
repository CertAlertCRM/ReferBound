-- Migration 39: the realtor track
--
-- A realtor is not a smaller lender. They're a connector — on every purchase
-- they sit between a buyer, an insurance agent, and a loan officer, and they
-- are the only person in that triangle who knows all three. When a realtor
-- sends a referral, the agent doesn't just get a client. They get a live,
-- warm path to that client's loan officer, on a file where they are about to
-- demonstrate exactly the thing that loan officer cares about: the EOI showing
-- up correct and on time.
--
-- So the realtor flow carries one extra fact — who's handling the loan — and
-- turns it into the introduction the agent would otherwise never get.

-- Who's on the other side of this deal. Captured from the realtor at
-- submission, from the agent by hand, or off a loan application if one shows
-- up: { name, company, email, phone, source }
alter table referrals add column if not exists deal_lender jsonb;

-- Which partner surfaced this prospect, so Radar can say "three of these came
-- through the same realtor" instead of listing names with no story.
alter table partner_prospects add column if not exists via_partner_id uuid
  references partners(id) on delete set null;

-- Introductions the agent has already asked for or sent, so nothing is
-- suggested twice and nobody gets asked for the same favour a second time.
alter table referrals add column if not exists lender_intro_at timestamptz;
alter table referrals add column if not exists realtor_ask_at timestamptz;

create index if not exists idx_referrals_deal_lender on referrals(account_id)
  where deal_lender is not null;
