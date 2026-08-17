// A lender's insurance requirements — one shape, one owner.
//
// These belong to the LENDER, not the agent. The agent guessing at them from
// memory is how a file comes back: the caps change, the investor changes, the
// flood rule changes, and the only person who reliably knows is the processor
// who enforces it. So the partner maintains this from their own portal and the
// agent's copy becomes a fallback for partners who never open it.
//
// This module exists because there used to be two incompatible shapes. The
// agent's form wrote `flood_required` as a BOOLEAN; the AI parser wrote the
// same key as a STRING describing when flood applies. Whichever wrote last won,
// and the pre-delivery check read whatever it found. Everything now goes
// through normalize() before it touches the database.
//
// Provenance rides inside the JSON rather than in new columns — `requirements`
// is already jsonb, so this needs no migration.

export type Requirements = {
  mortgagee_clause: string | null;
  min_liability: string | null;
  max_wind_deductible: string | null;
  max_aop_deductible: string | null;
  replacement_cost_required: boolean | null;
  // Free text, never a boolean: "required in Zone A or V" and "always required"
  // are different rules and a checkbox can't tell them apart.
  flood_required: string | null;
  escrow_notes: string | null;
  conditions: string[];
  notes: string | null;
  summary: string | null;
  _source: "partner" | "agent" | null;
  _updated_at: string | null;
  _updated_by: string | null;
};

export const EMPTY_REQUIREMENTS: Requirements = {
  mortgagee_clause: null,
  min_liability: null,
  max_wind_deductible: null,
  max_aop_deductible: null,
  replacement_cost_required: null,
  flood_required: null,
  escrow_notes: null,
  conditions: [],
  notes: null,
  summary: null,
  _source: null,
  _updated_at: null,
  _updated_by: null,
};

function str(v: unknown, max = 500): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

// The migration that isn't a migration: an old boolean becomes the sentence it
// always meant, so nothing already on file is lost or misread.
function floodValue(v: unknown): string | null {
  if (v === true) return "Required when the property is in a flood zone";
  if (v === false || v == null) return null;
  return str(v, 300);
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase();
  if (["yes", "true", "required", "y"].includes(s)) return true;
  if (["no", "false", "not required", "n"].includes(s)) return false;
  return null;
}

export function normalizeRequirements(
  input: any,
  opts?: { source?: "partner" | "agent"; by?: string | null; at?: string }
): Requirements | null {
  const r = input ?? {};
  const out: Requirements = {
    mortgagee_clause: str(r.mortgagee_clause, 500),
    min_liability: str(r.min_liability, 120),
    max_wind_deductible: str(r.max_wind_deductible, 120),
    max_aop_deductible: str(r.max_aop_deductible, 120),
    replacement_cost_required: boolOrNull(r.replacement_cost_required),
    flood_required: floodValue(r.flood_required),
    escrow_notes: str(r.escrow_notes, 400),
    conditions: Array.isArray(r.conditions)
      ? r.conditions.map((c: unknown) => str(c, 240)).filter(Boolean).slice(0, 12) as string[]
      : [],
    notes: str(r.notes, 800),
    summary: str(r.summary, 400),
    _source: opts?.source ?? (r._source === "partner" || r._source === "agent" ? r._source : null),
    _updated_at: opts?.at ?? (opts?.source ? new Date().toISOString() : str(r._updated_at, 40)),
    _updated_by: opts?.source ? str(opts.by, 120) : str(r._updated_by, 120),
  };
  return isEmpty(out) ? null : out;
}

export function isEmpty(r: Partial<Requirements> | null | undefined): boolean {
  if (!r) return true;
  return (
    !r.mortgagee_clause &&
    !r.min_liability &&
    !r.max_wind_deductible &&
    !r.max_aop_deductible &&
    r.replacement_cost_required == null &&
    !r.flood_required &&
    !r.escrow_notes &&
    !(r.conditions && r.conditions.length) &&
    !r.notes
  );
}

// Human-readable lines, used both in the UI and in the pre-delivery prompt.
// The prompt gets the same words the partner typed — no restating, because a
// paraphrased requirement is a changed requirement.
export function requirementLines(r: Partial<Requirements> | null | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.mortgagee_clause) out.push(`Mortgagee clause: ${r.mortgagee_clause}`);
  if (r.min_liability) out.push(`Minimum liability: ${r.min_liability}`);
  if (r.max_wind_deductible) out.push(`Maximum wind/hail deductible: ${r.max_wind_deductible}`);
  if (r.max_aop_deductible) out.push(`Maximum all-other-perils deductible: ${r.max_aop_deductible}`);
  if (r.replacement_cost_required === true) out.push("Replacement cost coverage required");
  if (r.flood_required) out.push(`Flood: ${r.flood_required}`);
  if (r.escrow_notes) out.push(`Escrow: ${r.escrow_notes}`);
  for (const c of r.conditions ?? []) out.push(`Condition: ${c}`);
  if (r.notes) out.push(`Also: ${r.notes}`);
  return out;
}

export function sourceLabel(r: Partial<Requirements> | null | undefined): string | null {
  if (!r?._source) return null;
  const when = r._updated_at
    ? new Date(r._updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const who = r._source === "partner" ? (r._updated_by || "their team") : "you";
  return when ? `Set by ${who} on ${when}` : `Set by ${who}`;
}
