// Personalized notification voice: agents approve templates written the way
// THEY write, and the send paths use them in place of stock wording.
// Placeholders are double-braced and filled at send time.

export type NotifyTemplates = {
  email_quoted?: string;
  email_docs?: string;
  sms_quoted?: string;
  sms_docs?: string;
  email_ack?: string;
  email_quote_client?: string;
  email_welcome_client?: string;
  email_nudge_client?: string;
  email_recap_intro?: string;
  email_thankyou?: string;
};

export const TEMPLATE_META: Record<
  keyof NotifyTemplates,
  { label: string; hint: string; sms: boolean; required: string[] }
> = {
  email_quoted: {
    label: "Email — quote is ready",
    hint: "Sent to whoever referred the client, the moment you mark Quoted.",
    sms: false,
    required: ["{{client}}", "{{link}}"],
  },
  email_docs: {
    label: "Email — bound & documents ready",
    hint: "The one combined email when you mark EOI & docs delivered.",
    sms: false,
    required: ["{{client}}", "{{link}}"],
  },
  sms_quoted: {
    label: "Text — quote is ready",
    hint: "For contacts who opted into texts.",
    sms: true,
    required: ["{{client}}", "{{link}}"],
  },
  sms_docs: {
    label: "Text — bound & documents ready",
    hint: "For contacts who opted into texts.",
    sms: true,
    required: ["{{client}}", "{{link}}"],
  },
  email_ack: {
    label: "Email — got your referral",
    hint: "The reply that goes back automatically when a partner forwards you a referral by email. Only ever sent to partners you already work with.",
    sms: false,
    required: ["{{client}}"],
  },
  email_quote_client: {
    label: "Email — your quote (to the client)",
    hint: "Goes to the client with their quote attached, and copies the loan officer or processor who sent them.",
    sms: false,
    required: ["{{client}}"],
  },
  email_welcome_client: {
    label: "Email — welcome (to the client)",
    hint: "The client's own email when the policy is bound, carrying their proof of insurance. Separate from the lender's copy.",
    sms: false,
    required: ["{{client}}"],
  },
  email_nudge_client: {
    label: "Email — checking in (to the client)",
    hint: "The nudge for a quote that's been sitting. Sent only when you click it, never on a schedule.",
    sms: false,
    required: ["{{client}}"],
  },
  email_recap_intro: {
    label: "Monthly recap — your opening line",
    hint: "The personal line above the stats in the monthly partner summary (for partners who have the recap on).",
    sms: false,
    required: [],
  },
  email_thankyou: {
    label: "Thank-you note",
    hint: "The metric-free appreciation note, sent on each partner's chosen cadence. Numbers stay out by design.",
    sms: false,
    required: ["{{partner}}"],
  },
};

// Stock wording — shown as the starting point in the editor and used whenever
// no approved template exists.
export const STOCK_TEMPLATES: Required<NotifyTemplates> = {
  email_quoted:
    "Quick update — we have a quote ready for {{client}}. You can watch live status anytime on your portal:\n{{link}}",
  email_docs:
    "{{client}} is bound, and their insurance documents ({{docs}}) are posted and ready to download on your portal:\n{{link}}",
  sms_quoted: "ReferBound: {{client}} has been quoted. Live status: {{link}} Reply STOP to opt out",
  sms_docs:
    "ReferBound: {{client}} is bound — insurance docs are ready on your portal: {{link}} Reply STOP to opt out",
  email_ack:
    "{{first}} — got it, thank you for the referral. I have {{client}} and I'm working on the quote now; I'll send it over shortly.\n\nIf you ever want to check where it stands without waiting on me, it's live here:\n{{link}}",
  email_quote_client:
    "Hi {{client}},\n\nGreat to hear from {{partner}} — your home insurance quote is attached. I built it around the coverage your lender needs at closing, so there shouldn't be any surprises on their end.\n\nTake a look and let me know if anything looks off or if you'd like me to run a different deductible. Once you give me the go-ahead I can have it bound quickly.",
  email_welcome_client:
    "Hi {{client}},\n\nYou're covered — congratulations on the new home. Your proof of insurance is attached, and I've already sent a copy to {{partner}} for your loan file, so there's nothing you need to forward.\n\nKeep this handy for closing. If anything about the home or your coverage changes, just reply here and I'll take care of it.",
  email_nudge_client:
    "Hi {{client}},\n\nJust checking in on the quote I sent over — no rush at all, but I want to make sure you have everything you need before closing gets close. Happy to walk through it or adjust anything.\n\nJust reply here and I'll take it from there.",
  email_recap_intro:
    "Thank you for the clients you sent our way in {{month}} — here's what they turned into.",
  email_thankyou:
    "Hi {{partner}} team,\n\nNo numbers, no updates — just a genuine thank-you. The clients you've trusted us with {{period}} mean a lot, and we work hard to make sure every one of them reflects well on you.\n\nIf there's ever anything we can do better, just reply — this reaches {{agent}} directly.\n\n— {{agent}}",
};

// Fill {{placeholders}}; unknown keys become empty strings. Collapse the
// doubled spaces an empty {{first}} can leave behind.
export function renderVoice(template: string, vars: Record<string, string | null | undefined>): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? "").trim())
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ,/g, ",")
    .trim();
}

// Validation shared by the save endpoint: each template carries its required
// placeholders; texts stay short and carry opt-out language.
export function validateTemplate(key: keyof NotifyTemplates, text: string): string | null {
  const meta = TEMPLATE_META[key];
  for (const ph of meta.required) {
    if (!text.includes(ph)) return `must include ${ph}`;
  }
  if (meta.sms) {
    if (text.length > 280) return "texts need to stay under 280 characters";
    if (!/stop/i.test(text)) return 'texts must include "Reply STOP to opt out"';
  }
  if (key === "email_recap_intro" && text.length > 400) return "keep the opener under 400 characters";
  return null;
}
