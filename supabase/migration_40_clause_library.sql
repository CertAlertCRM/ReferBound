-- Migration 40: the processor's clause library
--
-- A loan processor doesn't have "a mortgagee clause." They have a laminated
-- sheet, a spreadsheet tab, or a wiki page with fifteen of them — one per
-- investor, servicer, or loan product — and knowing which one belongs on which
-- file is a real part of their job. Storing one clause per partner was a model
-- of a shop that doesn't exist.
--
-- Same for requirements: minimum liability, maximum wind or hurricane
-- deductible, whether flood is required, how replacement cost has to be
-- evidenced. These vary by investor and by loan type, and they live in a PDF
-- somebody emails around.
--
-- The rule for both: the processor uploads what they already have, and the
-- product does the parsing, the matching, and the remembering. If using this
-- costs a processor more keystrokes than their current sheet, they will keep
-- the sheet.

create table if not exists mortgagee_clauses (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  -- What the processor calls it: "Fannie / ServiceMac", "FHA — Freedom", "Portfolio"
  label text not null,
  clause text not null,
  -- Signals the matcher uses: investor, servicer, loan products it applies to
  investor text,
  loan_types text[] not null default '{}',
  notes text,
  is_default boolean not null default false,
  -- Where it came from, so a re-import can replace a batch cleanly
  source text not null default 'manual',   -- manual | import
  created_at timestamptz not null default now()
);

create index if not exists idx_clauses_partner on mortgagee_clauses(partner_id);
create unique index if not exists idx_clauses_one_default on mortgagee_clauses(partner_id)
  where is_default;
alter table mortgagee_clauses enable row level security;

-- Which clause belongs on THIS file. Set by the processor, or matched by the
-- AI off the loan application, with the partner's default as the fallback.
alter table referrals add column if not exists mortgagee_clause_id uuid
  references mortgagee_clauses(id) on delete set null;
-- 'processor' | 'ai' | 'agent' — shown so nobody trusts a guess as a decision
alter table referrals add column if not exists clause_source text;

-- Partner-level files: the master clause list, requirement sheets, guidelines.
-- Not tied to any one referral, unlike `documents`.
create table if not exists partner_files (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  kind text not null default 'requirements',   -- requirements | clause_list | other
  file_name text not null,
  storage_path text,
  -- What the AI pulled out of it, kept alongside the source
  parsed jsonb,
  uploaded_by text not null default 'partner',
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_files on partner_files(partner_id, created_at desc);
alter table partner_files enable row level security;
