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

// Document kinds. The first group is what the agent delivers; the second is
// what partners typically send with a referral.
export const DOC_KINDS: Record<string, string> = {
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

// Kinds shown in the partner's upload picker
export const PARTNER_DOC_KINDS = ["loan_1003", "hoi_request", "mortgagee", "other"] as const;

// Document kinds that routinely carry more personal information than an agent
// needs to quote. The source file for these can be purged after extraction —
// the details pulled off it stay on the referral. See lib/retention.
export const SENSITIVE_DOC_KINDS = ["loan_1003"];

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

// Days before closing to raise the at-risk flag
export const AT_RISK_DAYS = 7;
