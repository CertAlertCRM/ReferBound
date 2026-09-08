// What was actually sold, and what wasn't.
//
// Client-safe: no database import. The partners page learned that lesson.
//
// The design decision worth defending: checkboxes rather than free text. The
// old policy_lines field is a string an agent typed — "Home + Auto", "HO3",
// "home/auto/umb" — which is fine to read and impossible to count. A monoline
// count is the entire value here, so the data has to be countable, and ticking
// two boxes is faster than typing anyway.

export const LINE_KINDS = {
  auto: "Auto",
  home: "Home",
  renters: "Renters",
  umbrella: "Umbrella",
  life: "Life",
  other: "Other",
} as const;

export type LineKind = keyof typeof LINE_KINDS;

export const LINE_ORDER: LineKind[] = ["auto", "home", "renters", "umbrella", "life", "other"];

export function lineLabel(k: string): string {
  return LINE_KINDS[k as LineKind] ?? k;
}

export function cleanLines(input: unknown): LineKind[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: LineKind[] = [];
  for (const raw of input) {
    const k = String(raw).toLowerCase().trim();
    if (k in LINE_KINDS && !seen.has(k)) {
      seen.add(k);
      out.push(k as LineKind);
    }
  }
  return LINE_ORDER.filter((k) => out.includes(k));
}

// Read the lines off whatever the agent or the extractor already wrote.
//
// This exists because the document extractor has always pulled policy_lines as
// free text — "Home + Flood", "HO3", "auto/umb" — and writes it to the deal.
// Asking a producer to then tick boxes for information the system already read
// off their own dec page is exactly the kind of re-entry this product is
// supposed to remove.
//
// Deliberately conservative: an unrecognised word contributes nothing rather
// than guessing "other", because a wrong monoline flag puts a false prompt in
// front of an agent who knows better.
const LINE_PATTERNS: [LineKind, RegExp][] = [
  ["renters", /\b(renters?|tenants?|ho-?4|h0-?4)\b/i],
  ["home", /\b(home|homeowners?|dwelling|ho-?[36]|h0-?[36]|dp-?[13]|condo|fire)\b/i],
  ["auto", /\b(auto|autos|car|vehicle|pap|personal auto)\b/i],
  ["umbrella", /\b(umbrella|umb|pup|excess liability)\b/i],
  ["life", /\b(life|term life|whole life|iul|final expense)\b/i],
  ["other", /\b(flood|boat|watercraft|motorcycle|rv|atv|jewelry|scheduled|pet|cyber|earthquake|toy|camper|trailer)\b/i],
];

export function linesFromText(text: string | null | undefined): LineKind[] {
  const t = String(text ?? "");
  if (!t.trim()) return [];
  const found: LineKind[] = [];
  for (const [kind, re] of LINE_PATTERNS) {
    if (re.test(t)) found.push(kind);
  }
  // Renters and home are alternatives, never both on one household.
  const cleaned = found.includes("renters") ? found.filter((k) => k !== "home") : found;
  return LINE_ORDER.filter((k) => cleaned.includes(k));
}

// What the deal actually has: the boxes if somebody ticked them, otherwise
// whatever can be read off the free-text field. Lets every deal already in the
// book light up the round-out queue without anyone backfilling anything.
export function effectiveLines(
  lines: string[] | null | undefined,
  policyLines?: string | null
): LineKind[] {
  const ticked = cleanLines(lines);
  if (ticked.length > 0) return ticked;
  return linesFromText(policyLines);
}

// One line on the household. "Other" counts — an agent who wrote a boat policy
// and nothing else still has a household worth rounding out.
export function isMonoline(lines: string[] | null | undefined): boolean {
  const l = cleanLines(lines);
  return l.length === 1;
}

export function linesRecorded(lines: string[] | null | undefined): boolean {
  return cleanLines(lines).length > 0;
}

export function linesSummary(lines: string[] | null | undefined): string {
  const l = cleanLines(lines);
  if (l.length === 0) return "";
  return l.map(lineLabel).join(" + ");
}

// What's missing that's worth a call. Deliberately not every possible line —
// naming three things an agent might genuinely sell beats listing six and
// being ignored. Renters and home are alternatives, never both.
export function roundOutSuggestions(lines: string[] | null | undefined): string[] {
  const l = cleanLines(lines);
  if (l.length === 0) return [];
  const has = (k: LineKind) => l.includes(k);
  const out: string[] = [];
  if (!has("home") && !has("renters")) out.push("Home");
  if (has("auto") && (has("home") || has("renters")) && !has("umbrella")) out.push("Umbrella");
  if (!has("life")) out.push("Life");
  if (!has("auto")) out.unshift("Auto");
  return out.slice(0, 2);
}

// The producer's second number, next to earned share. Households carrying more
// than one line, out of households where lines were recorded at all — an agent
// who hasn't started ticking boxes should see a dash, not a zero.
export type MultilineRate = {
  recorded: number;
  multiline: number;
  monoline: number;
  percent: number | null;
};

export function multilineRate(rows: { lines?: string[] | null }[]): MultilineRate {
  const recorded = rows.filter((r) => linesRecorded(r.lines));
  const multiline = recorded.filter((r) => cleanLines(r.lines).length > 1).length;
  return {
    recorded: recorded.length,
    multiline,
    monoline: recorded.length - multiline,
    percent: recorded.length > 0 ? Math.round((multiline / recorded.length) * 100) : null,
  };
}

// "their home renews in March" — the reason a round-out prompt is worth
// surfacing on a particular day rather than sitting in a list forever.
export function renewalLabel(date: string | null | undefined): string | null {
  if (!date) return null;
  const t = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(t.getTime())) return null;
  const days = Math.round((t.getTime() - Date.now()) / 86_400_000);
  const month = t.toLocaleDateString("en-US", { month: "long" });
  if (days < 0) return `renewed in ${month}`;
  if (days <= 45) return `renews in ${days <= 1 ? "days" : `${days} days`}`;
  return `renews in ${month}`;
}

// Inside the window where a competing policy can actually be moved. Before
// this it's a nice thought; after it, they just renewed and you missed it.
export function renewalDue(date: string | null | undefined): boolean {
  if (!date) return false;
  const t = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return false;
  const days = Math.round((t - Date.now()) / 86_400_000);
  return days >= -7 && days <= 45;
}
