import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/account";
import { DOC_KINDS } from "@/lib/config";
import { sendEmail, plainBodyEmail, statusUpdateEmail } from "@/lib/email";
import { renderVoice, STOCK_TEMPLATES, type NotifyTemplates } from "@/lib/voice";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/helpers";
import { fireWebhook } from "@/lib/webhook";
import { signDocUrl } from "@/lib/doclink";

export const dynamic = "force-dynamic";

// The client track.
//
// Three emails the agent writes by hand on every single file: here's your
// quote (with the loan officer copied), a check-in while it sits, and the
// welcome with proof of insurance once it's bound. Same voice system as the
// partner notifications — the agent's words, not ours.
//
// The quote email deliberately copies the partner rather than triggering a
// separate notice to them. One message, everyone on the same thread, exactly
// the way the agent already does it.

type Action = "quote" | "welcome" | "nudge";

const SUBJECTS: Record<Action, (client: string) => string> = {
  quote: (c) => `Your home insurance quote — ${c}`,
  welcome: (c) => `You're covered — ${c}`,
  nudge: (c) => `Checking in on your insurance quote — ${c}`,
};

const TEMPLATE_KEY: Record<Action, keyof NotifyTemplates> = {
  quote: "email_quote_client",
  welcome: "email_welcome_client",
  nudge: "email_nudge_client",
};

// Which documents ride along with each email. The client gets their quote and
// their proof of insurance — never the lender's paperwork.
const DOC_KINDS_FOR: Record<Action, string[]> = {
  quote: ["quote"],
  welcome: ["eoi", "dec"],
  nudge: [],
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "") as Action;
  if (!["quote", "welcome", "nudge"].includes(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const { data: referral } = await db()
    .from("referrals")
    .select(
      "*, partners(id, name, token, emails), partner_contacts(name, email), documents(id, kind, file_name, purged_at)"
    )
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!referral) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!referral.client_email) {
    return NextResponse.json({ error: "Add the client's email address first" }, { status: 400 });
  }

  const { data: prof } = await db()
    .from("agent_profile")
    .select("notify_templates, display_name, agency_name, phone, email")
    .eq("account_id", account.id)
    .maybeSingle();
  const voice = (prof?.notify_templates ?? {}) as NotifyTemplates;

  // Documents ride as links, same as everywhere else — an inbox is not a
  // filing cabinet, and a link we can retire beats an attachment we can't.
  const wanted = DOC_KINDS_FOR[action];
  const docs = (referral.documents ?? []).filter(
    (d: any) => !d.purged_at && wanted.includes(d.kind)
  );
  if (action === "quote" && docs.length === 0) {
    return NextResponse.json(
      { error: "Upload the quote first — it attaches to this email as a download link" },
      { status: 400 }
    );
  }

  const partnerName = referral.partners?.name ?? "your lender";
  const firstName = String(referral.client_name).split(" ")[0];
  const vars = {
    client: firstName,
    partner: partnerName,
    first: firstName,
    link: "",
    docs: docs.map((d: any) => DOC_KINDS[d.kind] ?? d.file_name).join(", "),
  };

  const template = voice[TEMPLATE_KEY[action]] || STOCK_TEMPLATES[TEMPLATE_KEY[action]];
  const lines = [renderVoice(template, vars)];

  if (docs.length > 0) {
    lines.push(
      docs
        .map((d: any) => `${DOC_KINDS[d.kind] ?? d.file_name}: ${signDocUrl(d.id)}`)
        .join("\n")
    );
  }

  const signature = [prof?.display_name, prof?.agency_name, prof?.phone, prof?.email]
    .filter(Boolean)
    .join("\n");
  if (signature) lines.push(signature);

  // Copy whoever sent the referral. This IS the lender's notification for the
  // quote — the agent already sends one email, not two, and so do we.
  const ccPartner = action === "quote" && body?.cc_partner !== false;
  const cc: string[] = ccPartner
    ? ((referral as any).partner_contacts?.email
        ? [(referral as any).partner_contacts.email]
        : (referral.partners?.emails ?? []))
    : [];

  const result = await sendEmail({
    referralId: referral.id,
    kind: action === "welcome" ? "docs_ready" : "status_update",
    to: [referral.client_email, ...cc],
    subject: SUBJECTS[action](referral.client_name),
    html: plainBodyEmail(lines.join("\n\n")),
  });
  if (!result.sent) {
    return NextResponse.json({ error: `Couldn't send (${result.error ?? "unknown"})` }, { status: 502 });
  }

  const stampField =
    action === "quote" ? "quote_sent_at" : action === "welcome" ? "welcome_sent_at" : "client_nudged_at";
  const patch: Record<string, unknown> = { [stampField]: new Date().toISOString() };

  // Sending the quote IS marking it quoted. Nobody should have to do both.
  let advanced = false;
  if (action === "quote" && ["new", "quoting"].includes(referral.status)) {
    patch.status = "quoted";
    advanced = true;
  }
  await db().from("referrals").update(patch).eq("id", referral.id);

  if (advanced) {
    await db().from("status_events").insert({ referral_id: referral.id, status: "quoted" });
    await fireWebhook(account.id, "referral.status_changed", { ...referral, status: "quoted" }, referral.partners);
  }

  await logActivity(
    referral.id,
    "email_sent",
    action === "quote"
      ? `Quote emailed to ${referral.client_name}${cc.length > 0 ? ` (${partnerName} copied)` : ""}`
      : action === "welcome"
        ? `Welcome email with proof of insurance sent to ${referral.client_name}`
        : `Checked in with ${referral.client_name}`,
    "agent"
  );

  // If the agent chose not to copy the partner on the quote, the partner still
  // deserves to know the quote is out — just on their own thread.
  if (action === "quote" && advanced && cc.length === 0) {
    const recipients = referral.partners?.emails ?? [];
    if (recipients.length > 0) {
      await sendEmail({
        referralId: referral.id,
        kind: "status_update",
        to: recipients,
        subject: `${referral.client_name}: insurance update`,
        html: voice.email_quoted
          ? plainBodyEmail(
              renderVoice(voice.email_quoted, {
                ...vars,
                client: referral.client_name,
                link: `${appUrl()}/p/${referral.partners?.token}`,
              })
            )
          : statusUpdateEmail(referral.client_name, "quoted", `${appUrl()}/p/${referral.partners?.token}`),
      });
    }
  }

  return NextResponse.json({ ok: true, cc, advanced });
}
