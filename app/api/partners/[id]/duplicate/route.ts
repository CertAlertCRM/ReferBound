import { NextRequest, NextResponse } from "next/server";
import { db, DOCS_BUCKET } from "@/lib/db";
import { getAccount, partnerLimit } from "@/lib/account";

export const dynamic = "force-dynamic";

// Clone a partner: same name/type/settings/logo and ALL team contacts, but a
// brand-new magic link and short code, and zero leads. Built for the
// "I set them up as a test, now let's make it official" moment — duplicate,
// rename if needed, delete the test one.

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: src } = await db()
    .from("partners")
    .select("id, name, emails, partner_type, type_label, monthly_summary, thankyou_cadence, logo_path")
    .eq("id", params.id)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Plan enforcement, same as adding a partner.
  const limit = partnerLimit(account.plan);
  if (limit !== null) {
    const { count } = await db()
      .from("partners")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id);
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: "The Free plan includes 1 partner. Upgrade to Pro for unlimited partners.", upgrade: true },
        { status: 402 }
      );
    }
  }

  // Copy the logo file so the two partners never share a storage object.
  let logo_path: string | null = null;
  if (src.logo_path) {
    const copyTo = `${src.logo_path}-copy-${Math.random().toString(36).slice(2, 8)}`;
    const { error: cpErr } = await db().storage.from(DOCS_BUCKET).copy(src.logo_path, copyTo);
    if (!cpErr) logo_path = copyTo;
  }

  const { data: created, error } = await db()
    .from("partners")
    .insert({
      account_id: account.id,
      name: `${src.name} (copy)`,
      emails: src.emails ?? [],
      partner_type: src.partner_type,
      type_label: src.type_label,
      monthly_summary: src.monthly_summary,
      thankyou_cadence: src.thankyou_cadence,
      logo_path,
    })
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bring the whole team over.
  const { data: contacts } = await db()
    .from("partner_contacts")
    .select("name, email, role, phone, sms_opt_in, notify_channel")
    .eq("partner_id", src.id);
  if (contacts?.length) {
    await db()
      .from("partner_contacts")
      .insert(contacts.map((c) => ({ ...c, partner_id: created.id })));
  }

  return NextResponse.json({ partner: created });
}
