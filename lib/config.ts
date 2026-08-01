// ── Branding & app configuration ─────────────────────────────────────────────
// Edit these values to customize what the agent and partners see.
// Keep carrier trademarks out of partner-facing branding.

export const APP_CONFIG = {
  // Shown in the partner portal header: "<agencyName> — Referral Portal"
  agencyName: process.env.NEXT_PUBLIC_AGENCY_NAME || "Your Agency",
  // The agent's display name, shown to partners
  agentName: process.env.NEXT_PUBLIC_AGENT_NAME || "Your Agent",
  // Product working title (footer "powered by")
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME || "ReferBound",
};

// Pipeline statuses, in order. "lost" is reachable from any status.
export const STATUSES = [
  "new",
  "quoting",
  "quoted",
  "application",
  "bound",
  "docs_delivered",
] as const;

export type Status = (typeof STATUSES)[number] | "lost";

export const STATUS_LABELS: Record<string, string> = {
  new: "New lead",
  quoting: "Working on quote",
  quoted: "Quoted",
  application: "Working with client",
  bound: "Bound ✔",
  docs_delivered: "EOI & docs delivered",
  lost: "Not written",
};

// Statuses that count as "insurance is done" for closing-risk purposes
export const SAFE_STATUSES = ["bound", "docs_delivered"];

// ── Two tracks ──────────────────────────────────────────────────────────────
//
// The lender relationship is what this product is built around, and it needs
// the whole pipeline: quote out, application, bound, documents delivered before
// closing. A realtor or a friend who sent you a buyer needs none of that. They
// want to know you got it, you're working it, and whether it closed. Forcing
// them through EOI and docs-delivered is asking them to care about paperwork
// that was never theirs.
//
// Both tracks write the same status values — a short track just stops at
// "bound" and relabels the steps in language that fits who's reading.

export const FULL_TRACK_TYPES = ["lender"];

export function isFullTrack(partnerType?: string | null): boolean {
  return FULL_TRACK_TYPES.includes(partnerType ?? "lender");
}

export const SIMPLE_STATUSES = ["new", "quoting", "bound"] as const;

export const SIMPLE_STATUS_LABELS: Record<string, string> = {
  new: "Got the referral",
  quoting: "Working on it",
  quoted: "Working on it",
  application: "Working on it",
  bound: "Covered ✔",
  docs_delivered: "Covered ✔",
  lost: "Not written",
};

export function statusesFor(partnerType?: string | null): readonly string[] {
  return isFullTrack(partnerType) ? STATUSES : SIMPLE_STATUSES;
}

export function statusLabel(status: string, partnerType?: string | null): string {
  const table = isFullTrack(partnerType) ? STATUS_LABELS : SIMPLE_STATUS_LABELS;
  return table[status] ?? STATUS_LABELS[status] ?? status;
}

// The next step on this partner's track. Returns null at the end of it, which
// is "docs delivered" for a lender and "covered" for everyone else.
export function nextStatusFor(status: string, partnerType?: string | null): string | null {
  const track = statusesFor(partnerType);
  const i = track.indexOf(status);
  // A deal already past the end of its track (its partner's type changed after
  // the fact) has nowhere to go — never offer to move it backwards.
  if (i === -1 || i === track.length - 1) return null;
  return track[i + 1];
}

// Document kinds. The first group is what the agent delivers; the second is
// what partners typically send with a referral.
export const DOC_KINDS: Record<string, string> = {
  quote: "Quote",
  eoi: "Evidence of Insurance (EOI)",
  rce: "Replacement Cost Estimator (RCE)",
  dec: "Declarations Page",
  loan_1003: "Loan application (1003)",
  hoi_request: "HOI request",
  mortgagee: "Mortgagee clause / lender info",
  other: "Other document",
};

// Partner-facing labels. Partners shouldn't need to know industry form
// numbers — "loan application" is the same document in plain language.
export const DOC_KINDS_PARTNER: Record<string, string> = {
  ...DOC_KINDS,
  loan_1003: "Loan application",
  hoi_request: "Insurance info sheet",
  mortgagee: "Mortgagee clause / lender info",
};

// Documents an ORIGINATING loan officer actually signs. Referral Radar only
// harvests contacts from these.
//
// The distinction matters more than it looks. An evidence of insurance, a dec
// page, and a replacement cost estimate all carry a lender-shaped name — the
// mortgagee — but that's the servicer holding the note (Mr. Cooper, ServiceMac,
// LoanCare, an ISAOA/ATIMA entity), not the person who originated the loan.
// Servicers never refer anybody. Mining those documents produced a prospect
// list of companies no agent could ever partner with.
export const ORIGINATOR_DOC_KINDS = ["loan_1003", "hoi_request", "other"];

// Kinds shown in the partner's upload picker
export const PARTNER_DOC_KINDS = ["loan_1003", "hoi_request", "mortgagee", "other"] as const;

// Document kinds that routinely carry more personal information than an agent
// needs to quote. The source file for these can be purged after extraction —
// the details pulled off it stay on the referral. See lib/retention.
export const SENSITIVE_DOC_KINDS = ["loan_1003"];

// Documents that are read and then thrown away, never written to storage.
//
// A loan application carries the borrower's SSN, income, and assets. None of it
// is needed to quote, and the safest copy of a document like that is the one
// that was never kept. What it told us — names, address, closing date, loan
// number — lands on the referral; the file itself does not survive the request
// that read it. The agent still has the original in the inbox it arrived in.
export const NEVER_STORE_KINDS = ["loan_1003"];

export function shouldPersistDoc(kind: string): boolean {
  return !NEVER_STORE_KINDS.includes(kind);
}

// Source-file retention choices (days; 0 = keep indefinitely).
export const RETENTION_CHOICES = [
  { days: 0, label: "Keep source files" },
  { days: 30, label: "Delete after 30 days" },
  { days: 90, label: "Delete after 90 days" },
  { days: 180, label: "Delete after 180 days" },
];

// Partner types — drives which submission flow their portal shows.
export const PARTNER_TYPES: Record<string, string> = {
  lender: "Lender",
  realtor: "Realtor",
  cpa: "CPA / Accountant",
  friend_family: "Friend / Family",
  other: "Other",
};

// Contact roles on a partner's team. Offered as a list rather than free text
// so the portal can tell who's actually looking at it — a processor and a loan
// officer open the same link wanting completely different things. "Other"
// still allows anything unusual, and existing free-text roles keep working.
export const CONTACT_ROLES = [
  "Loan officer",
  "Processor",
  "Loan officer assistant",
  "Transaction coordinator",
  "Closer",
  "Branch manager",
  "Realtor",
  "Realtor assistant",
  "Owner",
];

// Roles whose day job is assembling the file. For these the documents desk
// leads the portal; for everyone else it sits below the pipeline.
export const PROCESSOR_ROLE_RE = /process|assistant|coordinat|closer|loa\b|admin/i;

// Days before closing to raise the at-risk flag
export const AT_RISK_DAYS = 7;
