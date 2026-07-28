import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { STATUSES } from "@/lib/config";
import { sendEmail, statusUpdateEmail, docsReadyEmail } from "@/lib/email";
import { appUrl } from "@/lib/helpers";
import { DOC_KINDS, STATUS_LABELS } from "@/lib/config";
import { logActivity } from "@/lib/activity";

// Partner is notified on these status changes (bound is handled by docs-ready
// logic too, but a bound email goes out immediately even before docs upload).
const NOTIFY_STATUSES = new Set(["quoted", "bound", "docs_delivered", "lost"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ["client_name", "client_phone", "client_email", "closing_date", "notes", "lost_reason"]) {
    if (f in body) patch[f] = body[f] === "" ? null : body[f];
  }

  let statusChanged = false;
  if (body.status) {
    const valid = [...STATUSES, "lost"].includes(body.status);
    if (!valid) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    patch.status = body.status;
    statusChanged = true;
  }

  const { data: referral, error } = await db()
    .from("referrals")
    .update(patch)
    .eq("id", params.id)
    .select("*, partners(name, token, emails), documents(kind, file_name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (statusChanged) {
    await db().from("status_events").insert({ referral_id: referral.id, status: referral.status });
    await logActivity(
      referral.id,
      "status_changed",
      `Status set to “${STATUS_LABELS[referral.status] ?? referral.status}”${
        referral.status === "lost" && referral.lost_reason ? ` — ${referral.lost_reason}` : ""
      }`,
      "agent"
    );

    if (NOTIFY_STATUSES.has(referral.status) && referral.partners) {
      const portalUrl = `${appUrl()}/p/${referral.partners.token}`;
      if (referral.status === "docs_delivered") {
        const docList = (referral.documents ?? []).map(
          (d: any) => DOC_KINDS[d.kind] ?? d.file_name
        );
        await sendEmail({
          referralId: referral.id,
          kind: "docs_ready",
          to: referral.partners.emails ?? [],
          subject: `${referral.client_name}: insurance documents ready`,
          html: docsReadyEmail(referral.client_name, docList, portalUrl),
        });
      } else if (referral.status !== "lost") {
        await sendEmail({
          referralId: referral.id,
          kind: "status_update",
          to: referral.partners.emails ?? [],
          subject: `${referral.client_name}: insurance update`,
          html: statusUpdateEmail(referral.client_name, referral.status, portalUrl),
        });
      }
      // "lost" is intentionally not emailed to the partner in the pilot —
      // that conversation deserves a personal touch. It's logged either way.
    }
  }

  return NextResponse.json({ referral });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await db().from("referrals").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
