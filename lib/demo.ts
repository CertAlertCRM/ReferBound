import crypto from "crypto";

// Sample data for the demo portal.
//
// This is what an agent hands a loan officer they don't work with yet. It has
// to look exactly like the real thing — same pipeline, same statuses, same
// documents — while being unmistakably a sample. Every name here is invented
// and labelled as such on the page. A demo that could be mistaken for real
// client data is a demo that gets an agent in trouble.

export function makeDemoToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export type DemoDeal = {
  client: string;
  coborrower?: string;
  address: string;
  status: string;
  closingInDays: number | null;
  docs: string[];
  quotedInHours?: number;
  note?: string;
};

// Deliberately mid-pipeline: a board where everything is finished looks
// staged, and a board where nothing is finished looks useless. This is a
// Tuesday.
export const DEMO_DEALS: DemoDeal[] = [
  {
    client: "Sample Client — Maria Delgado",
    coborrower: "Andres Delgado",
    address: "4417 Ashgrove Ln",
    status: "docs_delivered",
    closingInDays: 3,
    docs: ["Evidence of Insurance (EOI)", "Replacement Cost Estimator (RCE)"],
    quotedInHours: 4,
    note: "Bound. Documents posted and emailed to the processor.",
  },
  {
    client: "Sample Client — Trevor Nash",
    address: "882 Wyckham Ct",
    status: "bound",
    closingInDays: 8,
    docs: [],
    quotedInHours: 6,
    note: "Bound this morning — documents go out today.",
  },
  {
    client: "Sample Client — Priya Raman",
    coborrower: "Dev Raman",
    address: "119 Kestrel Hollow",
    status: "application",
    closingInDays: 14,
    docs: [],
    quotedInHours: 3,
    note: "Client picked a $2,500 deductible, binding once they confirm.",
  },
  {
    client: "Sample Client — Bill & Anne Ostrander",
    address: "27 Pinehurst Row",
    status: "quoted",
    closingInDays: 21,
    docs: [],
    quotedInHours: 5,
    note: "Quote emailed, you were copied.",
  },
  {
    client: "Sample Client — Jordan Whitfield",
    address: "6100 Marbury Way",
    status: "quoting",
    closingInDays: 26,
    docs: [],
    note: "Came in yesterday afternoon — quote out today.",
  },
];

export const DEMO_STATS = {
  avgQuoteHours: 4.6,
  avgBindDays: 2.1,
  readyByClosing: 96,
};
