import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail, normalizePhone, EMAIL_RE } from "@/lib/format";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/ratelimit";
import { normalizeLocale } from "@/lib/i18n";

// A stranger asking to be let in.
//
// The only unauthenticated write path in the product that creates a row on
// somebody else's account, so the rules it follows are worth stating plainly:
//
//   - It writes to partner_requests, never to partners. No partner row means
//     no portal token, so a submission cannot read anything, and none of the
//     sixteen places that resolve a partner by token need to learn about a
//     state they've never heard of.
//   - It consumes no plan seat. The capacity check lives at approval. If it
//     lived here, the first stranger through a free agent's link would spend
//     the only lender seat they have.
//   - It sends no mail. Not to the requester, not to the agent, not to
//     anyone. A public URL that can make email leave the building is a public
//     URL that will eventually be used to make email leave the building; the
//     agent finds the request on their partners page, where they were going
//     anyway.
//   - Rate limited twice: per IP, and per agent code, so one posted link
//     can't be used to fill a queue faster than a human could work it.
//
// Errors come back as translation KEYS rather than sentences, because the
// visitor may be reading this page in Spanish and a validation message in the
// wrong language is how a form stops being trusted.

export const dynamic = "force-dynamic";

const MAX_PENDING = 50;

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const slug = String(params.code ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
  if (!slug) return NextResponse.json({ key: "join.closed" }, { status: 404 });

  if (!(await rateLimit(`join-ip:${clientIp(req)}`, 5, 3600))) {
    return NextResponse.json({ ...RATE_LIMITED, key: "join.error.generic" }, { status: 429 });
  }
  if (!(await rateLimit(`join-code:${slug}`, 40, 3600))) {
    return NextResponse.json({ ...RATE_LIMITED, key: "join.error.generic" }, { status: 429 });
  }

  const { data: account } = await db()
    .from("accounts")
    .select("id")
    .eq("partner_join_code", slug)
    .maybeSingle();
  if (!account) return NextResponse.json({ key: "join.closed" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const person = String(body?.name ?? "").trim().slice(0, 120);
  const company = String(body?.company ?? "").trim().slice(0, 120);
  const email = normalizeEmail(body?.email);
  if (!person || !email) return NextResponse.json({ key: "join.error.required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ key: "join.error.email" }, { status: 400 });

  // Already a partner here. Answered the same way as a duplicate request —
  // "they have it" — because this endpoint is public and has no business
  // confirming who an agent's partners are to whoever asks.
  const { data: already } = await db()
    .from("partners")
    .select("id")
    .eq("account_id", account.id)
    .contains("emails", [email])
    .limit(1)
    .maybeSingle();
  if (already) return NextResponse.json({ key: "join.error.duplicate" }, { status: 409 });

  // A backstop above the rate limit: if fifty people are already waiting, the
  // agent has a queue problem rather than a growth problem, and the honest
  // move is to stop taking requests instead of piling them higher.
  const { count: pending } = await db()
    .from("partner_requests")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .is("approved_at", null)
    .is("declined_at", null);
  if ((pending ?? 0) >= MAX_PENDING) {
    return NextResponse.json({ key: "join.closed" }, { status: 429 });
  }

  const ALLOWED_TYPES = ["lender", "realtor", "processor", "cpa", "other"];
  const partnerType = ALLOWED_TYPES.includes(String(body?.partner_type))
    ? String(body.partner_type)
    : "other";

  const { error } = await db().from("partner_requests").insert({
    account_id: account.id,
    contact_name: person,
    company: company || null,
    email,
    phone: normalizePhone(body?.phone) || null,
    partner_type: partnerType,
    note: String(body?.note ?? "").trim().slice(0, 400) || null,
    locale: normalizeLocale(body?.locale),
  });

  if (error) {
    // The partial unique index on (account_id, lower(email)) catches a second
    // submission from the same person. That is a duplicate, not a failure, and
    // it reads better as one.
    if (String(error.code) === "23505") {
      return NextResponse.json({ key: "join.error.duplicate" }, { status: 409 });
    }
    console.error("join request failed:", error.message);
    return NextResponse.json({ key: "join.error.generic" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
