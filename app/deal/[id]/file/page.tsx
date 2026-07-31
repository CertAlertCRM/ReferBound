import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db";
import { currentAccountId } from "@/lib/auth";
import { STATUS_LABELS, DOC_KINDS } from "@/lib/config";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deal file" };

// The E&O artifact: one page containing everything that happened on a
// referral, timestamped. Print to PDF and it goes to the carrier or the
// attorney as-is. Deliberately plain — this is a record, not a brochure.

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function DealFilePage({ params }: { params: { id: string } }) {
  noStore();
  const accountId = currentAccountId();
  if (!accountId) notFound();

  const { data: referral } = await db()
    .from("referrals")
    .select("*, partners(name), partner_contacts(name, email), documents(kind, file_name, created_at, uploaded_by, purged_at, carrier_name, effective_start, effective_end)")
    .eq("id", params.id)
    .maybeSingle();
  if (!referral) notFound();

  // Team members share the owner's book.
  let owns = referral.account_id === accountId;
  if (!owns) {
    const { data: viewer } = await db().from("accounts").select("team_owner_id").eq("id", accountId).maybeSingle();
    owns = viewer?.team_owner_id === referral.account_id;
  }
  if (!owns) notFound();

  const [{ data: activity }, { data: messages }, { data: emails }] = await Promise.all([
    db().from("activity_log").select("event_type, detail, actor, created_at").eq("referral_id", params.id).order("created_at", { ascending: true }),
    db().from("messages").select("sender, body, created_at").eq("referral_id", params.id).order("created_at", { ascending: true }),
    db().from("email_log").select("kind, recipients, subject, sent, created_at").eq("referral_id", params.id).order("created_at", { ascending: true }),
  ]);

  const coverage = Array.isArray(referral.coverage_notes) ? referral.coverage_notes : [];
  const check = referral.doc_check;

  const Row = ({ label, value }: { label: string; value: any }) =>
    value ? (
      <tr>
        <td style={{ padding: "3px 12px 3px 0", color: "#555", whiteSpace: "nowrap", verticalAlign: "top" }}>{label}</td>
        <td style={{ padding: "3px 0" }}>{String(value)}</td>
      </tr>
    ) : null;

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", maxWidth: 760, margin: "0 auto", padding: 32, color: "#111", background: "#fff" }}>
      <PrintButton />

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Deal file — {referral.client_name}</h1>
      <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Complete record generated {fmt(new Date().toISOString())} · ReferBound
      </p>

      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>Referral</h2>
      <table style={{ fontSize: 13, marginTop: 8, width: "100%" }}>
        <tbody>
          <Row label="Client" value={referral.client_name} />
          <Row label="Co-borrower" value={referral.coborrower_name} />
          <Row label="Property" value={referral.property_address} />
          <Row label="Referred by" value={(referral as any).partners?.name} />
          <Row label="Sent by" value={(referral as any).partner_contacts?.name} />
          <Row label="Received" value={fmt(referral.created_at)} />
          <Row label="Closing date" value={referral.closing_date} />
          <Row label="Status" value={STATUS_LABELS[referral.status] ?? referral.status} />
          <Row label="Not-written reason" value={referral.lost_reason} />
          <Row label="Policy lines" value={referral.policy_lines} />
          <Row label="Premium" value={referral.premium ? `$${referral.premium}` : null} />
          <Row label="Notes" value={referral.notes} />
        </tbody>
      </table>

      {coverage.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
            Coverage recommendations
          </h2>
          <table style={{ fontSize: 13, marginTop: 8, width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {coverage.map((c: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap", color: "#555" }}>{fmt(c.at)}</td>
                  <td style={{ padding: "5px 12px 5px 0", fontWeight: 600 }}>{c.coverage}</td>
                  <td style={{ padding: "5px 0" }}>
                    {c.outcome === "declined" ? "Declined by client" : c.outcome === "accepted" ? "Accepted" : "Recommended"}
                    {c.note ? ` — ${c.note}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>Documents</h2>
      {(referral.documents ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: "#666" }}>None on file.</p>
      ) : (
        <table style={{ fontSize: 13, marginTop: 8, width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {(referral.documents ?? []).map((d: any, i: number) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap", color: "#555" }}>{fmt(d.created_at)}</td>
                <td style={{ padding: "5px 12px 5px 0" }}>{DOC_KINDS[d.kind] ?? d.kind}</td>
                <td style={{ padding: "5px 0" }}>
                  {d.file_name}
                  {d.uploaded_by === "partner" ? " (from partner)" : ""}
                  {d.purged_at ? " — source file removed for privacy" : ""}
                  {d.effective_end ? ` · expires ${d.effective_end}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {check && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
            Pre-delivery verification
          </h2>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Run {fmt(check.at)} · compared {(check.checkedDocs ?? []).join(", ")} against{" "}
            {(check.comparedAgainst ?? []).join(", ")}.{" "}
            {check.findings?.length === 0
              ? "No discrepancies found."
              : `${check.findings.length} item(s) flagged.`}
          </p>
          {(check.findings ?? []).map((f: any, i: number) => (
            <p key={i} style={{ fontSize: 13, margin: "4px 0 0 12px" }}>
              • [{f.severity}] {f.issue}
            </p>
          ))}
        </>
      )}

      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
        Communications
      </h2>
      <table style={{ fontSize: 13, marginTop: 8, width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {(emails ?? []).map((e, i) => (
            <tr key={`e${i}`} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap", color: "#555" }}>{fmt(e.created_at)}</td>
              <td style={{ padding: "5px 0" }}>
                Email {e.sent ? "sent" : "NOT sent"} to {(e.recipients ?? []).join(", ")} — {e.subject}
              </td>
            </tr>
          ))}
          {(messages ?? []).map((m, i) => (
            <tr key={`m${i}`} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "5px 12px 5px 0", whiteSpace: "nowrap", color: "#555" }}>{fmt(m.created_at)}</td>
              <td style={{ padding: "5px 0" }}>
                Message from {m.sender === "agent" ? "agent" : "partner"}: {m.body}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 24, borderBottom: "1px solid #ddd", paddingBottom: 4 }}>
        Full activity timeline
      </h2>
      <table style={{ fontSize: 12, marginTop: 8, width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {(activity ?? []).map((a, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "4px 12px 4px 0", whiteSpace: "nowrap", color: "#555" }}>{fmt(a.created_at)}</td>
              <td style={{ padding: "4px 12px 4px 0", color: "#555" }}>{a.actor}</td>
              <td style={{ padding: "4px 0" }}>{a.detail ?? a.event_type}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 11, color: "#888", marginTop: 28, borderTop: "1px solid #ddd", paddingTop: 8 }}>
        Generated by ReferBound from the account&apos;s own records. Timestamps are UTC-based server
        times recorded when each event occurred.
      </p>
    </main>
  );
}
