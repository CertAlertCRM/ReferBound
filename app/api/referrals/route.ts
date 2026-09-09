import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { normalizePhone, normalizeEmail } from "@/lib/format";
import { getAccount, teamMembers } from "@/lib/account";
import { resolveScope, scopeQuery } from "@/lib/scope";
import { STATUSES } from "@/lib/config";
import { cleanLines } from "@/lib/lines";
import { maybeRewardReferrer } from "@/lib/referral";
import { fireWebhook } from "@/lib/webhook";

export async function GET(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Who else is on this account decides both what comes back and whether the
  // client gets tabs at all. A producer never needs the roster — their scope is
  // fixed before the query string is read — so skip the lookup for them.
  const roster = account.isTeamMember ? [] : await teamMembers(account.id);
  const ctx = resolveScope(
    account,
    req.nextUrl.searchParams.get("who"),
    account.isTeamMember || roster.length > 0
  );

  let q = db()
    .from("referrals")
    .select("*, partners!referrals_partner_id_fkey(name, partner_type), partner_contacts(name), documents(id, kind, file_name, uploaded_by, purged_at)")
    .eq("account_id", account.id);
  q = scopeQuery(q, ctx);

  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The client is told the scope it actually GOT, not the one it asked for.
  // Anything else lets a stale tab render a producer's own book under a "My
  // team" heading, which is how people start mistrusting a number.
  return NextResponse.json({
    referrals: data,
    scope: ctx.scope,
    canSeeTeam: ctx.canSeeTeam,
    isTeam: ctx.isTeam,
    producers: ctx.canSeeTeam
      ? roster.map((m) => ({ id: m.id, name: m.display_name || m.email }))
      : [],
  });
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.client_name) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }

  // ── The credit path ───────────────────────────────────────────────────────
  //
  // A past client sent this person. That is the whole thesis in one branch, so
  // it is worth being explicit about what happens:
  //
  //   1. The client becomes a SOURCE — a partner row of kind "client". They
  //      now accumulate a referral count, which is what lets the product
  //      notice their second one and say so.
  //   2. The new referral points back at the client's own referral via
  //      parent_referral_id, which is what lets the ledger credit whatever
  //      produced that client in the first place — including, and especially,
  //      a paid lead. That is the number that makes bought leads look cheaper
  //      than they were.
  //
  // Without this branch every one of those columns stays null forever and the
  // growth card is decoration.
  let partnerId: string | null = body.partner_id ?? null;
  let parentReferralId: string | null = null;

  if (body.from_referral_id) {
    const { data: parent } = await db()
      .from("referrals")
      .select("id, client_name, partner_id")
      .eq("id", body.from_referral_id)
      .eq("account_id", account.id)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "referring client not found" }, { status: 404 });
    parentReferralId = parent.id;

    // One source row per referring client, reused on their second and third.
    const { data: existing } = await db()
      .from("partners")
      .select("id")
      .eq("account_id", account.id)
      .eq("from_referral_id", parent.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      partnerId = existing.id;
    } else {
      // No plan check here on purpose. A client-kind source gives nothing
      // away — no portal, no magic link, no notifications — and blocking an
      // agent from LOGGING BUSINESS because of a seat count would be the
      // worst possible place to put a wall. The check lives at promotion,
      // which is where a portal is actually handed over.
      const { data: created, error: cErr } = await db()
        .from("partners")
        .insert({
          account_id: account.id,
          name: parent.client_name,
          emails: [],
          partner_type: "other",
          type_label: "Client",
          source_kind: "client",
          from_referral_id: parent.id,
        })
        .select("id")
        .single();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      partnerId = created.id;
    }
  }

  if (!partnerId) {
    return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  }

  // The chosen partner must belong to this account.
  const { data: partnerOwned } = await db()
    .from("partners")
    .select("id, name, partner_type")
    .eq("id", partnerId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!partnerOwned) return NextResponse.json({ error: "partner not found" }, { status: 404 });

  const premiumRaw = Number(String(body.premium ?? "").replace(/[^0-9.]/g, ""));
  const premiumValue = Number.isFinite(premiumRaw) && premiumRaw > 0 ? premiumRaw : null;

  // ── Hand-off ──────────────────────────────────────────────────────────────
  //
  // An owner takes a referral call in a parking lot and has no intention of
  // working it — somebody in the office will. Logging it under their own name
  // and hoping the producer notices is how a good lead goes cold, so the owner
  // says who it's for at the moment they type it.
  //
  // Validated against the roster rather than trusted, and open to owners only.
  // A producer sending producer_id is ignored rather than rejected: their own
  // id is the only correct answer and there is nothing for them to fix.
  let producerId = account.selfId;
  let assignedTo: string | null = null;
  if (
    !account.isTeamMember &&
    typeof body.producer_id === "string" &&
    body.producer_id !== account.selfId
  ) {
    const roster = await teamMembers(account.id);
    if (!roster.some((m) => m.id === body.producer_id)) {
      return NextResponse.json({ error: "That producer is not on this account." }, { status: 400 });
    }
    producerId = body.producer_id;
    assignedTo = body.producer_id;
  }

  const row = {
    account_id: account.id,
    partner_id: partnerId,
    parent_referral_id: parentReferralId,
    // Set only when this was handed to somebody. A producer logging their own
    // lead leaves these null, which is what keeps "waiting for you" honest.
    assigned_at: assignedTo ? new Date().toISOString() : null,
    assigned_by: assignedTo ? account.selfId : null,
    // Who logged it. On a solo account this is the same as account_id; on an
    // agency it is the difference between "the office wrote 40" and knowing
    // which producer actually converts wins into the next referral.
    producer_id: producerId,
    client_name: String(body.client_name).trim(),
    coborrower_name: String(body.coborrower_name ?? "").trim() || null,
    client_phone: normalizePhone(body.client_phone),
    client_email: normalizeEmail(body.client_email),
    client_dob: body.client_dob || null,
    coborrower_dob: body.coborrower_dob || null,
    property_address: String(body.property_address ?? "").trim() || null,
    closing_date: body.closing_date || null,
    notes: body.notes || null,
    // Where the deal already stands.
    //
    // The alternative — always create as "new" and make the agent click the
    // lead up the pipeline — is not neutral: every one of those status changes
    // notifies the partner. A producer recording the data lead they closed
    // last month would spray live updates about finished business. So the
    // status is set once, here, and nothing is sent.
    status: STATUSES.includes(body.status) || body.status === "lost" ? body.status : "new",
    premium: premiumValue,
    lines: cleanLines(body.lines),
    source: "agent",
    log_seconds: typeof body.log_seconds === "number" ? body.log_seconds : null,
  };
  const { data, error } = await db().from("referrals").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Only the status it was actually created at. Writing a "new" event as well
  // would give every pre-worked deal a zero-hour close and quietly flatter the
  // time-to-bound average on the Stats page, which reads the gap between the
  // first "new" and the first "bound".
  await db().from("status_events").insert({ referral_id: data.id, status: data.status });
  await logActivity(data.id, "lead_logged", `Lead logged for ${data.client_name}`, "agent");
  if (assignedTo) {
    // The permanent record of the hand-off. assigned_at clears when the
    // producer opens the deal; this line does not, so six months later the
    // file still says where the lead came from.
    await logActivity(data.id, "producer_assigned", "Assigned to a producer to work", "agent");
  }
  if (parentReferralId) {
    await logActivity(
      parentReferralId,
      "referral_received",
      `${data.client_name} came from this client`,
      "agent"
    );
  }
  await fireWebhook(account.id, "referral.created", data, partnerOwned);
  // A partner plus a logged lead is real use — whoever referred this agent
  // earns their reward now (idempotent; only ever fires once per pairing).
  await maybeRewardReferrer(account.selfId);
  return NextResponse.json({ referral: data });
}
