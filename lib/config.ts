// ── Branding & app configuration ─────────────────────────────────────────────
// Edit these values to customize what the agent and partners see.
// Keep carrier trademarks out of partner-facing branding.

export const APP_CONFIG = {
  // Shown in the partner portal header: "<agencyName> — Referral Portal"
  agencyName: process.env.NEXT_PUBLIC_AGENCY_NAME || "Your Agency",
  // The agent's display name, shown to partners
  agentName: process.env.NEXT_PUBLIC_AGENT_NAME || "Your Agent",
  // Product working title (footer "powered by")
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME || "ReferLive",
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
  application: "Application in progress",
  bound: "Bound ✔",
  docs_delivered: "EOI & docs delivered",
  lost: "Not written",
};

// Statuses that count as "insurance is done" for closing-risk purposes
export const SAFE_STATUSES = ["bound", "docs_delivered"];

// Partner-visible document kinds
export const DOC_KINDS: Record<string, string> = {
  eoi: "Evidence of Insurance (EOI)",
  rce: "Replacement Cost Estimator (RCE)",
  dec: "Declarations Page",
  other: "Other document",
};

// Days before closing to raise the at-risk flag
export const AT_RISK_DAYS = 7;
